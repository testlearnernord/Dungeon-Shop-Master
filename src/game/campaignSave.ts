import { BASE_ROOM_HALF_EXTENT, isValidLevel5Room } from "./level5Room.ts";
import {isValidCellarRoom,cellarChestProblem,type CellarChestPlacement} from "./cellarRoom.ts";
import { ECONOMY, ITEMS,createEmptyShelfSlots,isMaterial,SHELF_GOODS,type MaterialItemId } from "./economy.ts";
import {
  SIMULATION_VERSION, type GameState, type EarlyDungeonFloorWorld,
} from "./gameState.ts";
import { validateBossReplay } from "./bossCombatReplay.ts";
import {liveBossCheckpointProblem} from "./liveBossSave.ts";
import {
  LEVEL7_STEP_BUDGET, LEVEL7_MAX_ENCOUNTERS, LEVEL7_COMBAT_SECONDS,
  getLevel7Progress, prepareSpatialDungeonCombat, chooseKnownReturnStep,
  type Level7World,
  type SpatialDungeonFloor,
} from "./level7Exploration.ts";
import { generateDungeonLayout, generateExpeditionLayout, tileAt } from "./dungeonLayout.ts";
import {isShelfId,MAX_SHOP_SHELVES,shopLayoutProblem,
  type ShelfPlacement,type ShopLayout} from "./shopLayout.ts";
import {rosterBoardProblem,type RosterBoardPlacement} from "./rosterBoardPlacement.ts";
import {wallPortraitProblem,type WallPortraitPlacement} from "./wallPortraitPlacement.ts";
import {bedroomFurnitureProblem,type BedroomFurniturePlacement} from "./bedroomFurniture.ts";
import { firstWorldTickOfDay,lastWorldTickOfDay,MAX_WORLD_DAY,
  MAX_PENDING_WORLD_EVENTS,compareScheduledWorldEvents,
  type ScheduledWorldEvent } from "./worldClock.ts";
import {SHOP_REQUEST_TICKS} from "./shopRuntime.ts";
import {validateShopTraffic} from "./shopTraffic.ts";
import {DUNGEON_STEP_INTERVAL_TICKS,DUNGEON_WORLD_EVENT_SUBJECT,
  LIVE_COMBAT_EVENT_SUBJECT,LIVE_COMBAT_INTERVAL_TICKS,
  SHOP_PORTAL_RETURN_PREFIX,SHOP_PORTAL_TRANSIT_TICKS} from "./liveDungeonRuntime.ts";
import {createGroupCombat,type GroupCombatOptions} from "./groupCombat.ts";
import {ghoulPackActorId,MAX_GHOUL_PACK} from "./ghoulPack.ts";
import {forecastShoppingIntents} from "./shopperIntents.ts";
import {containsReplay,MAX_SAVED_REPLAYS} from "./replayRetention.ts";

export const SAVE_SCHEMA_VERSION = 1;

export interface SaveEnvelope {
  readonly schemaVersion: 1;
  readonly simulationVersion: number;
  readonly savedAt: string;
  readonly payload: GameState;
}

type RecordValue = Record<string, unknown>;

function fail(path: string, reason: string): never {
  throw new Error(`Invalid campaign save: ${path} ${reason}.`);
}

function object(value: unknown, path: string, required: string[], optional: string[] = []): RecordValue {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(path, "must be an object");
  const record = value as RecordValue;
  for (const key of required) {
    if (!Object.hasOwn(record, key)) fail(`${path}.${key}`, "is required");
  }
  for (const key of Object.keys(record)) {
    if (!required.includes(key) && !optional.includes(key)) fail(`${path}.${key}`, "is not supported");
  }
  return record;
}

function integer(value: unknown, path: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    fail(path, `must be a safe integer between ${min} and ${max}`);
  }
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) fail(path, "must be a nonempty string");
  return value;
}

function choice(value: unknown, choices: readonly unknown[], path: string): void {
  if (!choices.includes(value)) fail(path, `must be one of ${choices.join(", ")}`);
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, "must be an array");
  return value;
}

function unique(value: string | number, seen: Set<string | number>, path: string): void {
  if (seen.has(value)) fail(path, "must be unique");
  seen.add(value);
}

const itemIds = ITEMS.map((item) => item.id);
const eventTypes = [
  "welcome", "day-started", "dungeon-outcome", "shop-arrival", "shop-stay", "shop-departure", "shop-walkout",
  "influx", "sale", "tip", "healed",
  "level6-departure", "level6-combat", "level6-return",
  "level7-departure", "level7-exploration", "shop-credit",
  "dungeon-exploration","dungeon-live","hero-death-signal",
  "temporary-party-join","temporary-party-leave","hero-buyback",
] as const;


/** Strict, bounded validation of the persisted world and read-only expedition records. */
function validNumber(value: unknown, path: string, low: number, high: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < low || value > high)
    fail(path,"must be a finite number within bounds");
  return value as number;
}
function validateLevel7World(
  raw: unknown, path: string, campaignSeed: number,
  heroIds: Set<string | number>, day: number, floor=7,
): void {
  const world=object(raw,path,["resolvedFeatureIds","heroes"],["siteCycles"]);
  const map=generateExpeditionLayout(campaignSeed,floor);
  const knownFeatures=new Set(map.features.map(f=>f.id));
  const resolved=new Set<string | number>();
  const entries=array(world.resolvedFeatureIds,path+".resolvedFeatureIds");
  if(entries.length>map.features.length)fail(path+".resolvedFeatureIds","is oversized");
  entries.forEach((value,i)=>{
    const id=text(value,path+".resolvedFeatureIds["+i+"]");
    if(!knownFeatures.has(id))fail(path+".resolvedFeatureIds["+i+"]","must refer to a real feature");
    unique(id,resolved,path+".resolvedFeatureIds["+i+"]");
  });
  if(world.siteCycles!==undefined){
    const sites=array(world.siteCycles,path+".siteCycles");
    if(sites.length>map.features.length)
      fail(path+".siteCycles","is oversized");
    const seenSites=new Set<string|number>();
    sites.forEach((value,i)=>{
      const item=path+".siteCycles["+i+"]";
      const site=object(value,item,["id","cycle","resolvedDay"]);
      const id=text(site.id,item+".id");
      if(!knownFeatures.has(id))fail(item+".id","must be a real ordinary feature");
      unique(id,seenSites,item+".id");
      integer(site.cycle,item+".cycle",0,100000);
      if(site.resolvedDay!==null)integer(site.resolvedDay,item+".resolvedDay",1,day);
      if((site.resolvedDay!==null)!==resolved.has(id))
        fail(item,"resolvedDay must agree with current generation resolution");
    });
  }
  const progress=array(world.heroes,path+".heroes");
  if(progress.length>100)fail(path+".heroes","is oversized");
  const seenHeroes=new Set<string | number>();
  progress.forEach((value,i)=>{
    const item=path+".heroes["+i+"]",hero=object(value,item,["heroId","x","z","visited"]);
    const id=text(hero.heroId,item+".heroId");
    if(!heroIds.has(id))fail(item+".heroId","is unknown");
    unique(id,seenHeroes,item+".heroId");
    const x=integer(hero.x,item+".x",0,map.width-1);
    const z=integer(hero.z,item+".z",0,map.height-1);
    if(tileAt(map,x,z)==="wall")fail(item,"must be on a walkable tile");
    const visited=array(hero.visited,item+".visited");
    if(visited.length<1||visited.length>map.width*map.height)
      fail(item+".visited","must have a bounded route");
    const visitedIds=new Set<string | number>();
    visited.forEach((value,n)=>{
      const idx=integer(value,item+".visited["+n+"]",0,map.tiles.length-1);
      if(map.tiles[idx]==="wall")fail(item+".visited["+n+"]","cannot include a wall");
      unique(idx,visitedIds,item+".visited["+n+"]");
    });
    if(!visitedIds.has(z*map.width+x))fail(item+".visited","must include current location");
    if(!visitedIds.has(map.entrance.z*map.width+map.entrance.x))
      fail(item+".visited","must include dungeon entrance");
  });
}
function validateLevel7Replay(
  raw: unknown, path: string, heroId: string, day: number,
  campaignSeed: number, expectedFloor=7,
  knownHeroIds?:ReadonlySet<string|number>,
): void {
  const record=object(raw,path,[
    "version","day","heroId","floor","appearance","steps","encounters","outcome",
  ],["knownAtStart","resolvedAtStart","partyMemberIds","partyAppearances"]);
  if(record.version!==1||record.floor!==expectedFloor||
     record.day!==day||record.heroId!==heroId)
    fail(path,"must match event day, hero and dungeon floor");
  choice(record.outcome,["exploring","retreat","death","completed"],path+".outcome");
  const appearance=object(record.appearance,path+".appearance",["role","equipment"]);
  choice(appearance.role,["tank","DPS","healer"],path+".appearance.role");
  const gear=object(appearance.equipment,path+".appearance.equipment",["weapon","armor"]);
  if(gear.weapon!==null && gear.weapon!=="Iron Sword")fail(path+".appearance.equipment.weapon","is not recognized");
  if(gear.armor!==null && gear.armor!=="Leather Vest")fail(path+".appearance.equipment.armor","is not recognized");
  if(record.partyMemberIds!==undefined){
    const ids=array(record.partyMemberIds,path+".partyMemberIds");
    if(ids.length<2||ids.length>3)
      fail(path+".partyMemberIds","must contain 2 or 3 real participants");
    const seenMembers=new Set<string|number>();
    ids.forEach((value,i)=>{
      const name=path+".partyMemberIds["+i+"]";
      const memberId=text(value,name);
      if(!/^adventurer-[1-9][0-9]*$/.test(memberId)||
        (knownHeroIds&&!knownHeroIds.has(memberId)))
        fail(name,"must be a real campaign adventurer");
      unique(memberId,seenMembers,name);
    });
    if(!seenMembers.has(heroId))
      fail(path+".partyMemberIds","must include this replay hero");
  }
  // New v1 footage can independently dress all actual co-travellers,
  // including days without any battle. Historical party IDs, not the
  // current roster, are the only authority for these visuals.
  if(record.partyAppearances!==undefined){
    if(record.partyMemberIds===undefined)
      fail(path+".partyAppearances","requires recorded party membership");
    const members=array(record.partyAppearances,path+".partyAppearances");
    const ids=array(record.partyMemberIds,path+".partyMemberIds");
    if(members.length!==ids.length)
      fail(path+".partyAppearances","must describe every recorded member");
    const seen=new Set<string|number>();
    members.forEach((rawMember,i)=>{
      const memberPath=path+".partyAppearances["+i+"]";
      const member=object(rawMember,memberPath,["id","role","equipment"]);
      const id=text(member.id,memberPath+".id");
      if(id!==ids[i])fail(memberPath+".id","must match historical member order");
      unique(id,seen,memberPath+".id");
      choice(member.role,["tank","DPS","healer"],memberPath+".role");
      const worn=object(member.equipment,memberPath+".equipment",
        ["weapon","armor"]);
      choice(worn.weapon,[null,"Iron Sword"],memberPath+".equipment.weapon");
      choice(worn.armor,[null,"Leather Vest"],memberPath+".equipment.armor");
      if(id===heroId&&(
        member.role!==appearance.role||
        worn.weapon!==gear.weapon||worn.armor!==gear.armor))
        fail(memberPath,"must match replay hero's own recorded appearance");
    });
  }
  const map=generateExpeditionLayout(campaignSeed,expectedFloor);
  const features=new Map(map.features.map(feature=>[feature.id,feature]));
  if(record.knownAtStart!==undefined){
    const initial=array(record.knownAtStart,path+".knownAtStart");
    if(initial.length<1||initial.length>map.width*map.height)
      fail(path+".knownAtStart","must have bounded visible tiles");
    const visited=new Set<string | number>();
    initial.forEach((rawIndex,i)=>{
      const cell=integer(rawIndex,path+".knownAtStart["+i+"]",0,map.tiles.length-1);
      if(map.tiles[cell]==="wall")fail(path+".knownAtStart["+i+"]","cannot contain a wall");
      unique(cell,visited,path+".knownAtStart["+i+"]");
    });
  }
  if(record.resolvedAtStart!==undefined){
    const ids=array(record.resolvedAtStart,path+".resolvedAtStart");
    if(ids.length>features.size)fail(path+".resolvedAtStart","must be bounded");
    const seen=new Set<string | number>();
    ids.forEach((value,i)=>{
      const id=text(value,path+".resolvedAtStart["+i+"]");
      if(!features.has(id))fail(path+".resolvedAtStart["+i+"]","must be an existing feature");
      unique(id,seen,path+".resolvedAtStart["+i+"]");
    });
  }
  const steps=array(record.steps,path+".steps");
  if(steps.length<1||steps.length>1+LEVEL7_STEP_BUDGET*3+3)
    fail(path+".steps","must have a bounded length");
  let lastT=-1,previous:{x:number;z:number}|null=null;
  steps.forEach((value,i)=>{
    const item=path+".steps["+i+"]";
    const step=object(value,item,["x","z","t","action","hp"],["featureId"]);
    const x=integer(step.x,item+".x",0,map.width-1),z=integer(step.z,item+".z",0,map.height-1);
    const t=validNumber(step.t,item+".t",0,LEVEL7_STEP_BUDGET+1);
    if(t<lastT)fail(item+".t","must be chronological");lastT=t;
    if(tileAt(map,x,z)==="wall")fail(item,"cannot occur on a wall");
    choice(step.action,["enter","walk","treasure","trap","combat",
      "defeat-monster","retreat","death","complete"],item+".action");
    integer(step.hp,item+".hp",0,100000);
    if(i===0 && step.action!=="enter")fail(item+".action","must begin at a recorded position");
    if(previous){
      const d=Math.abs(previous.x-x)+Math.abs(previous.z-z);
      if(step.action==="walk"?d!==1:d!==0)
        fail(item,"must reflect a real adjacent walk or an action at the current tile");
    }
    if(step.featureId!==undefined){
      const feature=features.get(text(step.featureId,item+".featureId"));
      if(!feature||feature.x!==x||feature.z!==z)fail(item+".featureId","must match this location");
    }
    previous={x,z};
  });
  const encounters=array(record.encounters,path+".encounters");
  if(encounters.length>LEVEL7_MAX_ENCOUNTERS)
    fail(path+".encounters","must contain only actual bounded day encounters");
  encounters.forEach((value,i)=>{
    const item=path+".encounters["+i+"]";
    const encounter=object(value,item,["featureId","x","z","combat"],["siteCycle"]);
    if(encounter.siteCycle!==undefined)
      integer(encounter.siteCycle,item+".siteCycle",0,100000);
    const feature=features.get(text(encounter.featureId,item+".featureId"));
    if(!feature||feature.kind!=="monster")fail(item+".featureId","must refer to a monster");
    if(encounter.x!==feature.x||encounter.z!==feature.z)
      fail(item,"must match monster spawn position");
    const combat=object(encounter.combat,item+".combat",[
      "version","actors","bounds","obstacles","frames","cues","outcome",
    ]);
    if(combat.version!==1)fail(item+".combat.version","is incompatible");
    choice(combat.outcome,["heroes","monsters","draw"],item+".combat.outcome");
    const actors=array(combat.actors,item+".combat.actors");
    // Historical two-actor replays remain valid. One real authored site
    // may contain up to three physically independent Ghoul combatants.
    if(actors.length<2||actors.length>6)
      fail(item+".combat.actors","must contain 1–3 heroes and 1–3 Ghouls");
    const actorIds=new Set<string | number>();
    let monsterCount=0,heroCount=0;
    actors.forEach((rawActor,j)=>{
      const a=item+".combat.actors["+j+"]",actor=object(rawActor,a,[
        "id","team","role","style","x","z","hp","maxHp","damage",
        "armor","speed","reach",
      ],["radius","healCharges","equipment","meleeAbility","specialAbility","agility",
        "grappleDamage","staggerThreshold"]);
      if(actor.meleeAbility!==undefined)
        choice(actor.meleeAbility,["heavy"],a+".meleeAbility");
      if(actor.specialAbility!==undefined)
        choice(actor.specialAbility,["grapple-throw"],a+".specialAbility");
      if(actor.agility!==undefined)
        validNumber(actor.agility,a+".agility",0,1000);
      if(actor.grappleDamage!==undefined)
        validNumber(actor.grappleDamage,a+".grappleDamage",1,10000);
      if(actor.staggerThreshold!==undefined)
        validNumber(actor.staggerThreshold,a+".staggerThreshold",0,10000);
      const id=text(actor.id,a+".id");unique(id,actorIds,a+".id");
      choice(actor.team,["heroes","monsters"],a+".team");
      choice(actor.role,["tank","DPS","healer","monster"],a+".role");
      if(actor.equipment!==undefined){
        if(actor.team!=="heroes"||actor.role==="monster")
          fail(a+".equipment","is valid only for real hero combatants");
        const gear=object(actor.equipment,a+".equipment",["weapon","armor"]);
        choice(gear.weapon,[null,"Iron Sword"],a+".equipment.weapon");
        choice(gear.armor,[null,"Leather Vest"],a+".equipment.armor");
      }
      if(actor.team==="monsters"){
        monsterCount++;
        if(actor.role!=="monster" ||
           !Array.from({length:MAX_GHOUL_PACK},(_,index)=>
             ghoulPackActorId(feature.id,index)).includes(id))
          fail(a,"only fighters of the real saved monster site can oppose the party");
      }else{
        heroCount++;
        if(actor.role==="monster"||!/^adventurer-[1-9][0-9]*$/.test(id))
          fail(a,"party members must be canonical adventurer heroes");
      }
      choice(actor.style,["melee","ranged"],a+".style");
      for(const key of ["x","z","hp","maxHp","damage","armor","speed","reach"])
        validNumber(actor[key],a+"."+key,-10000,100000);
      if(actor.radius!==undefined)validNumber(actor.radius,a+".radius",0.1,3);
      if(actor.healCharges!==undefined)integer(actor.healCharges,a+".healCharges",0,10);
      if(actor.magicHeals!==undefined){
        if(actor.role!=="healer")fail(a+".magicHeals","requires healer");
        integer(actor.magicHeals,a+".magicHeals",0,10);
      }
    });
    if(heroCount<1||heroCount>3||
       monsterCount<1||monsterCount>MAX_GHOUL_PACK||
       heroCount+monsterCount!==actors.length||
       !actorIds.has(heroId)||
       Array.from({length:monsterCount},(_,index)=>
         ghoulPackActorId(feature.id,index)).some(id=>!actorIds.has(id)))
      fail(item+".combat.actors",
        "must include the lead hero and a contiguous real site Ghoul pack");
    const bounds=object(combat.bounds,item+".combat.bounds",["minX","maxX","minZ","maxZ"]);
    for(const key of ["minX","maxX","minZ","maxZ"])
      validNumber(bounds[key],item+".combat.bounds."+key,-10000,10000);
    const obstacles=array(combat.obstacles,item+".combat.obstacles");
    if(obstacles.length>50)fail(item+".combat.obstacles","is oversized");
    obstacles.forEach((o,j)=>{
      const ob=object(o,item+".combat.obstacles["+j+"]",["id","minX","maxX","minZ","maxZ"]);
      text(ob.id,item+".combat.obstacles["+j+"].id");
    });
    const frames=array(combat.frames,item+".combat.frames");
    if(frames.length<1||frames.length>LEVEL7_STEP_BUDGET*20)
      fail(item+".combat.frames","must contain bounded frames");
    let lastFrame=-1;
    frames.forEach((f,j)=>{
      const fp=item+".combat.frames["+j+"]";
      const frame=object(f,fp,["t","actors","projectiles"]);
      const t=validNumber(frame.t,fp+".t",0,26);
      if(t<lastFrame)fail(fp+".t","must be chronological");lastFrame=t;
      const snapshots=array(frame.actors,fp+".actors");
      if(snapshots.length!==actors.length)
        fail(fp+".actors","must match every recorded combatant");
      const frameIds=new Set<string | number>();
      snapshots.forEach((a,k)=>{
        const ap=fp+".actors["+k+"]";
        const snapshot=object(a,ap,["id","x","z","hp","stamina","heading","phase"],["ability"]);
        if(snapshot.ability!==undefined)
          choice(snapshot.ability,["troll-smash","troll-slam","grapple"],ap+".ability");
        if(!actorIds.has(snapshot.id as string))
          fail(ap+".id","must match a combat actor");
        unique(snapshot.id as string,frameIds,ap+".id");
        for(const key of ["x","z","hp","stamina","heading"])
          validNumber(snapshot[key],ap+"."+key,-10000,100000);
        choice(snapshot.phase,["move","windup","strike","recover","cast",
          "heal","roll","parry","hurt","dead",
          "grab","grabMiss","throw","grabbed","thrown"],ap+".phase");
      });
      if(frameIds.size!==actorIds.size)
        fail(fp+".actors","must include all real fighters exactly once");
      const projectiles=array(frame.projectiles,fp+".projectiles");
      if(projectiles.length>30)fail(fp+".projectiles","is oversized");
      projectiles.forEach((p,k)=>{
        const pp=fp+".projectiles["+k+"]",proj=object(p,pp,["ownerId","x","z"]);
        if(!actorIds.has(proj.ownerId as string))fail(pp+".ownerId","is unknown");
        validNumber(proj.x,pp+".x",-10000,10000);validNumber(proj.z,pp+".z",-10000,10000);
      });
    });
    const cues=array(combat.cues,item+".combat.cues");
    if(cues.length>2000)fail(item+".combat.cues","is oversized");
    cues.forEach((c,j)=>{
      const cp=item+".combat.cues["+j+"]",cue=object(c,cp,["t","actorId","kind"],["targetId","amount"]);
      if(!actorIds.has(cue.actorId as string))fail(cp+".actorId","is unknown");
      if(cue.targetId!==undefined && !actorIds.has(cue.targetId as string))
        fail(cp+".targetId","is unknown");
      choice(cue.kind,["attack","cast","projectile","hit","miss","dodge",
        "parry","heal","death","blocked",
        "grab","throw","landing","escape","lava"],cp+".kind");
      validNumber(cue.t,cp+".t",0,26);
      if(cue.amount!==undefined)validNumber(cue.amount,cp+".amount",0,100000);
    });
  });
}

/** Strict v19 validation for intermediate 60Hz actor state. Do not accept
 * a synthesized fight, stale site lock, invented equipment or a second
 * scheduler. Current actors are derived from one canonical seeded encounter.
 */
function validateLiveCombatCheckpoints(
  state:RecordValue,rawCombats:unknown[],day:number,clockTick:number,
  lastStepTick:number,combatTick:number,bossActive=false,
):void{
  const path="payload.liveDungeon";
  if(rawCombats.length===0){
    if(combatTick!==0&&!bossActive)
      fail(path+".combatTick","must be zero without active combat");
    return;
  }
  if(combatTick<lastStepTick||combatTick>clockTick)
    fail(path+".combatTick","does not follow the active expedition step");
  const known=new Set<string|number>();
  const sites=new Set<string|number>();
  for(const [index,raw] of rawCombats.entries()){
    const cp=path+".combats["+index+"]";
    const battle=object(raw,cp,[
      "id","startedTick","encounter","heroIds","arrivals","state","frames",
    ]);
    const started=integer(battle.startedTick,cp+".startedTick",
      firstWorldTickOfDay(day),lastStepTick);
    if(started!==lastStepTick||
      (combatTick-started)%LIVE_COMBAT_INTERVAL_TICKS!==0)
      fail(cp+".startedTick","must equal this movement's last committed tick");
    const encounter=object(battle.encounter,cp+".encounter",[
      "featureId","floor","x","z","siteCycle","elite","options",
    ]);
    choice(encounter.floor,[1,2,3,4,7],cp+".encounter.floor");
    const floor=encounter.floor as number;
    const featureId=text(encounter.featureId,cp+".encounter.featureId");
    const layout=generateExpeditionLayout(state.seed as number,
      floor as SpatialDungeonFloor);
    const feature=layout.features.find(f=>f.id===featureId&&f.kind==="monster");
    if(!feature||feature.x!==encounter.x||feature.z!==encounter.z)
      fail(cp+".encounter","must identify one real reached monster tile");
    const cycle=integer(encounter.siteCycle,cp+".encounter.siteCycle",0,100000);
    if(typeof encounter.elite!=="boolean")
      fail(cp+".encounter.elite","must be boolean");
    unique(floor+":"+featureId,sites,cp+".encounter.featureId");
    if(battle.id!=="battle:"+day+":"+started+":"+floor+":"+featureId)
      fail(cp+".id","must be the canonical live battle identity");

    const roster=array(state.adventurers,cp+".adventurers") as RecordValue[];
    const heroIds=array(battle.heroIds,cp+".heroIds");
    if(heroIds.length<1||heroIds.length>3)fail(cp+".heroIds","requires 1–3 heroes");
    const members:GameState["adventurers"][number][]=[];
    heroIds.forEach((rawId,i)=>{
      const id=text(rawId,cp+".heroIds["+i+"]");
      unique(id,known,cp+".heroIds["+i+"]");
      const hero=roster.find(h=>h.id===id) as GameState["adventurers"][number]|undefined;
      if(!hero||hero.floor!==floor||hero.health<=0||
        hero.status!==(floor===7?"expedition":"exploring"))
        fail(cp+".heroIds["+i+"]","must identify a living co-located explorer");
      members.push(hero);
    });
    const world:Level7World=floor===7?
      state.level7World as Level7World:
      ((state.earlyDungeonWorlds as {floor:number;world:Level7World}[]|undefined)
        ?.find(entry=>entry.floor===floor)?.world??{heroes:[],resolvedFeatureIds:[]});
    if(world.resolvedFeatureIds.includes(featureId)||
      (world.siteCycles?.find(x=>x.id===featureId)?.cycle??0)!==cycle)
      fail(cp+".encounter.siteCycle","cannot reserve a resolved or regenerated site");
    for(const member of members){
      const progress=world.heroes.find(h=>h.heroId===member.id);
      if(!progress||progress.x!==feature.x||progress.z!==feature.z)
        fail(cp+".heroIds","must actually occupy the monster's tile");
    }
    const arrivals=array(battle.arrivals,cp+".arrivals");
    if(arrivals.length!==members.length)
      fail(cp+".arrivals","must retain each real party member's approach");
    arrivals.forEach((rawArrival,i)=>{
      const ap=cp+".arrivals["+i+"]";
      validateLevel7Replay(rawArrival,ap,members[i].id,day,
        state.seed as number,floor,new Set(roster.map(x=>x.id as string)));
      const r=rawArrival as RecordValue;
      const steps=r.steps as {x:number;z:number;action:string;featureId?:string}[];
      const tail=steps[steps.length-1];
      if(r.outcome!=="exploring"||(r.encounters as unknown[]).length||
        !tail||tail.action!=="combat"||tail.featureId!==featureId||
        tail.x!==feature.x||tail.z!==feature.z)
        fail(ap,"must be an unresolved real monster approach");
    });

    const options=object(encounter.options,cp+".encounter.options",[
      "actors","bounds","obstacles",
    ],["environment","tacticsSeed"]);
    if(options.environment!==undefined)
      choice(options.environment,["cave-lava"],cp+".encounter.options.environment");
    if(options.tacticsSeed!==undefined)
      integer(options.tacticsSeed,cp+".encounter.options.tacticsSeed",0,0xffffffff);
    const specs=array(options.actors,cp+".encounter.options.actors");
    if(specs.length<members.length+1||
       specs.length>members.length+MAX_GHOUL_PACK)
      fail(cp+".encounter.options.actors",
        "must match this party and its real site Ghoul pack");
    specs.forEach((rawSpec,i)=>{
      const sp=cp+".encounter.options.actors["+i+"]";
      const spec=object(rawSpec,sp,[
        "id","team","role","style","x","z","hp","maxHp","damage",
        "armor","speed","reach",
      ],["radius","healCharges","magicHeals","equipment","meleeAbility","specialAbility",
        "agility","grappleDamage","staggerThreshold"]);
      text(spec.id,sp+".id");
    });
    const bounds=object(options.bounds,cp+".encounter.options.bounds",
      ["minX","maxX","minZ","maxZ"]);
    for(const key of ["minX","maxX","minZ","maxZ"])
      validNumber(bounds[key],cp+".encounter.options.bounds."+key,-10000,10000);
    const obstacles=array(options.obstacles,cp+".encounter.options.obstacles");
    if(obstacles.length>50)fail(cp+".encounter.options.obstacles","is oversized");
    obstacles.forEach((rawObstacle,i)=>{
      const op=cp+".encounter.options.obstacles["+i+"]";
      const obstacle=object(rawObstacle,op,["id","minX","maxX","minZ","maxZ"]);
      text(obstacle.id,op+".id");
      for(const key of ["minX","maxX","minZ","maxZ"])
        validNumber(obstacle[key],op+"."+key,-10000,10000);
    });
    const initialApproach=(arrivals[0] as {steps:{x:number;z:number}[]}).steps[0];
    const liveCanonical=prepareSpatialDungeonCombat(members,feature!,
      layout.seed,layout,initialApproach,cycle,true);
    const legacyCanonical=prepareSpatialDungeonCombat(members,feature!,
      layout.seed,layout,initialApproach,cycle,false);
    // Existing in-progress single-Ghoul saves remain valid; newly reserved
    // LIVE pack sites must exactly match their seeded, physical actor roster.
    if(![liveCanonical,legacyCanonical].some(canonical=>
      canonical.elite===encounter.elite&&
      JSON.stringify(canonical.options)===JSON.stringify(options)))
      fail(cp+".encounter.options",
        "must match a seeded LIVE pack or historical single Ghoul stats");
    let initial;
    try {initial=createGroupCombat(options as unknown as GroupCombatOptions);}
    catch {fail(cp+".encounter.options","is not a valid group combat");}

    const combat=object(battle.state,cp+".state",[
      "actors","bounds","obstacles","projectiles","events","time","outcome",
    ],["environment","tacticsSeed"]);
    if(combat.environment!==initial.environment||
       combat.tacticsSeed!==initial.tacticsSeed)
      fail(cp+".state.environment","must match the real encounter rules");
    if(combat.tacticsSeed!==undefined)
      integer(combat.tacticsSeed,cp+".state.tacticsSeed",0,0xffffffff);
    if(combat.outcome!=="fighting")fail(cp+".state.outcome","must still be active");
    const completed=(combatTick-started)*3;
    const time=validNumber(combat.time,cp+".state.time",0,LEVEL7_COMBAT_SECONDS);
    if(Math.abs(time*60-completed)>0.001||
      completed>=LEVEL7_COMBAT_SECONDS*60)
      fail(cp+".state.time","must match committed 60Hz world-clock steps");
    if(JSON.stringify(combat.bounds)!==JSON.stringify(initial.bounds)||
      JSON.stringify(combat.obstacles)!==JSON.stringify(initial.obstacles))
      fail(cp+".state.bounds","must preserve the original real arena");
    const actors=array(combat.actors,cp+".state.actors");
    if(actors.length!==initial.actors.length)
      fail(cp+".state.actors","must retain every original fighter");
    const actorIds=new Set(initial.actors.map(a=>a.id));
    actors.forEach((rawActor,i)=>{
      const ap=cp+".state.actors["+i+"]";
      const a=object(rawActor,ap,[
        "id","team","role","style","maxHp","damage","armor","speed",
        "reach","radius","meleeAbility","agility","grappleDamage",
        "staggerThreshold","attacksStarted","activeMeleeAbility",
        "grappleTargetId","grabbedById","throwVelocity","x","z",
        "hp","stamina","heading","lockedHeading","phase","phaseAge",
        "cooldown","applied","targetId","rollX","rollZ",
        "healCharges","distanceTraveled",
      ],["specialAbility","magicHeals"]);
      const original=initial.actors[i];
      for(const key of ["id","team","role","style","maxHp","damage",
        "armor","speed","reach","radius","meleeAbility","agility",
        "grappleDamage","staggerThreshold","specialAbility"])
        if(a[key]!==original[key as keyof typeof original])
          fail(ap+"."+key,"must match the seeded fighter");
      for(const key of ["x","z","hp","stamina","heading","lockedHeading",
        "phaseAge","cooldown","rollX","rollZ","distanceTraveled"])
        validNumber(a[key],ap+"."+key,-10000,100000);
      if((a.hp as number)<0||(a.hp as number)>(a.maxHp as number)||
        (a.stamina as number)<0||(a.stamina as number)>100)
        fail(ap+".hp","must retain bounded genuine vitality");
      integer(a.attacksStarted,ap+".attacksStarted",0,10000);
      integer(a.healCharges,ap+".healCharges",0,10);
      if(a.magicHeals!==undefined)integer(a.magicHeals,ap+".magicHeals",0,10);
      if(typeof a.applied!=="boolean")fail(ap+".applied","must be boolean");
      choice(a.phase,["move","windup","strike","recover","cast","heal",
        "roll","parry","hurt","dead","grab","grabMiss","throw",
        "grabbed","thrown"],ap+".phase");
      choice(a.activeMeleeAbility,
        ["ordinary","heavy","grapple","troll-smash","troll-slam"],
        ap+".activeMeleeAbility");
      // Old ordinary monster and historical v1 saves still load. Only a
      // genuine boss archetype may store the two newly shared signature
      // strikes; never accept made-up Troll powers on a Ghoul.
      if((a.activeMeleeAbility==="troll-smash"||
          a.activeMeleeAbility==="troll-slam")&&
          a.specialAbility!=="grapple-throw")
        fail(ap+".activeMeleeAbility","requires the real boss archetype");
      for(const key of ["targetId","grappleTargetId","grabbedById"])
        if(a[key]!==null&&!actorIds.has(a[key] as string))
          fail(ap+"."+key,"must reference an actual fighter");
      const velocity=object(a.throwVelocity,ap+".throwVelocity",["x","z"]);
      validNumber(velocity.x,ap+".throwVelocity.x",-10000,10000);
      validNumber(velocity.z,ap+".throwVelocity.z",-10000,10000);
    });
    const projectiles=array(combat.projectiles,cp+".state.projectiles");
    if(projectiles.length>30)fail(cp+".state.projectiles","is oversized");
    projectiles.forEach((rawProjectile,i)=>{
      const pp=cp+".state.projectiles["+i+"]";
      const p=object(rawProjectile,pp,[
        "ownerId","team","x","z","vx","vz","damage","ttl",
      ]);
      if(!actorIds.has(p.ownerId as string))fail(pp+".ownerId","is unknown");
      choice(p.team,["heroes","monsters"],pp+".team");
      for(const key of ["x","z","vx","vz","damage","ttl"])
        validNumber(p[key],pp+"."+key,-10000,100000);
    });
    const cues=array(combat.events,cp+".state.events");
    if(cues.length>2000)fail(cp+".state.events","is oversized");
    cues.forEach((rawCue,i)=>{
      const qp=cp+".state.events["+i+"]";
      const cue=object(rawCue,qp,["t","actorId","kind"],["targetId","amount"]);
      if(!actorIds.has(cue.actorId as string)||(
        cue.targetId!==undefined&&!actorIds.has(cue.targetId as string)))
        fail(qp+".actorId","must reference existing fighters");
      choice(cue.kind,["attack","cast","projectile","hit","miss","dodge",
        "parry","heal","death","blocked","grab","throw","landing","escape","lava"],qp+".kind");
      validNumber(cue.t,qp+".t",0,26);
      if(cue.amount!==undefined)validNumber(cue.amount,qp+".amount",0,100000);
    });
    const frames=array(battle.frames,cp+".frames");
    if(frames.length!==1+completed/6||frames.length>252)
      fail(cp+".frames","must contain precisely the captured 10Hz frames");
    let previousTime=-1;
    frames.forEach((rawFrame,i)=>{
      const fp=cp+".frames["+i+"]";
      const frame=object(rawFrame,fp,["t","actors","projectiles"]);
      const t=validNumber(frame.t,fp+".t",0,26);
      if(t<previousTime)fail(fp+".t","must be chronological");
      previousTime=t;
      const snapshots=array(frame.actors,fp+".actors");
      if(snapshots.length!==actors.length)fail(fp+".actors","must retain all fighters");
      snapshots.forEach((rawSnapshot,j)=>{
        const sp=fp+".actors["+j+"]";
        const snapshot=object(rawSnapshot,sp,["id","x","z","hp","stamina","heading","phase"],["ability"]);
        if(snapshot.ability!==undefined)
          choice(snapshot.ability,["troll-smash","troll-slam","grapple"],sp+".ability");
        if(snapshot.id!==(actors[j] as RecordValue).id)
          fail(sp+".id","must match the live actor order");
        for(const key of ["x","z","hp","stamina","heading"])
          validNumber(snapshot[key],sp+"."+key,-10000,100000);
        choice(snapshot.phase,["move","windup","strike","recover","cast",
          "heal","roll","parry","hurt","dead","grab","grabMiss",
          "throw","grabbed","thrown"],sp+".phase");
      });
      const shots=array(frame.projectiles,fp+".projectiles");
      if(shots.length>30)fail(fp+".projectiles","is oversized");
      shots.forEach((rawShot,j)=>{
        const sp=fp+".projectiles["+j+"]";
        const shot=object(rawShot,sp,["ownerId","x","z"]);
        if(!actorIds.has(shot.ownerId as string))fail(sp+".ownerId","is unknown");
        validNumber(shot.x,sp+".x",-10000,10000);
        validNumber(shot.z,sp+".z",-10000,10000);
      });
    });
  }
}

/** LIVE individual AI intentions must point to existing active explorers,
 * never invent a hero or a goal that the saved autonomous policy cannot emit.
 * Decision timestamps are historical monotonic checkpoints, not scheduled
 * extra events or player-issued movement instructions.
 */
function validateLivePlans(
  state:RecordValue,rawPlans:unknown[],clockTick:number,enabled:boolean,
):void {
  const ids=new Set<string|number>();
  const roster=array(state.adventurers,"payload.adventurers") as RecordValue[];
  for(const [index,raw] of rawPlans.entries()){
    const path="payload.liveDungeon.plans["+index+"]";
    const plan=object(raw,path,["heroId","floor","goal","action","updatedTick"]);
    const id=text(plan.heroId,path+".heroId");
    unique(id,ids,path+".heroId");
    choice(plan.floor,[1,2,3,4,7],path+".floor");
    choice(plan.goal,["farm","progress","test-gear","caution","resupply",
      "loot-chest","hunt-ghouls"],
      path+".goal");
    choice(plan.action,["stay","ascend","descend","shop"],path+".action");
    integer(plan.updatedTick,path+".updatedTick",0,clockTick);
    const hero=roster.find(h=>h.id===id);
    if(!enabled||!hero||hero.health===0||hero.floor!==plan.floor||
      hero.status!==(plan.floor===7?"expedition":"exploring"))
      fail(path+".heroId","must name a living committed explorer on the recorded floor");
    if((plan.action==="ascend"&&(plan.floor as number)<=1)||
      (plan.action==="descend"&&(plan.floor as number)>=4))
      fail(path+".action","must be an authored adjacent early-floor transition");
    if(plan.floor===7&&plan.action!=="shop"&&plan.action!=="stay")
      fail(path+".action","cannot invent an unauthored deeper floor");
  }
}

/** The only authority for a same-day shop arrival is a real
 * traversed dungeon entrance and an exactly scheduled portal crossing.
 * A forged traveling status cannot turn into a phantom merchant customer.
 */
function validateLivePortalReturns(
  state:RecordValue,journeys:unknown[],pending:unknown[],
  clockTick:number,enabled:boolean,
):void{
  const records=array(state.adventurers,"payload.adventurers") as RecordValue[];
  const indexed=new Set<string|number>(),portalSubjects=new Set<string>();
  for(const [i,raw] of journeys.entries()){
    const path="payload.liveDungeon.returns["+i+"]";
    const journey=object(raw,path,["heroId","fromFloor","startedTick","phase"],
      ["dueTick"]);
    const heroId=text(journey.heroId,path+".heroId");
    unique(heroId,indexed,path+".heroId");
    choice(journey.fromFloor,[1,2,3,4,6,7],path+".fromFloor");
    const floor=journey.fromFloor as number;
    const started=integer(journey.startedTick,path+".startedTick",0,clockTick);
    choice(journey.phase,["backtrack","portal"],path+".phase");
    const hero=records.find(r=>r.id===heroId);
    if(!enabled||!hero||hero.health===0)
      fail(path+".heroId","must identify one live returning hero");
    if(journey.phase==="portal"){
      // A normal-floor portal can only be triggered from the known real
      // entrance tile. The saved last location is intentionally retained
      // until the portal event resolves; a bare fabricated timer is not enough.
      if(floor!==6){
        const world:Level7World=floor===7?
          state.level7World as Level7World:
          ((state.earlyDungeonWorlds as {floor:number;world:Level7World}[]|undefined)
            ?.find(w=>w.floor===floor)?.world??{heroes:[],resolvedFeatureIds:[]});
        const progress=world.heroes.find(p=>p.heroId===heroId);
        const entrance=generateExpeditionLayout(state.seed as number,floor).entrance;
        if(!progress||progress.x!==entrance.x||progress.z!==entrance.z)
          fail(path+".phase","portal traveler must have reached the real floor entrance");
      }
      const due=integer(journey.dueTick,path+".dueTick",
        clockTick+1,Number.MAX_SAFE_INTEGER);
      if(due!==started+SHOP_PORTAL_TRANSIT_TICKS||
        hero.status!=="traveling"||hero.floor!==4)
        fail(path,"must be an actual timed portal arrival");
      portalSubjects.add(SHOP_PORTAL_RETURN_PREFIX+heroId);
      const scheduled=pending.filter(rawEvent=>{
        const e=rawEvent as RecordValue;
        return e.lane==="report"&&e.subjectId===SHOP_PORTAL_RETURN_PREFIX+heroId;
      }) as RecordValue[];
      if(scheduled.length!==1||scheduled[0].dueTick!==due)
        fail(path+".dueTick","must own exactly one scheduled portal event");
    }else{
      if(journey.dueTick!==undefined)
        fail(path+".dueTick","is only allowed during portal transit");
      if(![1,2,3,4,7].includes(floor)||
        hero.floor!==floor||
        hero.status!==(floor===7?"expedition":"exploring"))
        fail(path,"must backtrack on the real hero floor");
      const world:Level7World=floor===7?
        state.level7World as Level7World:
        ((state.earlyDungeonWorlds as {floor:number;world:Level7World}[]|undefined)
          ?.find(w=>w.floor===floor)?.world??{heroes:[],resolvedFeatureIds:[]});
      const progress=world.heroes.find(p=>p.heroId===heroId);
      if(!progress)
        fail(path+".heroId","must have an actual saved dungeon location");
      try {
        chooseKnownReturnStep(generateExpeditionLayout(
          state.seed as number,floor),progress);
      } catch {
        fail(path+".heroId","must have a fully connected known route home");
      }
    }
  }
  const reports=pending.filter(raw=>{
    const event=raw as RecordValue;
    return event.lane==="report";
  }) as RecordValue[];
  if(reports.length!==portalSubjects.size||reports.some(e=>
    !portalSubjects.has(e.subjectId as string)))
    fail("payload.worldClock.pending","has an orphaned portal/report event");
  const travelers=records.filter(hero=>hero.status==="traveling");
  if(enabled&&travelers.some(hero=>!journeys.some(raw=>{
    const j=raw as RecordValue;
    return j.heroId===hero.id&&j.phase==="portal";
  })))
    fail("payload.liveDungeon.returns","must account for every live portal traveler");
}

function validateState(value: unknown): asserts value is GameState {
  const state = object(value, "payload", [
    "day", "worldClock", "shopRequests", "shopTraffic", "liveDungeon", "simulationVersion", "events", "savedReplayIds", "adventurers", "shopEconomy", "dungeonFloors",
    "seed", "rngState", "populationConfig", "nextAdventurerId",
    "level7World", "shopLayout", "shopCarts", "shopDebts",
    "level5Room","bedroomFurniture","rosterBoard",
    "cellarRoom","cellarChest","cellarDoorOpen","cellarFishCaught",
  ], ["wallPortrait","earlyDungeonWorlds","dungeonParties"]);
  const room=state.level5Room;
  if (!isValidLevel5Room(room))
    fail("payload.level5Room", "has invalid excavation geometry");
  if(!isValidCellarRoom(state.cellarRoom))
    fail("payload.cellarRoom","has invalid cellar excavation geometry");
  integer(state.cellarFishCaught,"payload.cellarFishCaught",0,1000000);
  if(typeof state.cellarDoorOpen!=="boolean")
    fail("payload.cellarDoorOpen","must be a boolean");
  {
    const raw=object(state.cellarChest,"payload.cellarChest",
      ["id","x","z","rotation"]);
    if(raw.id!=="cellar-chest")fail("payload.cellarChest.id","is invalid");
    const chest:CellarChestPlacement={
      id:"cellar-chest",
      x:validNumber(raw.x,"payload.cellarChest.x",-14,14),
      z:validNumber(raw.z,"payload.cellarChest.z",-41,-13),
      rotation:integer(raw.rotation,"payload.cellarChest.rotation",0,3) as 0|1|2|3,
    };
    const problem=cellarChestProblem(chest,state.cellarRoom);
    if(problem)fail("payload.cellarChest",problem);
  }
  const day = integer(state.day, "payload.day", 1, MAX_WORLD_DAY);
  const clock=object(state.worldClock,"payload.worldClock",["tick","nextSequence","pending"]);
  const clockTick=integer(clock.tick,"payload.worldClock.tick",
    firstWorldTickOfDay(day),lastWorldTickOfDay(day));
  const nextSequence=integer(clock.nextSequence,"payload.worldClock.nextSequence",1);
  const pending=array(clock.pending,"payload.worldClock.pending");
  if(pending.length>MAX_PENDING_WORLD_EVENTS)
    fail("payload.worldClock.pending","is oversized");
  const ids=new Set<string|number>();
  let previous:ScheduledWorldEvent|null=null;
  for(const [i,value] of pending.entries()){
    const path="payload.worldClock.pending["+i+"]";
    const entry=object(value,path,["id","dueTick","lane","subjectId","sequence"]);
    const seq=integer(entry.sequence,path+".sequence",1,nextSequence-1);
    const id=text(entry.id,path+".id");
    if(id!=="clock-"+seq)fail(path+".id","must match sequence");
    unique(id,ids,path+".id");
    integer(entry.dueTick,path+".dueTick",clockTick+1);
    choice(entry.lane,["shop-command","visitor","expedition","regeneration","report"],path+".lane");
    if(text(entry.subjectId,path+".subjectId").length>120)
      fail(path+".subjectId","is too long");
    const scheduled=entry as unknown as ScheduledWorldEvent;
    if(previous&&compareScheduledWorldEvents(previous,scheduled)>0)
      fail(path,"must retain due-tick, priority and sequence order");
    previous=scheduled;
  }
  if (state.simulationVersion !== SIMULATION_VERSION) fail("payload.simulationVersion", "is incompatible");
  {
    const live=object(state.liveDungeon,"payload.liveDungeon",
      ["enabled","lastStepTick","heroes","combatTick","combats","returns","plans"],
      ["bossCombat"]);
    if(typeof live.enabled!=="boolean")
      fail("payload.liveDungeon.enabled","must be boolean");
    const last=integer(live.lastStepTick,"payload.liveDungeon.lastStepTick",0,clockTick);
    const progress=array(live.heroes,"payload.liveDungeon.heroes");
    if(progress.length>100)fail("payload.liveDungeon.heroes","is oversized");
    const seenHeroes=new Set<string|number>();
    for(const [i,raw] of progress.entries()){
      const path="payload.liveDungeon.heroes["+i+"]";
      const hero=object(raw,path,["heroId","steps","finished"]);
      unique(text(hero.heroId,path+".heroId"),seenHeroes,path+".heroId");
      integer(hero.steps,path+".steps",1,100000);
      if(typeof hero.finished!=="boolean")fail(path+".finished","must be boolean");
    }
    const combatTick=integer(live.combatTick,
      "payload.liveDungeon.combatTick",0,clockTick);
    const combats=array(live.combats,"payload.liveDungeon.combats");
    if(combats.length>100)fail("payload.liveDungeon.combats","is oversized");
    const boss=live.bossCombat??null;
    if(boss&&combats.some(raw=>Array.isArray((raw as RecordValue).heroIds)&&
        ((raw as RecordValue).heroIds as unknown[]).includes(
          (boss as RecordValue).heroId)))
      fail("payload.liveDungeon.bossCombat","cannot duplicate a normal combat participant");
    const returning=array(live.returns,"payload.liveDungeon.returns");
    if(returning.length>100)fail("payload.liveDungeon.returns","is oversized");
    const plans=array(live.plans,"payload.liveDungeon.plans");
    if(plans.length>100)fail("payload.liveDungeon.plans","is oversized");
    validateLivePlans(state,plans,clockTick,!!live.enabled);
    const dungeonEvents=pending.filter(raw=>
      (raw as RecordValue).lane==="expedition").map(raw=>raw as RecordValue);
    const movements=dungeonEvents.filter(e=>
      e.subjectId===DUNGEON_WORLD_EVENT_SUBJECT);
    const fights=dungeonEvents.filter(e=>
      e.subjectId===LIVE_COMBAT_EVENT_SUBJECT);
    if(!live.enabled){
      if(last!==0||progress.length||dungeonEvents.length||
        combatTick!==0||combats.length||boss||returning.length||plans.length)
        fail("payload.liveDungeon","legacy mode cannot have scheduled dungeon work");
    }else{
      if(last<firstWorldTickOfDay(day))
        fail("payload.liveDungeon.lastStepTick","is from an earlier world day");
      const due=last+DUNGEON_STEP_INTERVAL_TICKS;
      if(movements.length!==(due<=lastWorldTickOfDay(day)?1:0)||
         movements.some(e=>e.dueTick!==due)||
         fights.length!==(combats.length||boss?1:0)||
         fights.some(e=>e.dueTick!==combatTick+LIVE_COMBAT_INTERVAL_TICKS)||
         dungeonEvents.length!==movements.length+fights.length)
        fail("payload.liveDungeon","must own its exact next movement and combat ticks");
    }
    validateLiveCombatCheckpoints(state,combats,day,clockTick,last,combatTick,!!boss);
    const bossProblem=liveBossCheckpointProblem(
      state as unknown as GameState,boss,combatTick,last);
    if(bossProblem)fail("payload.liveDungeon.bossCombat",bossProblem);
    validateLivePortalReturns(state,returning,pending,clockTick,!!live.enabled);
  }
  const shopRequests=array(state.shopRequests,"payload.shopRequests");
  if(shopRequests.length>100)fail("payload.shopRequests","is oversized");
  const requestHeroes=new Set<string|number>();
  const pendingById=new Map(pending.map(entry=>[String((entry as RecordValue).id),entry as RecordValue]));
  for(const [i,value] of shopRequests.entries()){
    const path="payload.shopRequests["+i+"]";
    const entry=object(value,path,["heroId","reason","itemId","startedTick","dueTick","eventId"]);
    const heroId=text(entry.heroId,path+".heroId");
    unique(heroId,requestHeroes,path+".heroId");
    const hero=(state.adventurers as RecordValue[]).find(h=>h.id===heroId);
    if(!hero||hero.status!=="at-shop"||
      typeof hero.health!=="number"||!Number.isSafeInteger(hero.health)||
      hero.health<=0)
      fail(path+".heroId","must be a living active shop visitor");
    choice(entry.reason,["unavailable","cannot-afford"],path+".reason");
    choice(entry.itemId,itemIds,path+".itemId");
    const started=integer(entry.startedTick,path+".startedTick",
      firstWorldTickOfDay(day),clockTick);
    const due=integer(entry.dueTick,path+".dueTick",clockTick+1,started+SHOP_REQUEST_TICKS);
    const eventId=text(entry.eventId,path+".eventId");
    const scheduled=pendingById.get(eventId);
    if(!scheduled||scheduled.lane!=="visitor"||scheduled.subjectId!==heroId||
      scheduled.dueTick!==due)
      fail(path+".eventId","must reference its scheduled visitor event");
  }
  for(const entry of pending)if((entry as RecordValue).lane==="visitor" &&
      !shopRequests.some(value=>(value as RecordValue).eventId===(entry as RecordValue).id))
    fail("payload.worldClock.pending","has an orphaned visitor event");
  const campaignSeed = integer(state.seed, "payload.seed", 0, 0xffffffff);
  integer(state.rngState, "payload.rngState", 0, 0xffffffff);
  const population = object(state.populationConfig, "payload.populationConfig", ["dailyInflux", "maxActive"]);
  integer(population.dailyInflux, "payload.populationConfig.dailyInflux");
  const maxActive = integer(population.maxActive, "payload.populationConfig.maxActive", 10, 100);
  const nextId = integer(state.nextAdventurerId, "payload.nextAdventurerId", 1);
  const heroIds = new Set<string | number>();
  let active = 0;
  array(state.adventurers, "payload.adventurers").forEach((value, index) => {
    const path = `payload.adventurers[${index}]`;
    const hero = object(value, path, [
      "id", "name", "role", "stats", "traits", "level", "xp", "health", "gold",
      "equipment", "inventory", "floor", "status", "shopStayDays", "offDutyUntilDay", "level6Permit",
    ]);
    const id = text(hero.id, `${path}.id`);
    const match = /^adventurer-([1-9]\d*)$/.exec(id);
    if (!match || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) >= nextId) {
      fail(`${path}.id`, "must be a canonical adventurer ID below nextAdventurerId");
    }
    unique(id, heroIds, `${path}.id`);
    text(hero.name, `${path}.name`);
    choice(hero.role, ["tank", "DPS", "healer"], `${path}.role`);
    const stats = object(hero.stats, `${path}.stats`, ["strength", "agility", "intellect", "maxHealth"]);
    for (const key of Object.keys(stats)) integer(stats[key], `${path}.stats.${key}`, 1);
    const health = integer(hero.health, `${path}.health`, 0, stats.maxHealth as number);
    const traits = object(hero.traits, `${path}.traits`, ["positive", "neutral", "negative"]);
    for (const key of Object.keys(traits)) text(traits[key], `${path}.traits.${key}`);
    const xp = integer(hero.xp, `${path}.xp`);
    if (integer(hero.level, `${path}.level`, 1) !== 1 + Math.floor(xp / 100)) {
      fail(`${path}.level`, "must agree with XP");
    }
    integer(hero.gold, `${path}.gold`);
    const equipment = object(hero.equipment, `${path}.equipment`, ["weapon", "armor"]);
    for (const key of Object.keys(equipment)) {
      if (equipment[key] !== null) text(equipment[key], `${path}.equipment.${key}`);
    }
    const inventory = object(hero.inventory, `${path}.inventory`,
      ["loot", "bread", "healing"],["finds"]);
    for (const key of ["loot","bread","healing"])
      integer(inventory[key], `${path}.inventory.${key}`);
    if(inventory.finds!==undefined){
      const finds=object(inventory.finds,path+".inventory.finds",[],itemIds);
      let total=0;
      for(const [id,quantity] of Object.entries(finds))
        total+=integer(quantity,path+".inventory.finds."+id,1,1000);
      if(total>1000)fail(path+".inventory.finds","is oversized");
    }
    const floor = integer(hero.floor, `${path}.floor`, 1, 7);
    choice(hero.status, ["exploring", "traveling", "at-shop",
      "returning", "expedition", "departing", "off-duty", "dead"], `${path}.status`);
    if ((hero.status === "dead") !== (health === 0)) fail(`${path}.status`, "must agree with health");
    if (hero.status !== "dead") {
      active += 1;
      if (((hero.status === "at-shop" || hero.status === "departing" ||
             hero.status === "off-duty") && floor !== 5) ||
          (hero.status === "exploring" && floor > 4) ||
          ((hero.status === "traveling" || hero.status === "returning") && floor !== 4) ||
          (hero.status === "expedition" && floor !== 6 && floor !== 7)) {
        fail(`${path}.floor`, "must agree with status");
      }
    }
    if (typeof hero.level6Permit !== "boolean") fail(`${path}.level6Permit`, "must be boolean");
    if (hero.status === "expedition" && hero.level6Permit !== true) fail(`${path}.level6Permit`, "is required for Level 6");
    const until=hero.offDutyUntilDay;
    if(hero.status==="off-duty"){
      if(until===null)fail(path+".offDutyUntilDay","is required off duty");
      integer(until,path+".offDutyUntilDay",day+1,day+3);
    }else if(until!==null)
      fail(path+".offDutyUntilDay","is only valid for off-duty heroes");
    const stay = integer(hero.shopStayDays, `${path}.shopStayDays`, 0, 1);
    if (stay !== 0 && hero.status !== "at-shop" && hero.status !== "dead") {
      fail(`${path}.shopStayDays`, "requires a shop visit");
    }
  });
  if (active > maxActive) fail("payload.adventurers", "exceeds the active population capacity");
  validateLevel7World(state.level7World,"payload.level7World",campaignSeed,heroIds,day);
  if(state.earlyDungeonWorlds!==undefined){
    const worlds=array(state.earlyDungeonWorlds,"payload.earlyDungeonWorlds");
    if(worlds.length>4)fail("payload.earlyDungeonWorlds","must cover at most four floors");
    const seenFloors=new Set<string|number>();
    worlds.forEach((value,i)=>{
      const path="payload.earlyDungeonWorlds["+i+"]";
      const entry=object(value,path,["floor","world"]);
      const floor=integer(entry.floor,path+".floor",1,4);
      unique(floor,seenFloors,path+".floor");
      validateLevel7World(entry.world,path+".world",campaignSeed,heroIds,day,floor);
    });
  }
  // Optional v13 party relationships cannot invent explorers, create a
  // leaderless group, overlap membership or assert a shared location that
  // the actual per-floor world never recorded. Old saves may omit this field.
  if(state.dungeonParties!==undefined){
    const groups=array(state.dungeonParties,"payload.dungeonParties");
    if(groups.length>50)fail("payload.dungeonParties","is oversized");
    const assigned=new Set<string|number>();
    const heroes=new Map(array(state.adventurers,"payload.adventurers")
      .map(raw=>{const hero=raw as RecordValue;
        return [hero.id as string,hero] as const;}));
    groups.forEach((raw,i)=>{
      const path="payload.dungeonParties["+i+"]";
      const group=object(raw,path,["memberIds","floor","formedDay"]);
      const floor=integer(group.floor,path+".floor",1,7);
      if(floor===5||floor===6)fail(path+".floor","must be a shared spatial floor");
      integer(group.formedDay,path+".formedDay",1,day);
      const ids=array(group.memberIds,path+".memberIds");
      if(ids.length<2||ids.length>3)
        fail(path+".memberIds","must contain two or three actual heroes");
      const perGroup=new Set<string|number>();
      const members=ids.map((rawId,j)=>{
        const p=path+".memberIds["+j+"]";
        const id=text(rawId,p);
        unique(id,perGroup,p);
        unique(id,assigned,p);
        const hero=heroes.get(id);
        if(!hero||hero.floor!==floor||
          hero.status!==(floor===7?"expedition":"exploring")||
          (hero.health as number)<=0)
          fail(p,"must be a living explorer on the party floor");
        return hero;
      });
      const savedWorld=floor===7?state.level7World as Level7World:
        ((state.earlyDungeonWorlds??[]) as EarlyDungeonFloorWorld[])
          .find(entry=>entry.floor===floor)?.world ??
          {resolvedFeatureIds:[],heroes:[]};
      const layout=generateExpeditionLayout(campaignSeed,floor);
      const first=getLevel7Progress(savedWorld,
        members[0].id as string,layout);
      if(members.some(hero=>{
        const position=getLevel7Progress(savedWorld,hero.id as string,layout);
        return position.x!==first.x||position.z!==first.z;
      }))fail(path+".memberIds","must physically share the saved dungeon tile");
    });
  }
  let parsedShopLayout:ShopLayout;
  {
    const layout=object(state.shopLayout,"payload.shopLayout",["shelves","counter"]);
    // Furniture can legitimately be outside the original 7m cave once the
    // corresponding corridor is mined. The full room-aware geometry check
    // below still rejects unmined rock and unsupported service footprints.
    const sideLimit=BASE_ROOM_HALF_EXTENT+2*room.expansionTier+0.5;
    const shelves=array(layout.shelves,"payload.shopLayout.shelves");
    if(shelves.length>MAX_SHOP_SHELVES)
      fail("payload.shopLayout.shelves","must contain at most "+MAX_SHOP_SHELVES+" shelves");
    const parsed:ShelfPlacement[]=shelves.map((value,i)=>{
      const path="payload.shopLayout.shelves["+i+"]";
      const shelf=object(value,path,["id","x","z","rotation"]);
      if(!isShelfId(shelf.id))fail(path+".id","must be a stable shelf instance ID");
      const x=validNumber(shelf.x,path+".x",-sideLimit,sideLimit);
      const z=validNumber(shelf.z,path+".z",-8,8);
      const rotation=integer(shelf.rotation,path+".rotation",0,3);
      return {id:shelf.id as ShelfPlacement["id"],x,z,
        rotation:rotation as ShelfPlacement["rotation"]};
    });
    const p=object(layout.counter,"payload.shopLayout.counter",["x","z","rotation"]);
    const counter={
      x:validNumber(p.x,"payload.shopLayout.counter.x",-sideLimit,sideLimit),
      z:validNumber(p.z,"payload.shopLayout.counter.z",-8,8),
      rotation:integer(p.rotation,"payload.shopLayout.counter.rotation",0,3) as 0|1|2|3,
    };
    parsedShopLayout={shelves:parsed,counter};
    const problem=shopLayoutProblem(parsedShopLayout,room);
    if(problem)fail("payload.shopLayout",problem);
  }
  {
    const list=array(state.bedroomFurniture,"payload.bedroomFurniture");
    const parsed:BedroomFurniturePlacement[]=list.map((raw,index)=>{
      const path="payload.bedroomFurniture["+index+"]";
      const p=object(raw,path,["id","x","z","rotation"]);
      choice(p.id,["desk","chest","candle","bed"],path+".id");
      const x=validNumber(p.x,path+".x",-3,3);
      const z=validNumber(p.z,path+".z",-12,-7);
      const rotation=integer(p.rotation,path+".rotation",0,3);
      return {id:p.id as BedroomFurniturePlacement["id"],x,z,
        rotation:rotation as BedroomFurniturePlacement["rotation"]};
    });
    const problem=bedroomFurnitureProblem(parsed);
    if(problem)fail("payload.bedroomFurniture",problem);
  }
  {
    const raw=object(state.rosterBoard,"payload.rosterBoard",["x","z","rotation"]);
    const placement:RosterBoardPlacement={
      x:validNumber(raw.x,"payload.rosterBoard.x",
        -(7+(room.expansionTier)*2+1),7+(room.expansionTier)*2+1),
      z:validNumber(raw.z,"payload.rosterBoard.z",-8,8),
      rotation:integer(raw.rotation,"payload.rosterBoard.rotation",0,3) as 0|1|2|3,
    };
    const problem=rosterBoardProblem(placement,parsedShopLayout,room);
    if(problem)fail("payload.rosterBoard",problem);
  }

  if(state.wallPortrait!==undefined){
    const raw=object(state.wallPortrait,"payload.wallPortrait",["x","z","rotation"]);
    const sideLimit=7+(room.expansionTier)*2+1;
    const pose:WallPortraitPlacement={
      x:validNumber(raw.x,"payload.wallPortrait.x",-sideLimit,sideLimit),
      z:validNumber(raw.z,"payload.wallPortrait.z",-8,8),
      rotation:integer(raw.rotation,"payload.wallPortrait.rotation",0,3) as 0|1|2|3,
    };
    const problem=wallPortraitProblem(pose,parsedShopLayout,room,
      state.rosterBoard as RosterBoardPlacement);
    if(problem)fail("payload.wallPortrait",problem);
  }
  const slotDefinitions=parsedShopLayout.shelves.flatMap(shelf=>
    createEmptyShelfSlots(shelf.id));
  const economy = object(state.shopEconomy, "payload.shopEconomy", [
    "balance", "bag", "materialStorage", "slots", "dailySales",
  ]);
  const reserve=object(economy.materialStorage,"payload.shopEconomy.materialStorage",
    ["iron-ore","coal"]);
  for(const id of ["iron-ore","coal"] as const)
    integer(reserve[id],"payload.shopEconomy.materialStorage."+id,0);
  integer(economy.balance, "payload.shopEconomy.balance");
  const permittedItems = itemIds;
  const bag = object(economy.bag, "payload.shopEconomy.bag", permittedItems);
  let bagTotal = 0;
  for (const id of permittedItems) bagTotal += integer(bag[id], `payload.shopEconomy.bag.${id}`, 0, ECONOMY.bagCapacity);
  if (bagTotal > ECONOMY.bagCapacity) fail("payload.shopEconomy.bag", "exceeds bag capacity");
  if(bag["iron-ore"]!==0||bag.coal!==0)
    fail("payload.shopEconomy.bag","raw materials belong in materialStorage");
  const slots = array(economy.slots, "payload.shopEconomy.slots");
  if (slots.length !== slotDefinitions.length)
    fail("payload.shopEconomy.slots","must match four slots per placed shelf");
  const slotIds = new Set<string | number>();
  slots.forEach((value, index) => {
    const path = `payload.shopEconomy.slots[${index}]`;
    const slot = object(value, path, ["id", "shelfId", "index", "itemId", "quantity", "capacity"]);
    const id = text(slot.id, `${path}.id`);
    unique(id, slotIds, `${path}.id`);
    const definition = slotDefinitions.find((entry) => entry.id === id);
    if (!definition || slot.shelfId !== definition.shelfId || slot.index !== definition.index) {
      fail(path, "has an invalid slot ID, shelf or index");
    }
    if (slot.capacity !== ECONOMY.slotCapacity) fail(`${path}.capacity`, "is incompatible");
    const quantity = integer(slot.quantity, `${path}.quantity`, 0, ECONOMY.slotCapacity);
    choice(slot.itemId, [null, ...SHELF_GOODS.map(item=>item.id)], `${path}.itemId`);
    if ((quantity === 0) !== (slot.itemId === null)) fail(path, "must have an item exactly when stocked");
  });
  {
    const reservedBySlot = new Map<string,{itemId:string;quantity:number}>();
    const cartHeroes = new Set<string | number>();
    array(state.shopCarts,"payload.shopCarts").forEach((value,i)=>{
      const path="payload.shopCarts["+i+"]";
      const cart=object(value,path,["heroId","day","lines"]);
      const heroId=text(cart.heroId,path+".heroId");
      unique(heroId,cartHeroes,path+".heroId");
      const hero=(state.adventurers as RecordValue[]).find(candidate=>
        candidate.id===heroId);
      if(!hero || hero.status!=="at-shop" || hero.health===0)
        fail(path+".heroId","requires a living shop visitor");
      if(cart.day!==day)fail(path+".day","must equal the current day");
      const lineSlots=new Set<string | number>();
      let cartTotal=0;
      const lines=array(cart.lines,path+".lines");
      if(!lines.length || lines.length>slotDefinitions.length)
        fail(path+".lines","must contain 1 to 10 reserved lines");
      lines.forEach((entry,j)=>{
        const lp=path+".lines["+j+"]";
        const line=object(entry,lp,["slotId","itemId","quantity","subtotal"]);
        const slotId=text(line.slotId,lp+".slotId");
        unique(slotId,lineSlots,lp+".slotId");
        if(!slotIds.has(slotId))fail(lp+".slotId","must link to an existing slot");
        choice(line.itemId,itemIds,lp+".itemId");
        const quantity=integer(line.quantity,lp+".quantity",1,ECONOMY.slotCapacity);
        const item=ITEMS.find(candidate=>candidate.id===line.itemId)!;
        if(integer(line.subtotal,lp+".subtotal")!==quantity*item.salePrice)
          fail(lp+".subtotal","must agree with item price and quantity");
        if(!["healing","weapon","armor"].includes(item.kind))
          fail(lp+".itemId","is not supported for purchase");
        cartTotal+=quantity*item.salePrice;
        const old=reservedBySlot.get(slotId);
        if(old && old.itemId!==line.itemId)
          fail(lp+".itemId","must agree with other held stock for this slot");
        reservedBySlot.set(slotId,{
          itemId:line.itemId as string,quantity:(old?.quantity??0)+quantity,
        });
      });
      if(cartTotal>(hero.gold as number))
        fail(path+".lines","cannot cost more than the visitor's gold");
    });
    for(const [slotId,reserved] of reservedBySlot) {
      const source=slots.find(value=>(value as RecordValue).id===slotId) as RecordValue;
      if((source.quantity as number) + reserved.quantity > (source.capacity as number))
        fail("payload.shopCarts","held quantity exceeds shelf capacity");
      if(source.itemId!==null && source.itemId!==reserved.itemId)
        fail("payload.shopCarts","held stock conflicts with the shelf product");
    }
  }

  for(const [i,hero] of (state.liveDungeon as GameState["liveDungeon"]).heroes.entries()){
    if(!heroIds.has(hero.heroId as string))
      fail("payload.liveDungeon.heroes["+i+"].heroId","must be a known adventurer");
  }
  validateShopTraffic(state.shopTraffic,day,clockTick,
    new Set((state.adventurers as RecordValue[]).filter(hero=>
      hero.status==="at-shop"||hero.status==="departing"||
      (!(state.liveDungeon as GameState["liveDungeon"]).enabled&&hero.status==="returning"))
      .map(hero=>hero.id as string)),
    new Set(parsedShopLayout.shelves.map(shelf=>shelf.id)));

  {
    const seenDebtHeroes=new Set<string|number>();
    const debts=array(state.shopDebts,"payload.shopDebts");
    if(debts.length>(state.adventurers as unknown[]).length)
      fail("payload.shopDebts","cannot exceed the adventurer count");
    debts.forEach((raw,i)=>{
      const path="payload.shopDebts["+i+"]";
      const debt=object(raw,path,["heroId","outstandingGold"]);
      const heroId=text(debt.heroId,path+".heroId");
      if(!heroIds.has(heroId))fail(path+".heroId","must identify a known hero");
      unique(heroId,seenDebtHeroes,path+".heroId");
      integer(debt.outstandingGold,path+".outstandingGold",1);
    });
  }

  const sales = object(economy.dailySales, "payload.shopEconomy.dailySales", ["day", "units", "revenue"]);
  if (sales.day !== day) fail("payload.shopEconomy.dailySales.day", "must match the current day");
  integer(sales.units, "payload.shopEconomy.dailySales.units");
  integer(sales.revenue, "payload.shopEconomy.dailySales.revenue");

  const floors = new Set<string | number>();
  array(state.dungeonFloors, "payload.dungeonFloors").forEach((value, index) => {
    const path = `payload.dungeonFloors[${index}]`;
    const floor = object(value, path, ["floor", "cleared"]);
    unique(integer(floor.floor, `${path}.floor`, 1, 7), floors, `${path}.floor`);
    if (typeof floor.cleared !== "boolean") fail(`${path}.cleared`, "must be a boolean");
  });

  const eventIds = new Set<string | number>();
  const signaledDeaths=new Set<string | number>();
  let lastDay = 1;
  array(state.events, "payload.events").forEach((value, index) => {
    const path = `payload.events[${index}]`;
    const event = object(value, path, ["id", "type", "day", "message"],
      ["adventurerId", "worldTick", "reportedZone", "dungeonHighlight", "shopReason", "outcome", "itemId", "quantity", "revenue", "cost", "combatOutcome",
        "combatReplay", "level7Replay", "dungeonReplay",
        "dungeonGoal", "floorAction", "saleChannel", "debtGold"]);
    choice(event.type, eventTypes, `${path}.type`);
    const eventDay = integer(event.day, `${path}.day`, lastDay, day);
    if(event.worldTick!==undefined){
      integer(event.worldTick,path+".worldTick",firstWorldTickOfDay(eventDay),
        eventDay===day?clockTick:lastWorldTickOfDay(eventDay));
      if(event.type!=="shop-walkout"&&event.type!=="dungeon-live"&&
        event.type!=="shop-departure"&&
        event.type!=="shop-arrival"&&
        event.type!=="temporary-party-join"&&event.type!=="temporary-party-leave"&&
        event.type!=="hero-death-signal")
        fail(path+".worldTick","is not allowed for this event type");
    }
    lastDay = eventDay;
    text(event.message, `${path}.message`);
    const id = text(event.id, `${path}.id`);
    unique(id, eventIds, `${path}.id`);
    const global = ["welcome", "day-started"].includes(event.type as string);
    if (!global && !heroIds.has(event.adventurerId as string)) fail(`${path}.adventurerId`, "must link to an existing hero");
    const allowed = ["id", "type", "day", "message",
      ...(event.type==="shop-walkout"?["worldTick","shopReason"]:[]),
      ...(event.type==="shop-departure"&&event.worldTick!==undefined?["worldTick"]:[]),
      ...(event.type==="shop-arrival"&&event.worldTick!==undefined?["worldTick"]:[]),
      ...((event.type==="temporary-party-join"||
        event.type==="temporary-party-leave")&&event.worldTick!==undefined
        ?["worldTick"]:[]),
      ...(event.type==="hero-death-signal"?["worldTick"]:[]),
      ...(event.type==="dungeon-live"?["worldTick",
        ...(event.reportedZone!==undefined?["reportedZone"]:[]),
        ...(event.dungeonHighlight!==undefined?["dungeonHighlight"]:[]),
        ...(event.level7Replay!==undefined?["level7Replay"]:[]),
        ...(event.dungeonReplay!==undefined?["dungeonReplay"]:[])]:[]),
      ...(!global ? ["adventurerId"] : [])];
    if(event.shopReason!==undefined){
      if(event.type!=="shop-walkout")fail(path+".shopReason","is not supported");
      choice(event.shopReason,["interested","unavailable","cannot-afford","no-need"],path+".shopReason");
    }
    if(event.type==="hero-death-signal"){
      unique(text(event.adventurerId,path+".adventurerId"),
        signaledDeaths,path+".adventurerId");
      if(event.worldTick===undefined)
        fail(path+".worldTick","is required for a real death signal");
      const hero=(state.adventurers as RecordValue[]).find(h=>h.id===event.adventurerId);
      const inCombat=(state.liveDungeon as GameState["liveDungeon"]).combats.some(f=>
        f.state.actors.some(a=>a.id===event.adventurerId&&a.hp<=0));
      if(!hero||(!(hero.status==="dead"&&hero.health===0)&&!inCombat))
        fail(path+".adventurerId","must be a real fallen hero or active zero-HP fighter");
    }
    if(event.type==="dungeon-live"){
      if(event.dungeonHighlight!==undefined)
        choice(event.dungeonHighlight,["treasure","trap"],path+".dungeonHighlight");
      if(event.reportedZone!==undefined)
        choice(event.reportedZone,["upper","deep"],path+".reportedZone");
      if(event.worldTick===undefined)
        fail(path+".worldTick","is mandatory for real live dungeon events");
    }
    let suffix = event.type === "day-started" ? "started" : event.type;
    if(event.type==="hero-buyback"){
      const prefix="day-"+eventDay+":"+event.adventurerId+":";
      if(!id.startsWith(prefix))
        fail(path+".id","must reference the trading hero");
      suffix=id.slice(prefix.length);
    }
    if(event.type==="dungeon-live")suffix="dungeon-live:"+event.worldTick;
    if(event.type==="hero-death-signal")
      suffix="hero-death-signal:"+event.worldTick;
    if((event.type==="temporary-party-join"||
      event.type==="temporary-party-leave")&&event.worldTick!==undefined)
      suffix=event.type+":"+event.worldTick;
    // Real in-day portal arrivals have their OWN committed tick. Legacy
    // starting visitors (no worldTick) keep the existing day-scoped ID.
    if(event.type==="shop-arrival"&&event.worldTick!==undefined)
      suffix="shop-arrival:"+event.worldTick;
    if(event.type==="shop-departure"&&event.worldTick!==undefined)
      suffix="shop-departure:"+event.worldTick;
    if (event.type === "dungeon-outcome") {
      allowed.push("outcome");
      choice(event.outcome, ["advance", "stay", "retreat", "death"], `${path}.outcome`);
      suffix = "dungeon";
    }
    if (event.type === "level6-combat") {
      allowed.push("combatOutcome");
      choice(event.combatOutcome, ["victory", "retreat", "death"], `${path}.combatOutcome`);
      if (event.combatReplay !== undefined) {
        allowed.push("combatReplay");
        validateBossReplay(event.combatReplay, `${path}.combatReplay`,
          event.adventurerId as string, eventDay,
          event.combatOutcome as "victory" | "retreat" | "death");
      }
    }
    if((event.type === "level7-exploration"||event.type==="dungeon-live") &&
      event.level7Replay !== undefined) {
      allowed.push("level7Replay");
      validateLevel7Replay(event.level7Replay,`${path}.level7Replay`,
        event.adventurerId as string,eventDay,campaignSeed,7,heroIds);
    }
    if(event.type==="dungeon-exploration"||event.type==="dungeon-live"){
      if(event.dungeonGoal!==undefined){
        allowed.push("dungeonGoal");
        choice(event.dungeonGoal,["farm","progress","test-gear","caution","resupply",
          "loot-chest","hunt-ghouls"],
          path+".dungeonGoal");
      }
      if(event.floorAction!==undefined){
        allowed.push("floorAction");
        choice(event.floorAction,["stay","ascend","descend","shop"],
          path+".floorAction");
      }
      if(event.dungeonReplay!==undefined){
        allowed.push("dungeonReplay");
        const replay=object(event.dungeonReplay,path+".dungeonReplay",[
          "version","day","heroId","floor","appearance","steps","encounters","outcome",
        ],["knownAtStart","resolvedAtStart","partyMemberIds","partyAppearances"]);
        const floor=integer(replay.floor,path+".dungeonReplay.floor",1,4);
        validateLevel7Replay(event.dungeonReplay,path+".dungeonReplay",
          event.adventurerId as string,eventDay,campaignSeed,floor,heroIds);
      }
    }
    if(event.type==="hero-buyback"){
      allowed.push("itemId","quantity","cost");
      choice(event.itemId,itemIds,path+".itemId");
      if(integer(event.quantity,path+".quantity",1,1)!==1)
        fail(path+".quantity","must represent one actual purchased item");
      const item=ITEMS.find(entry=>entry.id===event.itemId)!;
      const price=Math.max(1,Math.min(item.wholesaleCost,item.salePrice-1));
      if(event.cost!==price)
        fail(path+".cost","must match the real merchant buyback price");
      const prefix="day-"+eventDay+":"+event.adventurerId+
        ":hero-buyback:"+event.itemId+":";
      const serial=id.startsWith(prefix)?Number(id.slice(prefix.length)):NaN;
      if(!Number.isSafeInteger(serial)||serial<1)
        fail(path+".id","must reference a real buyback receipt");
    }
    if (event.type === "sale" || event.type === "healed") {
      allowed.push("itemId", "quantity");
      choice(event.itemId, permittedItems, `${path}.itemId`);
      integer(event.quantity, `${path}.quantity`, 1,
        event.type === "sale" ? ECONOMY.slotCapacity : 1);
      if (event.type === "healed" &&
        event.itemId !== "healing-herb" && event.itemId !== "bread")
        fail(`${path}.itemId`, "must be a healing item");
    }
    if(event.type==="tip"){
      allowed.push("revenue");
      integer(event.revenue,`${path}.revenue`,1,1000000);
      const manualRevenue=(state.events as unknown[]).reduce<number>((total,raw)=>{
        const sale=raw as RecordValue;
        return sale.type==="sale"&&sale.saleChannel==="manual"&&
          sale.adventurerId===event.adventurerId&&sale.day===eventDay
          ? total+(typeof sale.revenue==="number"?sale.revenue:0):total;
      },0);
      if(manualRevenue===0)fail(`${path}.type`,"tip requires a same-day manual sale");
      if((event.revenue as number)>Math.floor(manualRevenue/10))
        fail(`${path}.revenue`,"must not exceed 10% of same-day manual sales");
    }
    if (event.type === "shop-credit") {
      allowed.push("itemId","quantity","debtGold");
      choice(event.itemId,itemIds,path+".itemId");
      if(integer(event.quantity,path+".quantity",1,1)!==1)
        fail(path+".quantity","must represent one issued item");
      const item=ITEMS.find(candidate=>candidate.id===event.itemId)!;
      if(!["healing","weapon","armor"].includes(item.kind))
        fail(path+".itemId","must be a hero need");
      if(integer(event.debtGold,path+".debtGold",1)!==item.salePrice)
        fail(path+".debtGold","must match the item's sticker price");
    }
    if (event.type === "sale") {
      allowed.push("revenue");
      if (event.saleChannel !== undefined) {
        allowed.push("saleChannel");
        choice(event.saleChannel,["manual","reserved"],path+".saleChannel");
      }
      const item = ITEMS.find((entry) => entry.id === event.itemId)!;
      if (event.revenue !== item.salePrice * (event.quantity as number)) fail(`${path}.revenue`, "must match item price and quantity");
      const prefix = `day-${eventDay}:${event.adventurerId}:sale:`;
      const receiptSlot=id.startsWith(prefix) ? id.slice(prefix.length) : "";
      const manualSuffix=receiptSlot.endsWith(":manual");
      const slotId=manualSuffix ? receiptSlot.slice(0,-":manual".length) : receiptSlot;
      if (!slotIds.has(slotId) || (manualSuffix && event.saleChannel!=="manual"))
        fail(`${path}.id`, "must link to the sale's shelf slot");
    } else {
      const expected = `day-${eventDay}:${global ? "" : `${event.adventurerId}:`}${suffix}`;
      if (id !== expected) fail(`${path}.id`, "must agree with event day, type and hero");
    }
    for (const key of Object.keys(event)) {
      if (!allowed.includes(key)) fail(`${path}.${key}`, "is not valid for this event type");
    }
  });
  // Only complete, real recordings may be protected beyond the lookback.
  const pins=array(state.savedReplayIds,"payload.savedReplayIds");
  if(pins.length>MAX_SAVED_REPLAYS)
    fail("payload.savedReplayIds","exceeds the saved recording limit");
  const seenPins=new Set<string|number>();
  pins.forEach((raw,i)=>{
    const path="payload.savedReplayIds["+i+"]";
    const id=text(raw,path);
    unique(id,seenPins,path);
    const referenced=(state.events as unknown as GameState["events"])
      .find(event=>event.id===id);
    if(!referenced||!containsReplay(referenced))
      fail(path,"must identify a retained committed recording");
  });
  {
    const balances=new Map<string,number>();
    for(const raw of array(state.events,"payload.events")){
      const event=raw as RecordValue;
      if(event.type!=="shop-credit")continue;
      const id=event.adventurerId as string;
      const total=(balances.get(id)??0)+(event.debtGold as number);
      if(!Number.isSafeInteger(total))fail("payload.events","credit total is unsafe");
      balances.set(id,total);
    }
    const owed=new Map((state.shopDebts as RecordValue[]).map(entry=>[
      entry.heroId as string,entry.outstandingGold as number]));
    if(balances.size!==owed.size ||
       [...balances].some(([id,total])=>owed.get(id)!==total))
      fail("payload.shopDebts","must agree with all credit events");
  }
  {
    const manualPaid=new Set(array(state.events,"payload.events")
      .filter(value=>(value as RecordValue).type==="sale" &&
        (value as RecordValue).saleChannel==="manual" &&
        (value as RecordValue).day===day)
      .map(value=>(value as RecordValue).adventurerId));
    for(const cart of array(state.shopCarts,"payload.shopCarts")){
      if(manualPaid.has((cart as RecordValue).heroId))
        fail("payload.shopCarts","cannot reserve goods for a customer already paid today");
    }
  }
  // Require that a saved petition is still a genuine, currently unpaid
  // need. Without this guard a forged request for arbitrary stock could
  // poison the event queue and expire a customer who never requested it.
  if(shopRequests.length){
    const plans=forecastShoppingIntents(state as unknown as GameState);
    shopRequests.forEach((raw,i)=>{
      const entry=raw as RecordValue;
      const plan=plans.get(entry.heroId as string);
      if(plan?.reason!==entry.reason||plan?.wantedItemId!==entry.itemId)
        fail("payload.shopRequests["+i+"].itemId",
          "must match the customer's current physical shopping need");
    });
  }
}

export function createSave(state: GameState): SaveEnvelope {
  validateState(state);
  // Detach at request time, before queued I/O can observe later caller mutations.
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    simulationVersion: SIMULATION_VERSION,
    savedAt: new Date().toISOString(),
    payload: structuredClone(state),
  };
}

/** Strict serialized snapshot of the current state, captured synchronously.
 * JSON.stringify completes before any queued IndexedDB operation can run.
 * Unlike createSave(), no intermediate deep structuredClone is necessary:
 * the queued immutable UTF-8-compatible JSON string is already detached.
 * Explicit export/createSave still produces an independent object.
 */
export function serializeSave(state:GameState):string{
  validateState(state);
  return JSON.stringify({
    schemaVersion:SAVE_SCHEMA_VERSION,
    simulationVersion:SIMULATION_VERSION,
    savedAt:new Date().toISOString(),
    payload:state,
  } satisfies SaveEnvelope);
}

/** Upgrade only the immediately preceding v25 campaigns. Their Ore/Coal
 * still occupied the bag or shelf, before workshop storage existed. Move
 * those exact saved quantities once, never duplicate, lose or generate goods.
 * Every unrelated field is subsequently checked by the strict v26 validator. */
function migrateV25Materials(raw:unknown):GameState{
  const old=object(raw,"payload",[
    "day","worldClock","shopRequests","shopTraffic","liveDungeon",
    "simulationVersion","events","savedReplayIds","adventurers","shopEconomy",
    "dungeonFloors","seed","rngState","populationConfig","nextAdventurerId",
    "level7World","shopLayout","shopCarts","shopDebts","level5Room",
    "bedroomFurniture","rosterBoard","cellarRoom","cellarChest",
    "cellarDoorOpen","cellarFishCaught",
  ],["wallPortrait","earlyDungeonWorlds","dungeonParties"]);
  // v25 saves have no workshop reserve: accepting one here could duplicate stock.
  const economy=object(old.shopEconomy,"payload.shopEconomy",
    ["balance","bag","slots","dailySales"]);
  const bag=object(economy.bag,"payload.shopEconomy.bag",itemIds);
  const store:Record<MaterialItemId,number>={
    "iron-ore":integer(bag["iron-ore"],"payload.shopEconomy.bag.iron-ore",0,ECONOMY.bagCapacity),
    coal:integer(bag.coal,"payload.shopEconomy.bag.coal",0,ECONOMY.bagCapacity),
  };
  const slots=array(economy.slots,"payload.shopEconomy.slots").map((value,i)=>{
    const slot=object(value,"payload.shopEconomy.slots["+i+"]",
      ["id","shelfId","index","itemId","quantity","capacity"]);
    const id=slot.itemId;
    if(id!=="coal"&&id!=="iron-ore")return slot;
    const quantity=integer(slot.quantity,
      "payload.shopEconomy.slots["+i+"].quantity",1,ECONOMY.slotCapacity);
    if(store[id]>Number.MAX_SAFE_INTEGER-quantity)
      fail("payload.shopEconomy.materialStorage","would overflow");
    store[id]+=quantity;
    return {...slot,itemId:null,quantity:0};
  });
  return {...old,simulationVersion:SIMULATION_VERSION,
    shopEconomy:{...economy,bag:{...bag,"iron-ore":0,coal:0},
      materialStorage:store,slots}} as unknown as GameState;
}

export function parseSave(text: string): GameState {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Invalid campaign save: malformed JSON.");
  }
  const envelope = object(value, "envelope", ["schemaVersion", "simulationVersion", "savedAt", "payload"]);
  if (envelope.schemaVersion !== SAVE_SCHEMA_VERSION) fail("schemaVersion", "is incompatible; no migrations are available");
  if (envelope.simulationVersion !== SIMULATION_VERSION&&
      envelope.simulationVersion !== 25)
    fail("simulationVersion", "is incompatible; only the previous v25 campaign can be migrated");
  if (!textTimestamp(envelope.savedAt)) fail("savedAt", "must be an ISO UTC timestamp");
  if(!envelope.payload||typeof envelope.payload!=="object"||
     (envelope.payload as RecordValue).simulationVersion!==envelope.simulationVersion)
    fail("payload.simulationVersion","does not match the envelope");
  const state=envelope.simulationVersion===25
    ?migrateV25Materials(envelope.payload):envelope.payload as GameState;
  validateState(state);
  return state;
}

function textTimestamp(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

export interface CampaignRecords {
  readonly latest: string | null;
  readonly previous: string | null;
}

/** update must read and replace both records atomically, leaving them intact on failure. */
export interface CampaignStorageAdapter {
  read(): Promise<CampaignRecords>;
  update(change: (records: CampaignRecords) => CampaignRecords): Promise<void>;
}

function validSave(text: string | null): boolean {
  if (text === null) return false;
  try {
    parseSave(text);
    return true;
  } catch {
    return false;
  }
}

class IndexedDBAdapter implements CampaignStorageAdapter {
  private async open(): Promise<IDBDatabase> {
    if (!globalThis.indexedDB) throw new Error("IndexedDB is unavailable in this browser.");
    return new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open("dungeon-shop-master-campaign", 1);
      let settled = false;
      const rejectOpen = (error: Error) => {
        settled = true;
        clearTimeout(timeout);
        reject(error);
      };
      const timeout = setTimeout(() => {
        rejectOpen(new Error("Opening campaign storage timed out. Continue playing in memory and try again later."));
      }, 5000);
      request.onupgradeneeded = () => {
        if (settled) request.transaction?.abort();
        else request.result.createObjectStore("saves");
      };
      request.onerror = () => rejectOpen(request.error ?? new Error("Could not open campaign storage."));
      request.onblocked = () => {
        rejectOpen(new Error("Campaign storage is blocked by another browser tab."));
      };
      request.onsuccess = () => {
        clearTimeout(timeout);
        if (settled) request.result.close();
        else {
          settled = true;
          resolve(request.result);
        }
      };
    });
  }

  private async transact(change?: (records: CampaignRecords) => CampaignRecords): Promise<CampaignRecords> {
    const db = await this.open();
    try {
      return await new Promise<CampaignRecords>((resolve, reject) => {
        const transaction = db.transaction("saves", change ? "readwrite" : "readonly");
        const store = transaction.objectStore("saves");
        const request = store.get("campaign");
        let result: CampaignRecords = { latest: null, previous: null };
        let failure: unknown;
        request.onsuccess = () => {
          try {
            const value: unknown = request.result;
            if (value !== undefined) {
              if (change) {
                // Explicit overwrites/reset can recover damaged storage without losing readable backups.
                const records = value !== null && typeof value === "object" && !Array.isArray(value)
                  ? value as RecordValue : {};
                result = {
                  latest: typeof records.latest === "string" ? records.latest : null,
                  previous: typeof records.previous === "string" ? records.previous : null,
                };
              } else {
                const records = object(value, "storage", ["latest", "previous"]);
                for (const key of ["latest", "previous"]) {
                  if (records[key] !== null && typeof records[key] !== "string") fail(`storage.${key}`, "must be text or null");
                }
                result = records as unknown as CampaignRecords;
              }
            }
            if (change) {
              result = change(result);
              if (result.latest === null && result.previous === null) store.delete("campaign");
              else store.put(result, "campaign");
            }
          } catch (error) {
            failure = error;
            transaction.abort();
          }
        };
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = transaction.onerror = () => reject(
          failure ?? transaction.error ?? request.error ?? new Error("Campaign storage transaction failed."),
        );
      });
    } finally {
      db.close();
    }
  }

  async read(): Promise<CampaignRecords> {
    return this.transact();
  }

  async update(change: (records: CampaignRecords) => CampaignRecords): Promise<void> {
    await this.transact(change);
  }
}

const browserAdapter = new IndexedDBAdapter();
const queues = new WeakMap<CampaignStorageAdapter, Promise<unknown>>();
// An acknowledged snapshot was already strictly validated by createSave.
// Re-parsing that exact stored string every second when rotating the backup
// is expensive and cannot improve integrity. Values from another tab, an
// external adapter, or a damaged store are NOT trusted unless identical.
const verifiedLatest = new WeakMap<CampaignStorageAdapter, string>();

export class CampaignStorage {
  private readonly adapter: CampaignStorageAdapter;

  constructor(adapter: CampaignStorageAdapter = browserAdapter) {
    this.adapter = adapter;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = (queues.get(this.adapter) ?? Promise.resolve()).then(operation);
    // A failed operation rejects its caller, but does not poison subsequent requests.
    queues.set(this.adapter, result.catch(() => undefined));
    return result;
  }

  async saveGame(state: GameState): Promise<void> {
    const snapshot = serializeSave(state);
    return this.enqueue(async () => {
      await this.adapter.update(records => ({
        latest:snapshot,
        previous:records.latest!==null&&
          (records.latest===verifiedLatest.get(this.adapter)||
            validSave(records.latest))
          ?records.latest:records.previous,
      }));
      // Mark as trusted ONLY after durable adapter success. A rejected
      // transaction must never certify a snapshot it did not commit.
      verifiedLatest.set(this.adapter,snapshot);
    });
  }

  loadGame(): Promise<GameState | null> {
    return this.load("latest");
  }

  loadBackup(): Promise<GameState | null> {
    return this.load("previous");
  }

  private load(key: keyof CampaignRecords): Promise<GameState | null> {
    return this.enqueue(async () => {
      const records = await this.adapter.read();
      if (records[key] === null) return null;
      try {
        const loaded=parseSave(records[key]);
        if(key==="latest")verifiedLatest.set(this.adapter,records[key]);
        return loaded;
      } catch (error) {
        throw new Error(`Cannot load ${key === "latest" ? "latest campaign" : "campaign backup"}; stored data was preserved. ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  deleteGame(): Promise<void> {
    return this.enqueue(async () => {
      await this.adapter.update(() => ({latest:null,previous:null}));
      verifiedLatest.delete(this.adapter);
    });
  }
}
