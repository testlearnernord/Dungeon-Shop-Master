import { ECONOMY, ITEMS, createEconomy } from "./economy.ts";
import { SIMULATION_VERSION, type GameState } from "./gameState.ts";
import { validateBossReplay } from "./bossCombatReplay.ts";
import { emptyLevel7World, LEVEL7_STEP_BUDGET } from "./level7Exploration.ts";
import { generateDungeonLayout, tileAt } from "./dungeonLayout.ts";

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
const originalItemIds = itemIds.filter((id) => id !== "iron-sword" && id !== "leather-vest");
const slotDefinitions = createEconomy().slots;
const eventTypes = [
  "welcome", "day-started", "dungeon-outcome", "shop-arrival", "shop-stay", "shop-departure",
  "influx", "sale", "ate", "healed", "starvation", "rescue",
  "level6-departure", "level6-combat", "level6-return",
  "food-shortage", "found-food",
  "level7-departure", "level7-exploration",
] as const;


/** Strict, bounded validation of the persisted world and read-only expedition records. */
function validNumber(value: unknown, path: string, low: number, high: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < low || value > high)
    fail(path,"must be a finite number within bounds");
  return value as number;
}
function validateLevel7World(
  raw: unknown, path: string, campaignSeed: number, heroIds: Set<string | number>,
): void {
  const world=object(raw,path,["resolvedFeatureIds","heroes"]);
  const map=generateDungeonLayout(campaignSeed,7);
  const knownFeatures=new Set(map.features.map(f=>f.id));
  const resolved=new Set<string | number>();
  const entries=array(world.resolvedFeatureIds,path+".resolvedFeatureIds");
  if(entries.length>map.features.length)fail(path+".resolvedFeatureIds","is oversized");
  entries.forEach((value,i)=>{
    const id=text(value,path+".resolvedFeatureIds["+i+"]");
    if(!knownFeatures.has(id))fail(path+".resolvedFeatureIds["+i+"]","must refer to a real feature");
    unique(id,resolved,path+".resolvedFeatureIds["+i+"]");
  });
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
  raw: unknown, path: string, heroId: string, day: number, campaignSeed: number,
): void {
  const record=object(raw,path,[
    "version","day","heroId","floor","appearance","steps","encounters","outcome",
  ],["knownAtStart","resolvedAtStart"]);
  if(record.version!==1||record.floor!==7||record.day!==day||record.heroId!==heroId)
    fail(path,"must match event day, hero and Level 7");
  choice(record.outcome,["exploring","retreat","death","completed"],path+".outcome");
  const appearance=object(record.appearance,path+".appearance",["role","equipment"]);
  choice(appearance.role,["tank","DPS","healer"],path+".appearance.role");
  const gear=object(appearance.equipment,path+".appearance.equipment",["weapon","armor"]);
  if(gear.weapon!==null && gear.weapon!=="Iron Sword")fail(path+".appearance.equipment.weapon","is not recognized");
  if(gear.armor!==null && gear.armor!=="Leather Vest")fail(path+".appearance.equipment.armor","is not recognized");
  const map=generateDungeonLayout(campaignSeed,7);
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
  if(encounters.length>1)fail(path+".encounters","must contain at most one encounter per day");
  encounters.forEach((value,i)=>{
    const item=path+".encounters["+i+"]";
    const encounter=object(value,item,["featureId","x","z","combat"]);
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
    if(actors.length!==2)fail(item+".combat.actors","must represent the hero and one monster");
    const actorIds=new Set<string | number>();
    actors.forEach((rawActor,j)=>{
      const a=item+".combat.actors["+j+"]",actor=object(rawActor,a,[
        "id","team","role","style","x","z","hp","maxHp","damage",
        "armor","speed","reach",
      ],["radius","healCharges"]);
      const id=text(actor.id,a+".id");unique(id,actorIds,a+".id");
      choice(actor.team,["heroes","monsters"],a+".team");
      choice(actor.role,["tank","DPS","healer","monster"],a+".role");
      choice(actor.style,["melee","ranged"],a+".style");
      for(const key of ["x","z","hp","maxHp","damage","armor","speed","reach"])
        validNumber(actor[key],a+"."+key,-10000,100000);
      if(actor.radius!==undefined)validNumber(actor.radius,a+".radius",0.1,3);
      if(actor.healCharges!==undefined)integer(actor.healCharges,a+".healCharges",0,10);
    });
    if(!actorIds.has(heroId)||!actorIds.has(feature.id))
      fail(item+".combat.actors","must contain the real hero and spawn");
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
      if(snapshots.length!==2)fail(fp+".actors","must match combat actors");
      snapshots.forEach((a,k)=>{
        const ap=fp+".actors["+k+"]";
        const snapshot=object(a,ap,["id","x","z","hp","stamina","heading","phase"]);
        if(!actorIds.has(snapshot.id as string))fail(ap+".id","must match a combat actor");
        for(const key of ["x","z","hp","stamina","heading"])
          validNumber(snapshot[key],ap+"."+key,-10000,100000);
        choice(snapshot.phase,["move","windup","strike","recover","cast",
          "heal","roll","parry","hurt","dead"],ap+".phase");
      });
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
        "parry","heal","death","blocked"],cp+".kind");
      validNumber(cue.t,cp+".t",0,26);
      if(cue.amount!==undefined)validNumber(cue.amount,cp+".amount",0,100000);
    });
  });
}

function validateState(value: unknown, version = SIMULATION_VERSION): asserts value is GameState {
  const state = object(value, "payload", [
    "day", "simulationVersion", "events", "adventurers", "shopEconomy", "dungeonFloors",
    "seed", "rngState", "populationConfig", "nextAdventurerId",
    ...(version >= 8 ? ["level7World"] : []),
  ]);
  const day = integer(state.day, "payload.day", 1, Number.MAX_SAFE_INTEGER - 1);
  if (state.simulationVersion !== version) fail("payload.simulationVersion", "is incompatible");
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
      "equipment", "inventory", "floor", "status", "hunger", "shopStayDays",
      ...(version < 4 ? [] : ["level6Permit"]),
      ...(version < 6 ? [] : ["missedFoodShopVisits"]),
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
    const inventory = object(hero.inventory, `${path}.inventory`, ["loot", "food", "healing"]);
    for (const key of Object.keys(inventory)) integer(inventory[key], `${path}.inventory.${key}`);
    const floor = integer(hero.floor, `${path}.floor`, 1, version < 5 ? 5 : version >= 8 ? 7 : 6);
    choice(hero.status, version < 5
      ? ["exploring", "traveling", "at-shop", "returning", "dead"]
      : ["exploring", "traveling", "at-shop", "returning", "expedition", "dead"], `${path}.status`);
    if ((hero.status === "dead") !== (health === 0)) fail(`${path}.status`, "must agree with health");
    if (hero.status !== "dead") {
      active += 1;
      if ((hero.status === "at-shop" && floor !== 5) ||
          (hero.status === "exploring" && floor > 4) ||
          ((hero.status === "traveling" || hero.status === "returning") && floor !== 4) ||
          (hero.status === "expedition" && floor !== 6 && !(version >= 8 && floor === 7))) {
        fail(`${path}.floor`, "must agree with status");
      }
    }
    integer(hero.hunger, `${path}.hunger`);
    if (version >= 6) integer(hero.missedFoodShopVisits, `${path}.missedFoodShopVisits`,
      0, ECONOMY.missedFoodShopsBeforeStarvation);
    if (version >= 4 && typeof hero.level6Permit !== "boolean") fail(`${path}.level6Permit`, "must be boolean");
    if (hero.status === "expedition" && hero.level6Permit !== true) fail(`${path}.level6Permit`, "is required for Level 6");
    const stay = integer(hero.shopStayDays, `${path}.shopStayDays`, 0, 1);
    if (stay !== 0 && hero.status !== "at-shop" && hero.status !== "dead") {
      fail(`${path}.shopStayDays`, "requires a shop visit");
    }
  });
  if (active > maxActive) fail("payload.adventurers", "exceeds the active population capacity");
  if(version >= 8) validateLevel7World(state.level7World,"payload.level7World",campaignSeed,heroIds);

  const economy = object(state.shopEconomy, "payload.shopEconomy", [
    "balance", "bag", "slots", "dailySales", "lastRescueDay",
  ]);
  integer(economy.balance, "payload.shopEconomy.balance");
  const permittedItems = version < 7 ? originalItemIds : itemIds;
  const bag = object(economy.bag, "payload.shopEconomy.bag", permittedItems);
  let bagTotal = 0;
  for (const id of permittedItems) bagTotal += integer(bag[id], `payload.shopEconomy.bag.${id}`, 0, ECONOMY.bagCapacity);
  if (bagTotal > ECONOMY.bagCapacity) fail("payload.shopEconomy.bag", "exceeds bag capacity");
  const slots = array(economy.slots, "payload.shopEconomy.slots");
  if (slots.length !== slotDefinitions.length) fail("payload.shopEconomy.slots", "must contain all ten shelf slots");
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
    choice(slot.itemId, [null, ...permittedItems], `${path}.itemId`);
    if ((quantity === 0) !== (slot.itemId === null)) fail(path, "must have an item exactly when stocked");
  });
  const sales = object(economy.dailySales, "payload.shopEconomy.dailySales", ["day", "units", "revenue"]);
  if (sales.day !== day) fail("payload.shopEconomy.dailySales.day", "must match the current day");
  integer(sales.units, "payload.shopEconomy.dailySales.units");
  integer(sales.revenue, "payload.shopEconomy.dailySales.revenue");
  if (economy.lastRescueDay !== null) integer(economy.lastRescueDay, "payload.shopEconomy.lastRescueDay", 1, day);

  const floors = new Set<string | number>();
  array(state.dungeonFloors, "payload.dungeonFloors").forEach((value, index) => {
    const path = `payload.dungeonFloors[${index}]`;
    const floor = object(value, path, ["floor", "cleared"]);
    unique(integer(floor.floor, `${path}.floor`, 1, version < 5 ? 5 : version >= 8 ? 7 : 6), floors, `${path}.floor`);
    if (typeof floor.cleared !== "boolean") fail(`${path}.cleared`, "must be a boolean");
  });

  const eventIds = new Set<string | number>();
  let lastDay = 1;
  array(state.events, "payload.events").forEach((value, index) => {
    const path = `payload.events[${index}]`;
    const event = object(value, path, ["id", "type", "day", "message"],
      ["adventurerId", "outcome", "itemId", "quantity", "revenue", "combatOutcome",
        ...(version >= 7 ? ["combatReplay"] : []),
        ...(version >= 8 ? ["level7Replay"] : [])]);
    choice(event.type, eventTypes.filter((type) =>
      (version >= 5 || !type.startsWith("level6-")) &&
      (version >= 6 || (type !== "food-shortage" && type !== "found-food")) &&
      (version >= 8 || !type.startsWith("level7-"))), `${path}.type`);
    const eventDay = integer(event.day, `${path}.day`, lastDay, day);
    lastDay = eventDay;
    text(event.message, `${path}.message`);
    const id = text(event.id, `${path}.id`);
    unique(id, eventIds, `${path}.id`);
    const global = ["welcome", "day-started", "rescue"].includes(event.type as string);
    if (!global && !heroIds.has(event.adventurerId as string)) fail(`${path}.adventurerId`, "must link to an existing hero");
    const allowed = ["id", "type", "day", "message", ...(!global ? ["adventurerId"] : [])];
    let suffix = event.type === "day-started" ? "started" : event.type;
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
    if(event.type === "level7-exploration" && event.level7Replay !== undefined) {
      allowed.push("level7Replay");
      validateLevel7Replay(event.level7Replay,`${path}.level7Replay`,
        event.adventurerId as string,eventDay,campaignSeed);
    }
    if (["sale", "ate", "healed", "rescue", "found-food"].includes(event.type as string)) {
      allowed.push("itemId", "quantity");
      choice(event.itemId, permittedItems, `${path}.itemId`);
      integer(event.quantity, `${path}.quantity`, 1,
        event.type === "sale" ? ECONOMY.slotCapacity : event.type === "rescue" ? ECONOMY.rescueQuantity : 1);
      if ((event.type === "ate" || event.type === "rescue" || event.type === "found-food") && event.itemId !== "bread") fail(`${path}.itemId`, "must be bread");
      if (event.type === "healed" && event.itemId !== "healing-herb") fail(`${path}.itemId`, "must be healing-herb");
    }
    if (event.type === "sale") {
      allowed.push("revenue");
      const item = ITEMS.find((entry) => entry.id === event.itemId)!;
      if (event.revenue !== item.salePrice * (event.quantity as number)) fail(`${path}.revenue`, "must match item price and quantity");
      const prefix = `day-${eventDay}:${event.adventurerId}:sale:`;
      if (!id.startsWith(prefix) || !slotIds.has(id.slice(prefix.length))) fail(`${path}.id`, "must link to the sale's shelf slot");
    } else {
      const expected = `day-${eventDay}:${global ? "" : `${event.adventurerId}:`}${suffix}`;
      if (id !== expected) fail(`${path}.id`, "must agree with event day, type and hero");
    }
    for (const key of Object.keys(event)) {
      if (!allowed.includes(key)) fail(`${path}.${key}`, "is not valid for this event type");
    }
  });
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

export function parseSave(text: string): GameState {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Invalid campaign save: malformed JSON.");
  }
  const envelope = object(value, "envelope", ["schemaVersion", "simulationVersion", "savedAt", "payload"]);
  if (envelope.schemaVersion !== SAVE_SCHEMA_VERSION) fail("schemaVersion", "is incompatible; no migrations are available");
  const version = envelope.simulationVersion;
  if (version !== 3 && version !== 4 && version !== 5 && version !== 6 &&
      version !== 7 && version !== SIMULATION_VERSION) {
    fail("simulationVersion", "is incompatible; no migrations are available");
  }
  const savedAt = textTimestamp(envelope.savedAt);
  if (!savedAt) fail("savedAt", "must be an ISO UTC timestamp");
  // Validate the original strict schema BEFORE migrating it; never repair corruption.
  validateState(envelope.payload, version as number);
  if (version === SIMULATION_VERSION) return envelope.payload;
  return {
    ...envelope.payload,
    simulationVersion: SIMULATION_VERSION,
    level7World: emptyLevel7World(),
    shopEconomy: version < 7
      ? { ...envelope.payload.shopEconomy,
        bag: { ...envelope.payload.shopEconomy.bag, "iron-sword": 0, "leather-vest": 0 } }
      : envelope.payload.shopEconomy,
    adventurers: envelope.payload.adventurers.map((hero) => ({
      ...hero,
      level6Permit: version === 3 ? false : hero.level6Permit,
      missedFoodShopVisits: version < 6 ? 0 : hero.missedFoodShopVisits,
    })),
  };
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
    const snapshot = JSON.stringify(createSave(state));
    return this.enqueue(() => this.adapter.update((records) => ({
      latest: snapshot,
      previous: validSave(records.latest) ? records.latest : records.previous,
    })));
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
        return parseSave(records[key]);
      } catch (error) {
        throw new Error(`Cannot load ${key === "latest" ? "latest campaign" : "campaign backup"}; stored data was preserved. ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  deleteGame(): Promise<void> {
    return this.enqueue(() => this.adapter.update(() => ({ latest: null, previous: null })));
  }
}
