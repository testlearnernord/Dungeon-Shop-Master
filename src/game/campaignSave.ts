import {manuallyPaidVisitors} from "./npcVisitors.ts";
import {MAX_POST_SHOP_RECOVERY_TICKS} from "./shopRotation.ts";
import { BASE_ROOM_HALF_EXTENT, isValidShopRoomGeometry } from "./shopRoomGeometry.ts";
import {heroLevel,heroProgression} from "./heroProgression.ts";
import {livePartyBossCheckpointProblem,partyBossReplayProblem}
  from "./livePartyBossSave.ts";
import {isValidCellarRoom,cellarChestProblem,cellarTableProblem,
  type CellarChestPlacement,type CellarTablePlacement} from "./cellarRoom.ts";
import {dungeonBuybackPrice} from "./dungeonBuyback.ts";
import { ECONOMY, ITEMS,createEmptyShelfSlots,SHELF_GOODS,MATERIAL_ITEMS } from "./economy.ts";
import {WEAPON_NAMES,ARMOR_NAMES} from "./gearCatalog.ts";
import {
  SIMULATION_VERSION, type GameState,
} from "./gameState.ts";
import {
  SPATIAL_DUNGEON_STEP_BUDGET, SPATIAL_DUNGEON_MAX_ENCOUNTERS,
  getSpatialDungeonProgress, prepareSpatialDungeonCombat, chooseKnownReturnStep,
  type SpatialDungeonWorld,
  type SpatialDungeonFloor,
} from "./spatialDungeonExploration.ts";
import { dungeonDownStair, generateDungeonLayout, generateExpeditionLayout, tileAt } from "./dungeonLayout.ts";
import {isShelfId,MAX_SHOP_SHELVES,shopLayoutProblem,
  type ShelfPlacement,type ShopLayout} from "./shopLayout.ts";
import {rosterBoardProblem,type RosterBoardPlacement} from "./rosterBoardPlacement.ts";
import {wallPortraitProblem,type WallPortraitPlacement} from "./wallPortraitPlacement.ts";
import {wallClockProblem,type WallClockPlacement} from "./wallClockPlacement.ts";
import {bedroomFurnitureProblem,type BedroomFurniturePlacement} from "./bedroomFurniture.ts";
import { firstWorldTickOfDay,lastWorldTickOfDay,MAX_WORLD_DAY,WORLD_TICKS_PER_DAY,
  MAX_PENDING_WORLD_EVENTS,compareScheduledWorldEvents,
  type ScheduledWorldEvent } from "./worldClock.ts";
import {SHOP_REQUEST_TICKS} from "./shopRuntime.ts";
import {validateShopTraffic} from "./shopTraffic.ts";
import {DUNGEON_STEP_INTERVAL_TICKS,DUNGEON_WORLD_EVENT_SUBJECT,
  LIVE_COMBAT_EVENT_SUBJECT,LIVE_COMBAT_INTERVAL_TICKS,
  SHOP_PORTAL_RETURN_PREFIX,SHOP_PORTAL_TRANSIT_TICKS} from "./liveDungeonRuntime.ts";
import {combatFrameTimelineValid,MAX_COMBAT_FRAMES} from "./combatRecording.ts";
import {validCombatProgress} from "./combatProgress.ts";
import {validRetreatExit} from "./combatRetreat.ts";
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
  "welcome", "day-started", "shop-arrival", "shop-stay", "shop-departure", "shop-walkout",
  "influx", "sale", "tip", "healed", "shop-credit",
  "dungeon-live","hero-death-signal",
  "temporary-party-join","temporary-party-leave","hero-buyback",
] as const;


/** Strict, bounded validation of the persisted world and read-only expedition records. */
function validNumber(value: unknown, path: string, low: number, high: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < low || value > high)
    fail(path,"must be a finite number within bounds");
  return value as number;
}
function validateSpatialDungeonWorld(
  raw: unknown, path: string, campaignSeed: number,
  heroIds: Set<string | number>, day: number, floor=7,
): void {
  const world=object(raw,path,["resolvedFeatureIds","heroes"],["siteCycles","monsters"]);
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
  // Monster actors are site-generation-bound and can never be conjured by
  // opening a spectator. Reject forged positions, clocks and extra packs.
  if(world.monsters!==undefined){
    const monsters=array(world.monsters,path+".monsters");
    const features=map.features.filter(f=>f.kind==="monster");
    if(monsters.length>features.length)fail(path+".monsters","exceeds monster site count");
    const ids=new Set<string|number>();
    const positions=new Set<string>();
    const modes=new Set(["IDLE","ROAMING","ALERT","CHASING",
      "SEARCHING","RETURNING","ENGAGED"]);
    monsters.forEach((value,i)=>{
      const item=path+".monsters["+i+"]";
      const monster=object(value,item,
        ["id","siteCycle","x","z","homeX","homeZ","mode",
          "lastMoveTick","nextDecisionTick"],
        ["target","targetHeroId","lastKnown","lastSeenTick","lostSightChecks"]);
      const id=text(monster.id,item+".id");
      unique(id,ids,item+".id");
      const feature=features.find(f=>f.id===id);
      if(!feature||resolved.has(id))
        fail(item+".id","must refer to an active ordinary monster generation");
      const cycle=integer(monster.siteCycle,item+".siteCycle",0,100000);
      const savedCycle=(world.siteCycles as unknown[]|undefined)?.find(raw=>
        typeof raw==="object"&&raw!==null&&
        (raw as RecordValue).id===id) as RecordValue|undefined;
      if(cycle!==(savedCycle?.cycle??0))
        fail(item+".siteCycle","must match the canonical site generation");
      const x=integer(monster.x,item+".x",0,map.width-1);
      const z=integer(monster.z,item+".z",0,map.height-1);
      if(tileAt(map,x,z)==="wall")fail(item,"must occupy a walkable tile");
      unique(x+":"+z,positions,item+".position");
      if(integer(monster.homeX,item+".homeX",0,map.width-1)!==feature.x||
         integer(monster.homeZ,item+".homeZ",0,map.height-1)!==feature.z)
        fail(item,"must retain the true original site coordinates");
      const mode=text(monster.mode,item+".mode");
      if(!modes.has(mode))fail(item+".mode","is not a known monster state");
      integer(monster.lastMoveTick,item+".lastMoveTick");
      integer(monster.nextDecisionTick,item+".nextDecisionTick");
      if(monster.target!==undefined){
        const target=object(monster.target,item+".target",["x","z"]);
        const tx=integer(target.x,item+".target.x",0,map.width-1);
        const tz=integer(target.z,item+".target.z",0,map.height-1);
        if(tileAt(map,tx,tz)==="wall")
          fail(item+".target","must be an accessible dungeon tile");
      }else if(["ROAMING","CHASING","SEARCHING","RETURNING"].includes(mode))
        fail(item+".target","is required for an active monster route");
      if(monster.targetHeroId!==undefined){
        const heroId=text(monster.targetHeroId,item+".targetHeroId");
        if(!heroIds.has(heroId))
          fail(item+".targetHeroId","must be a real adventurer");
      }
      if(monster.lastKnown!==undefined){
        const known=object(monster.lastKnown,item+".lastKnown",["x","z"]);
        const kx=integer(known.x,item+".lastKnown.x",0,map.width-1);
        const kz=integer(known.z,item+".lastKnown.z",0,map.height-1);
        if(tileAt(map,kx,kz)==="wall")
          fail(item+".lastKnown","must be a walkable observed tile");
      }
      if(monster.lastSeenTick!==undefined)
        integer(monster.lastSeenTick,item+".lastSeenTick",0,
          lastWorldTickOfDay(day));
      if(monster.lostSightChecks!==undefined)
        integer(monster.lostSightChecks,item+".lostSightChecks",0,3);
      if(["CHASING","SEARCHING"].includes(mode)&&
        (monster.targetHeroId===undefined||
         monster.lastKnown===undefined||monster.lastSeenTick===undefined))
        fail(item,"must retain the genuine last observed hero and position");
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
    // Physical ascent from Floor 2 can land on Floor 1's lower stair too.
    // No upper-entrance tile should be fabricated for genuine stair arrivals.
    // Any ordinary Floor 1–9 may be entered at its own upper or lower stair.
    const upper=map.entrance.z*map.width+map.entrance.x;
    const lower=dungeonDownStair(map);
    const lowerIndex=lower?lower.z*map.width+lower.x:null;
    if(!visitedIds.has(upper)&&
        (lowerIndex===null||!visitedIds.has(lowerIndex)))
      fail(item+".visited","must include dungeon entrance or arrival stair");
  });
}
function validateSpatialDungeonReplay(
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
  if(![null,...WEAPON_NAMES].some(name=>name===gear.weapon))
    fail(path+".appearance.equipment.weapon","is not recognized");
  if(![null,...ARMOR_NAMES].some(name=>name===gear.armor))
    fail(path+".appearance.equipment.armor","is not recognized");
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
      choice(worn.weapon,[null,...WEAPON_NAMES],memberPath+".equipment.weapon");
      choice(worn.armor,[null,...ARMOR_NAMES],memberPath+".equipment.armor");
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
  if(steps.length<1||steps.length>1+SPATIAL_DUNGEON_STEP_BUDGET*3+3)
    fail(path+".steps","must have a bounded length");
  let lastT=-1,previous:{x:number;z:number}|null=null;
  steps.forEach((value,i)=>{
    const item=path+".steps["+i+"]";
    const step=object(value,item,["x","z","t","action","hp"],["featureId"]);
    const x=integer(step.x,item+".x",0,map.width-1),z=integer(step.z,item+".z",0,map.height-1);
    const t=validNumber(step.t,item+".t",0,SPATIAL_DUNGEON_STEP_BUDGET+1);
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
      if(!feature||(feature.x!==x||feature.z!==z)&&
        !(feature.kind==="monster"&&
          ["combat","defeat-monster","retreat","death"].includes(
            step.action as string)))
        fail(item+".featureId","must match its real encounter or authored site");
    }
    previous={x,z};
  });
  const encounters=array(record.encounters,path+".encounters");
  if(encounters.length>SPATIAL_DUNGEON_MAX_ENCOUNTERS)
    fail(path+".encounters","must contain only actual bounded day encounters");
  encounters.forEach((value,i)=>{
    const item=path+".encounters["+i+"]";
    const encounter=object(value,item,["featureId","x","z","combat"],["siteCycle"]);
    if(encounter.siteCycle!==undefined)
      integer(encounter.siteCycle,item+".siteCycle",0,100000);
    const feature=features.get(text(encounter.featureId,item+".featureId"));
    if(!feature||feature.kind!=="monster")fail(item+".featureId","must refer to a monster");
    const contact=steps.some(rawStep=>{
      const step=rawStep as {x:number;z:number;featureId?:string;action:string};
      return step.featureId===feature.id&&step.x===encounter.x&&
        step.z===encounter.z&&
        (step.action==="combat"||step.action==="defeat-monster");
    });
    if(!contact||tileAt(map,encounter.x as number,encounter.z as number)==="wall")
      fail(item,"must match the real recorded monster contact");
    const combat=object(encounter.combat,item+".combat",[
      "version","actors","bounds","obstacles","frames","cues","outcome",
    ]);
    if(combat.version!==1)fail(item+".combat.version","is incompatible");
    choice(combat.outcome,["heroes","monsters","retreat","draw"],item+".combat.outcome");
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
      ],["radius","healCharges","magicHeals","equipment","meleeAbility","specialAbility","agility",
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
        choice(gear.weapon,[null,...WEAPON_NAMES],a+".equipment.weapon");
        choice(gear.armor,[null,...ARMOR_NAMES],a+".equipment.armor");
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
    if(frames.length<1||frames.length>MAX_COMBAT_FRAMES)
      fail(item+".combat.frames","must contain bounded frames");
    let lastFrame=-1;
    frames.forEach((f,j)=>{
      const fp=item+".combat.frames["+j+"]";
      const frame=object(f,fp,["t","actors","projectiles"]);
      const t=validNumber(frame.t,fp+".t",0,Number.MAX_SAFE_INTEGER/60);
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
    if(cues.length>50000)fail(item+".combat.cues","is oversized");
    cues.forEach((c,j)=>{
      const cp=item+".combat.cues["+j+"]",cue=object(c,cp,["t","actorId","kind"],["targetId","amount"]);
      if(!actorIds.has(cue.actorId as string))fail(cp+".actorId","is unknown");
      if(cue.targetId!==undefined && !actorIds.has(cue.targetId as string))
        fail(cp+".targetId","is unknown");
      choice(cue.kind,["attack","cast","projectile","hit","miss","dodge",
        "parry","heal","death","blocked",
        "grab","throw","landing","escape","lava","retreat-start","retreat","stalemate"],cp+".kind");
      validNumber(cue.t,cp+".t",0,Number.MAX_SAFE_INTEGER/60);
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
  if(combatTick<lastStepTick-LIVE_COMBAT_INTERVAL_TICKS||combatTick>clockTick)
    fail(path+".combatTick","does not follow the active expedition step");
  const known=new Set<string|number>();
  const sites=new Set<string|number>();
  for(const [index,raw] of rawCombats.entries()){
    const cp=path+".combats["+index+"]";
    const battle=object(raw,cp,[
      "id","startedTick","encounter","heroIds","arrivals","state","frames",
    ]);
    const started=integer(battle.startedTick,cp+".startedTick",
      0,lastStepTick);
    const startedDay=Math.floor(started/WORLD_TICKS_PER_DAY)+1;
    // A bounded ordinary encounter can survive more than one 2.5-second
    // movement event while other heroes continue exploring. Require an
    // actual historical movement cadence, not the latest movement tick.
    // The exact combat age, identity, frames and actors are checked below.
    if(started<firstWorldTickOfDay(startedDay)+DUNGEON_STEP_INTERVAL_TICKS||
      (startedDay===day&&(lastStepTick-started)%DUNGEON_STEP_INTERVAL_TICKS!==0)||
      (combatTick-started)%LIVE_COMBAT_INTERVAL_TICKS!==0)
      fail(cp+".startedTick","must identify a committed movement tick on the active combat clock");
    const encounter=object(battle.encounter,cp+".encounter",[
      "featureId","floor","x","z","siteCycle","elite","options",
    ]);
    choice(encounter.floor,[1,2,3,4,5,6,7,8,9],cp+".encounter.floor");
    const floor=encounter.floor as number;
    const featureId=text(encounter.featureId,cp+".encounter.featureId");
    const layout=generateExpeditionLayout(state.seed as number,
      floor as SpatialDungeonFloor);
    const feature=layout.features.find(f=>f.id===featureId&&f.kind==="monster");
    if(!feature||tileAt(layout,encounter.x as number,encounter.z as number)==="wall")
      fail(cp+".encounter","must identify one real reached monster tile");
    const cycle=integer(encounter.siteCycle,cp+".encounter.siteCycle",0,100000);
    if(typeof encounter.elite!=="boolean")
      fail(cp+".encounter.elite","must be boolean");
    unique(floor+":"+featureId,sites,cp+".encounter.featureId");
    if(battle.id!=="battle:"+startedDay+":"+started+":"+floor+":"+featureId)
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
        hero.status!=="exploring")
        fail(cp+".heroIds["+i+"]","must identify a living co-located explorer");
      members.push(hero);
    });
    const world:SpatialDungeonWorld=
      ((state.dungeonWorlds as {floor:number;world:SpatialDungeonWorld}[]|undefined)
        ?.find(entry=>entry.floor===floor)?.world??{heroes:[],resolvedFeatureIds:[]});
    if(world.monsters&&
      !world.monsters.some(m=>m.id===featureId&&m.siteCycle===cycle&&
        m.x===encounter.x&&m.z===encounter.z))
      fail(cp+".encounter","must match the reserved roaming pack location");
    if(!world.monsters&&
      (feature.x!==encounter.x||feature.z!==encounter.z))
      fail(cp+".encounter","has no matching original monster");
    if(world.resolvedFeatureIds.includes(featureId)||
      (world.siteCycles?.find(x=>x.id===featureId)?.cycle??0)!==cycle)
      fail(cp+".encounter.siteCycle","cannot reserve a resolved or regenerated site");
    for(const member of members){
      const progress=world.heroes.find(h=>h.heroId===member.id);
      if(!progress||progress.x!==encounter.x||progress.z!==encounter.z)
        fail(cp+".heroIds","must actually occupy the monster's tile");
    }
    const arrivals=array(battle.arrivals,cp+".arrivals");
    if(arrivals.length!==members.length)
      fail(cp+".arrivals","must retain each real party member's approach");
    arrivals.forEach((rawArrival,i)=>{
      const ap=cp+".arrivals["+i+"]";
      validateSpatialDungeonReplay(rawArrival,ap,members[i].id,startedDay,
        state.seed as number,floor,new Set(roster.map(x=>x.id as string)));
      const r=rawArrival as RecordValue;
      const steps=r.steps as {x:number;z:number;action:string;featureId?:string}[];
      const tail=steps[steps.length-1];
      if(r.outcome!=="exploring"||(r.encounters as unknown[]).length||
        !tail||tail.action!=="combat"||tail.featureId!==featureId||
        tail.x!==encounter.x||tail.z!==encounter.z)
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
    const actualMonster={...feature,x:encounter.x as number,z:encounter.z as number};
    const liveCanonical=prepareSpatialDungeonCombat(members,actualMonster,
      layout.seed,layout,initialApproach,cycle,true);
    const legacyCanonical=prepareSpatialDungeonCombat(members,actualMonster,
      layout.seed,layout,initialApproach,cycle,false);
    // Pre-progression saves may contain a fight begun at higher XP with
    // seeded BASE stats and no ordinary healer spells. The saved 60Hz
    // fight must finish with precisely its original actors, not be
    // rewritten mid-swing by a gameplay update. Match either exact
    // historical footprint, never accept arbitrary forged fighter values.
    const historicalMembers=members.map(member=>({...member,level:1}));
    const historicalLive=prepareSpatialDungeonCombat(historicalMembers,actualMonster,
      layout.seed,layout,initialApproach,cycle,true);
    const historicalSolo=prepareSpatialDungeonCombat(historicalMembers,actualMonster,
      layout.seed,layout,initialApproach,cycle,false);
    const withoutNewSpells=(canonical:typeof historicalLive)=>
      ({...canonical,options:{...canonical.options,
        actors:canonical.options.actors.map(actor=>{
          if(actor.team!=="heroes")return actor;
          const {magicHeals:_historicalNewSpell,...legacyActor}=actor;
          return legacyActor;
        }),
      }});
    const candidates=[liveCanonical,legacyCanonical,
      withoutNewSpells(historicalLive),withoutNewSpells(historicalSolo)];
    if(!candidates.some(canonical=>
      canonical.elite===encounter.elite&&
      JSON.stringify(canonical.options)===JSON.stringify(options)))
      fail(cp+".encounter.options",
        "must match a seeded LIVE pack or historical pre-progression actor");
    let initial;
    try {initial=createGroupCombat(options as unknown as GroupCombatOptions);}
    catch {fail(cp+".encounter.options","is not a valid group combat");}

    const combat=object(battle.state,cp+".state",[
      "actors","bounds","obstacles","projectiles","events","time","outcome",
    ],["environment","tacticsSeed","retreat","progress"]);
    if(combat.retreat!==undefined&&!validRetreatExit(combat.retreat,initial.bounds,initial.environment))
      fail(cp+".state.retreat","must match a genuine arena exit");
    if(combat.environment!==initial.environment||
       combat.tacticsSeed!==initial.tacticsSeed)
      fail(cp+".state.environment","must match the real encounter rules");
    if(combat.tacticsSeed!==undefined)
      integer(combat.tacticsSeed,cp+".state.tacticsSeed",0,0xffffffff);
    if(combat.outcome!=="fighting")fail(cp+".state.outcome","must still be active");
    const completed=(combatTick-started)*3;
    const time=validNumber(combat.time,cp+".state.time",0,Number.MAX_SAFE_INTEGER/60);
    if(combat.progress!==undefined&&!validCombatProgress(combat.progress,time))
      fail(cp+".state.progress","must match the committed encounter time");
    if(Math.abs(time*60-completed)>0.001)
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
    if(cues.length>50000)fail(cp+".state.events","is oversized");
    cues.forEach((rawCue,i)=>{
      const qp=cp+".state.events["+i+"]";
      const cue=object(rawCue,qp,["t","actorId","kind"],["targetId","amount"]);
      if(!actorIds.has(cue.actorId as string)||(
        cue.targetId!==undefined&&!actorIds.has(cue.targetId as string)))
        fail(qp+".actorId","must reference existing fighters");
      choice(cue.kind,["attack","cast","projectile","hit","miss","dodge",
        "parry","heal","death","blocked","grab","throw","landing","escape","lava","retreat-start","retreat","stalemate"],qp+".kind");
      validNumber(cue.t,qp+".t",0,Number.MAX_SAFE_INTEGER/60);
      if(cue.amount!==undefined)validNumber(cue.amount,qp+".amount",0,100000);
    });
    const frames=array(battle.frames,cp+".frames");
    if(!combatFrameTimelineValid(frames,completed))
      fail(cp+".frames","must retain the valid committed frame timeline");
    let previousTime=-1;
    frames.forEach((rawFrame,i)=>{
      const fp=cp+".frames["+i+"]";
      const frame=object(rawFrame,fp,["t","actors","projectiles"]);
      const t=validNumber(frame.t,fp+".t",0,Number.MAX_SAFE_INTEGER/60);
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
    const plan=object(raw,path,["heroId","floor","goal","action","updatedTick"],["threatMemory"]);
    const id=text(plan.heroId,path+".heroId");
    unique(id,ids,path+".heroId");
    choice(plan.floor,[1,2,3,4,5,6,7,8,9],path+".floor");
    choice(plan.goal,["farm","progress","test-gear","caution","resupply",
      "loot-chest","hunt-ghouls"],
      path+".goal");
    choice(plan.action,["stay","ascend","descend","shop"],path+".action");
    integer(plan.updatedTick,path+".updatedTick",0,clockTick);
    if(plan.threatMemory!==undefined){
      const m=object(plan.threatMemory,path+".threatMemory",["monsterId","x","z","seenTick"]);
      const map=generateExpeditionLayout(state.seed as number,plan.floor as number);
      const x=integer(m.x,path+".threatMemory.x",0,map.width-1);
      const z=integer(m.z,path+".threatMemory.z",0,map.height-1);
      if(map.tiles[z*map.width+x]==="wall"||!map.features.some(f=>f.kind==="monster"&&f.id===m.monsterId))
        fail(path+".threatMemory","must identify a real pack site and a walkable observed tile");
      integer(m.seenTick,path+".threatMemory.seenTick",0,clockTick);
    }
    const hero=roster.find(h=>h.id===id);
    if(!enabled||!hero||hero.health===0||hero.floor!==plan.floor||
      hero.status!=="exploring")
      fail(path+".heroId","must name a living committed explorer on the recorded floor");
    if((plan.action==="ascend"&&(plan.floor as number)<=1)||
      (plan.action==="descend"&&(plan.floor as number)>=10))
      fail(path+".action","must be an authored adjacent early-floor transition");
 
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
    choice(journey.fromFloor,[1,2,3,4,5,6,7,8,9,10],path+".fromFloor");
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
      if(floor!==10){
        const world:SpatialDungeonWorld=
          ((state.dungeonWorlds as {floor:number;world:SpatialDungeonWorld}[]|undefined)
            ?.find(w=>w.floor===floor)?.world??{heroes:[],resolvedFeatureIds:[]});
        const progress=world.heroes.find(p=>p.heroId===heroId);
        const entrance=generateExpeditionLayout(state.seed as number,floor).entrance;
        if(!progress||progress.x!==entrance.x||progress.z!==entrance.z)
          fail(path+".phase","portal traveler must have reached the real floor entrance");
      }
      const due=integer(journey.dueTick,path+".dueTick",
        clockTick+1,Number.MAX_SAFE_INTEGER);
      if(due!==started+SHOP_PORTAL_TRANSIT_TICKS||
        hero.status!=="traveling"||hero.floor!=="transit")
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
      if(![1,2,3,4,5,6,7,8,9].includes(floor)||
        hero.floor!==floor||
        hero.status!=="exploring")
        fail(path,"must backtrack on the real hero floor");
      const world:SpatialDungeonWorld=
        ((state.dungeonWorlds as {floor:number;world:SpatialDungeonWorld}[]|undefined)
          ?.find(w=>w.floor===floor)?.world??{heroes:[],resolvedFeatureIds:[]});
      const progress=world.heroes.find(p=>p.heroId===heroId);
      if(!progress)
        fail(path+".heroId","must have an actual saved dungeon location");
      try {
        chooseKnownReturnStep(generateExpeditionLayout(
          state.seed as number,floor),progress);
      } catch {
        fail(path+".heroId","must have a connected, physically explorable route home");
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
    "dungeonWorlds", "shopLayout", "shopCarts", "shopDebts",
    "shopRoom","bedroomFurniture","rosterBoard","wallClock",
    "cellarRoom","cellarChest","cellarTable","cellarDoorOpen","cellarFishCaught","buybackChestOpen",
  ], ["wallPortrait","dungeonParties"]);
  const room=state.shopRoom;
  if (!isValidShopRoomGeometry(room))
    fail("payload.shopRoom", "has invalid excavation geometry");
  if(!isValidCellarRoom(state.cellarRoom))
    fail("payload.cellarRoom","has invalid cellar excavation geometry");
  integer(state.cellarFishCaught,"payload.cellarFishCaught",0,1000000);
  if(typeof state.buybackChestOpen!=="boolean")fail("payload.buybackChestOpen","must be a boolean");
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
  {
    const raw=object(state.cellarTable,"payload.cellarTable",["id","x","z","rotation"]);
    if(raw.id!=="cellar-table")fail("payload.cellarTable.id","is invalid");
    const table:CellarTablePlacement={
      id:"cellar-table",
      x:validNumber(raw.x,"payload.cellarTable.x",-14,14),
      z:validNumber(raw.z,"payload.cellarTable.z",-41,-13),
      rotation:integer(raw.rotation,"payload.cellarTable.rotation",0,3) as 0|1|2|3,
    };
    // The cellar chest was strictly parsed and validated immediately above.
    const problem=cellarTableProblem(table,state.cellarRoom,
      state.cellarChest as CellarChestPlacement);
    if(problem)fail("payload.cellarTable",problem);
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
      ["partyBossCombat"]);
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
    const partyBoss=live.partyBossCombat??null;
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
        combatTick!==0||combats.length||partyBoss||
        returning.length||plans.length)
        fail("payload.liveDungeon","legacy mode cannot have scheduled dungeon work");
    }else{
      if(last<firstWorldTickOfDay(day))
        fail("payload.liveDungeon.lastStepTick","is from an earlier world day");
      const due=last+DUNGEON_STEP_INTERVAL_TICKS;
      if(movements.length!==(due<=lastWorldTickOfDay(day)?1:0)||
         movements.some(e=>e.dueTick!==due)||
         fights.length!==(combats.length||partyBoss?1:0)||
         fights.some(e=>e.dueTick!==combatTick+LIVE_COMBAT_INTERVAL_TICKS)||
         dungeonEvents.length!==movements.length+fights.length)
        fail("payload.liveDungeon","must own its exact next movement and combat ticks");
    }
    validateLiveCombatCheckpoints(state,combats,day,clockTick,last,combatTick,
      !!partyBoss);
    const partyBossProblem=livePartyBossCheckpointProblem(
      state as unknown as GameState,partyBoss,combatTick,last);
    if(partyBossProblem)
      fail("payload.liveDungeon.partyBossCombat",partyBossProblem);
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
      "equipment", "inventory", "floor", "status", "shopStayDays", "offDutyUntilTick",
    ],["lastDungeonFloor"]);
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
    const xp = integer(hero.xp, `${path}.xp`);
    const level=integer(hero.level, `${path}.level`, 1);
    if(level!==heroLevel(xp))
      fail(`${path}.level`, "must agree with XP");
    const maxHealth=heroProgression({
      role:hero.role as "tank"|"DPS"|"healer",level,
      stats:stats as unknown as {strength:number;agility:number;intellect:number;maxHealth:number},
    }).maxHealth;
    const health = integer(hero.health, `${path}.health`, 0, maxHealth);
    const traits = object(hero.traits, `${path}.traits`, ["positive", "neutral", "negative"]);
    for (const key of Object.keys(traits)) text(traits[key], `${path}.traits.${key}`);
     integer(hero.gold, `${path}.gold`);
    const equipment = object(hero.equipment, `${path}.equipment`, ["weapon", "armor"]);
    for (const key of Object.keys(equipment)) {
      if (equipment[key] !== null) text(equipment[key], `${path}.equipment.${key}`);
    }
    const inventory = object(hero.inventory, `${path}.inventory`,
      ["bread", "healing"],["finds"]);
    for (const key of ["bread","healing"])
      integer(inventory[key], `${path}.inventory.${key}`);
    if(inventory.finds!==undefined){
      const finds=object(inventory.finds,path+".inventory.finds",[],itemIds);
      let total=0;
      for(const [id,quantity] of Object.entries(finds))
        total+=integer(quantity,path+".inventory.finds."+id,1,1000);
      if(total>1000)fail(path+".inventory.finds","is oversized");
    }
    const floor = hero.floor === "shop" || hero.floor === "away" ||
      hero.floor === "transit"
      ? hero.floor : integer(hero.floor, `${path}.floor`, 1, 10);
    if(hero.status==="expedition"&&floor!==10)
      fail(`${path}.status`,"Only Floor 10 supports boss expeditions");
    if(hero.lastDungeonFloor!==undefined)
      integer(hero.lastDungeonFloor,path+".lastDungeonFloor",1,9);
    choice(hero.status, ["exploring", "traveling", "at-shop",
      "returning", "expedition", "departing", "off-duty", "dead"], `${path}.status`);
    if ((hero.status === "dead") !== (health === 0)) fail(`${path}.status`, "must agree with health");
    if (hero.status !== "dead") {
      active += 1;
      if (((hero.status === "at-shop" || hero.status === "departing") &&
             floor !== "shop") ||
          (hero.status === "off-duty" && floor !== "away") ||
          (hero.status === "exploring" &&
             (typeof floor !== "number" || floor > 9)) ||
          ((hero.status === "traveling" || hero.status === "returning") && floor !== "transit") ||
          (hero.status === "expedition" && floor !== 10)) {
        fail(`${path}.floor`, "must agree with status");
      }
    }
    const until=hero.offDutyUntilTick;
    if(hero.status==="off-duty"){
      if(until===null)fail(path+".offDutyUntilTick","is required off duty");
      integer(until,path+".offDutyUntilTick",Math.max(1,clockTick-2*DUNGEON_STEP_INTERVAL_TICKS),clockTick+MAX_POST_SHOP_RECOVERY_TICKS);
    }else if(until!==null)
      fail(path+".offDutyUntilTick","is only valid for off-duty heroes");
    const stay = integer(hero.shopStayDays, `${path}.shopStayDays`, 0, 1);
    if (stay !== 0 && hero.status !== "at-shop" && hero.status !== "dead") {
      fail(`${path}.shopStayDays`, "requires a shop visit");
    }
  });
  if (active > maxActive) fail("payload.adventurers", "exceeds the active population capacity");
  const worlds=array(state.dungeonWorlds,"payload.dungeonWorlds");
  if(worlds.length>9)fail("payload.dungeonWorlds","must cover at most nine ordinary floors");
  const seenFloors=new Set<string|number>();
  worlds.forEach((value,i)=>{
    const path="payload.dungeonWorlds["+i+"]";
    const entry=object(value,path,["floor","world"]);
    const floor=integer(entry.floor,path+".floor",1,9);
    unique(floor,seenFloors,path+".floor");
    validateSpatialDungeonWorld(entry.world,path+".world",campaignSeed,heroIds,day,floor);
  });
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
      const floor=integer(group.floor,path+".floor",1,9);
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
          hero.status!=="exploring"||
          (hero.health as number)<=0)
          fail(p,"must be a living explorer on the party floor");
        return hero;
      });
      const savedWorld=((state.dungeonWorlds??[]) as {floor:number;world:SpatialDungeonWorld}[])
        .find(entry=>entry.floor===floor)?.world ??
        {resolvedFeatureIds:[],heroes:[]};
      const layout=generateExpeditionLayout(campaignSeed,floor);
      const first=getSpatialDungeonProgress(savedWorld,
        members[0].id as string,layout);
      if(members.some(hero=>{
        const position=getSpatialDungeonProgress(savedWorld,hero.id as string,layout);
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

  {
    const raw=object(state.wallClock,"payload.wallClock",["x","z","rotation"]);
    const sideLimit=7+room.expansionTier*2+.5;
    const clock:WallClockPlacement={
      x:validNumber(raw.x,"payload.wallClock.x",-sideLimit,sideLimit),
      z:validNumber(raw.z,"payload.wallClock.z",-8,8),
      rotation:integer(raw.rotation,"payload.wallClock.rotation",0,3) as 0|1|2|3,
    };
    const problem=wallClockProblem(clock,parsedShopLayout,room,
      state.rosterBoard as RosterBoardPlacement,
      state.wallPortrait as WallPortraitPlacement|undefined);
    if(problem)fail("payload.wallClock",problem);
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
    ["iron-ore","coal","ghoul-leather"]);
  for(const id of ["iron-ore","coal","ghoul-leather"] as const)
    integer(reserve[id],"payload.shopEconomy.materialStorage."+id,0);
  integer(economy.balance, "payload.shopEconomy.balance");
  const permittedItems = itemIds;
  const bag = object(economy.bag, "payload.shopEconomy.bag", permittedItems);
  let bagTotal = 0;
  for (const id of permittedItems) bagTotal += integer(bag[id], `payload.shopEconomy.bag.${id}`, 0, ECONOMY.bagCapacity);
  if (bagTotal > ECONOMY.bagCapacity) fail("payload.shopEconomy.bag", "exceeds bag capacity");
  if(bag["iron-ore"]!==0||bag.coal!==0||bag["ghoul-leather"]!==0)
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
    unique(integer(floor.floor, `${path}.floor`, 1, 10), floors, `${path}.floor`);
    if (typeof floor.cleared !== "boolean") fail(`${path}.cleared`, "must be a boolean");
  });

  const eventIds = new Set<string | number>();
  const signaledDeaths=new Set<string | number>();
  let lastDay = 1;
  const visitSuffixes=new Map<string,string>();
  const visitRevenue=new Map<string,number>();
  const visitClosed=new Set<string>();
  array(state.events, "payload.events").forEach((value, index) => {
    const path = `payload.events[${index}]`;
    const event = object(value, path, ["id", "type", "day", "message"],
      ["adventurerId", "worldTick", "reportedZone", "dungeonHighlight", "shopReason", "itemId", "quantity", "revenue", "cost",
        "partyBossReplay", "dungeonReplay",
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
        event.type!=="hero-death-signal"&&event.type!=="healed")
        fail(path+".worldTick","is not allowed for this event type");
    }
    if(eventDay!==lastDay){visitSuffixes.clear();visitRevenue.clear();visitClosed.clear();}
    lastDay = eventDay;
    text(event.message, `${path}.message`);
    const id = text(event.id, `${path}.id`);
    unique(id, eventIds, `${path}.id`);
    const global = ["welcome", "day-started"].includes(event.type as string);
    if (!global && !heroIds.has(event.adventurerId as string)) fail(`${path}.adventurerId`, "must link to an existing hero");
    const allowed = ["id", "type", "day", "message",
      ...(event.type==="shop-walkout"?["worldTick","shopReason"]:[]),
      ...(event.type==="healed"&&event.worldTick!==undefined?["worldTick"]:[]),
      ...(event.type==="shop-departure"&&event.worldTick!==undefined?["worldTick"]:[]),
      ...(event.type==="shop-arrival"&&event.worldTick!==undefined?["worldTick"]:[]),
      ...((event.type==="temporary-party-join"||
        event.type==="temporary-party-leave")&&event.worldTick!==undefined
        ?["worldTick"]:[]),
      ...(event.type==="hero-death-signal"?["worldTick"]:[]),
      ...(event.type==="dungeon-live"?["worldTick",
        ...(event.reportedZone!==undefined?["reportedZone"]:[]),
        ...(event.dungeonHighlight!==undefined?["dungeonHighlight"]:[]),
        ...(event.dungeonReplay!==undefined?["dungeonReplay"]:[]),
        ...(event.partyBossReplay!==undefined?["partyBossReplay"]:[])]:[]),
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
      const dungeonState=state.liveDungeon as GameState["liveDungeon"];
      const inCombat=dungeonState.combats.some(f=>
        f.state.actors.some(a=>a.id===event.adventurerId&&a.hp<=0))||
        !!dungeonState.partyBossCombat?.state.actors.some(a=>
          a.id===event.adventurerId&&a.hp<=0);
      if(!hero||(!(hero.status==="dead"&&hero.health===0)&&!inCombat))
        fail(path+".adventurerId","must be a real fallen hero or active zero-HP fighter");
    }
    if(event.type==="dungeon-live"){
      if(event.partyBossReplay!==undefined){
        const problem=partyBossReplayProblem(event.partyBossReplay,
          String(event.adventurerId));
        if(problem)fail(path+".partyBossReplay",problem);
      }
      if(event.dungeonHighlight!==undefined)
        choice(event.dungeonHighlight,["treasure","trap"],path+".dungeonHighlight");
      if(event.reportedZone!==undefined)
        choice(event.reportedZone,["upper","deep"],path+".reportedZone");
      if(event.worldTick===undefined)
        fail(path+".worldTick","is mandatory for real live dungeon events");
    }
    const visitor=String(event.adventurerId??"");
    if(event.type==="shop-arrival"){
      visitSuffixes.set(visitor,event.worldTick===undefined?"":":visit:"+event.worldTick);
      visitRevenue.delete(visitor);
      visitClosed.delete(visitor);
    }
    const visit=visitSuffixes.get(visitor)??"";
    let suffix = event.type === "day-started" ? "started" : event.type;
    if(event.type==="shop-walkout"||event.type==="shop-credit"||event.type==="tip")suffix+=visit;
    if(event.type==="healed"&&event.worldTick!==undefined)suffix+=":"+event.worldTick;
    if(event.type==="shop-departure"){visitClosed.add(visitor);visitRevenue.delete(visitor);}
    if(visitClosed.has(visitor)&&(event.type==="shop-walkout"||
      event.type==="shop-credit"||event.type==="tip"||
      (event.type==="sale"&&event.saleChannel==="manual")))
      fail(path+".id","requires a new arrival after the prior physical departure");
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
    if(event.type==="dungeon-live"){
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
        const floor=integer(replay.floor,path+".dungeonReplay.floor",1,9);
        validateSpatialDungeonReplay(event.dungeonReplay,path+".dungeonReplay",
          event.adventurerId as string,eventDay,campaignSeed,floor,heroIds);
      }
    }
    if(event.type==="hero-buyback"){
      allowed.push("itemId","quantity","cost");
      choice(event.itemId,MATERIAL_ITEMS.map(item=>item.id),path+".itemId");
      if(integer(event.quantity,path+".quantity",1,1)!==1)
        fail(path+".quantity","must represent one actual purchased material");
      const item=MATERIAL_ITEMS.find(entry=>entry.id===event.itemId)!;
      const price=dungeonBuybackPrice(item.id);
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
      const manualRevenue=visitRevenue.get(visitor)??0;
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
      const manualSuffix=event.saleChannel==="manual";
      const marker=":manual"+visit;
      const slotId=manualSuffix&&receiptSlot.endsWith(marker)?
        receiptSlot.slice(0,-marker.length):receiptSlot;
      if(manualSuffix)visitRevenue.set(visitor,(visitRevenue.get(visitor)??0)+(event.revenue as number));
      if (!slotIds.has(slotId) || (manualSuffix&&!receiptSlot.endsWith(marker)))
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
    const manualPaid=manuallyPaidVisitors(state.events as GameState["events"],day);
    for(const cart of array(state.shopCarts,"payload.shopCarts")){
      if(manualPaid.has(String((cart as RecordValue).heroId)))
        fail("payload.shopCarts","cannot reserve goods for a customer already paid during this visit");
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

export function parseSave(text: string): GameState {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Invalid campaign save: malformed JSON.");
  }
  const envelope = object(value, "envelope", ["schemaVersion", "simulationVersion", "savedAt", "payload"]);
  if (envelope.schemaVersion !== SAVE_SCHEMA_VERSION) fail("schemaVersion", "is incompatible; no migrations are available");
  if (envelope.simulationVersion !== SIMULATION_VERSION)
    fail("simulationVersion", "is incompatible with this Alpha build; start a New Game (no migration)");
  if (!textTimestamp(envelope.savedAt)) fail("savedAt", "must be an ISO UTC timestamp");
  if(!envelope.payload||typeof envelope.payload!=="object"||
     (envelope.payload as RecordValue).simulationVersion!==envelope.simulationVersion)
    fail("payload.simulationVersion","is incompatible with the envelope");
  const state=envelope.payload as GameState;
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
