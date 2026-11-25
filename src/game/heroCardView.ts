import type {AdventurerState,AdventurerRole} from "./adventurers.ts";
import {heroProgression} from "./heroProgression.ts";
import type {GameState} from "./gameState.ts";
import type {ItemId} from "./economy.ts";
import type {SpatialDungeonReplay} from "./spatialDungeonExploration.ts";
import type {CombatantSpec,GroupReplayFrame,GroupPhase} from "./groupCombat.ts";
import {heroDisplayNames} from "./heroIdentity.ts";
import {rosterEntries,type RosterFilter} from "./rosterView.ts";

/** ONE read-only projection for Shop, Roster, LIVE Floor, World Echoes,
 * recorded fights and the V combat laboratory. No RNG, movement or save writes.
 * Historical data absent from a recording remains absent, never borrowed
 * from a modern version of the same hero. */
export interface HeroCardView {
  readonly id:string;readonly name:string;readonly role:AdventurerRole;
  readonly source:"live"|"recorded"|"training";
  readonly level:number|null;readonly health:number|null;
  readonly maxHealth:number|null;readonly xp:number|null;
  readonly gold:number|null;readonly floor:number|null;
  readonly status:string;readonly activity:string|null;
  readonly goal:string|null;readonly action:string|null;
  readonly party:readonly string[];
  readonly stats:Readonly<{strength:number;agility:number;intellect:number;maxHealth:number}>|null;
  readonly traits:Readonly<{positive:string;neutral:string;negative:string}>|null;
  readonly equipment:Readonly<{weapon:string|null;armor:string|null}>;
  readonly inventory:Readonly<{bread:number;healing:number;
    finds?:Partial<Record<ItemId,number>>}>|null;
  readonly recent:readonly string[];
  readonly observations?:readonly {icon:"map"|"search"|"swords"|"users"|"info";text:string}[];
  readonly combat:Readonly<{damage:number;armor:number;heals:number;
    phase:GroupPhase|null;stamina:number|null}>|null;
}

function displayedHeroStats(hero:AdventurerState){
  const {strength,agility,intellect,maxHealth}=heroProgression(hero);
  return {strength,agility,intellect,maxHealth};
}

export function liveHeroCard(
  state:GameState,heroId:string,
  context:{activity?:string|null;goal?:string|null;action?:string|null;
    health?:number;includeRecent?:boolean;name?:string}={},
):HeroCardView|null {
  const hero=state.adventurers.find(h=>h.id===heroId);
  if(!hero)return null;
  const name=context.name??heroDisplayNames(state.adventurers).get(hero.id)??hero.name;
  const fight=state.liveDungeon.combats.find(c=>c.heroIds.includes(hero.id))??
    (state.liveDungeon.partyBossCombat?.heroIds.includes(hero.id)?state.liveDungeon.partyBossCombat:null);
  const actor=fight?.state.actors.find(a=>a.id===hero.id);
  const group=state.dungeonParties?.find(p=>p.memberIds.includes(heroId));
  const plan=state.liveDungeon.plans.find(p=>p.heroId===heroId);
  const recent=context.includeRecent===false?[]:state.events.filter(e=>e.adventurerId===heroId)
    .slice(-3).reverse().map(e=>e.message);
  return {
    id:hero.id,name,role:hero.role,
    source:"live",level:hero.level,
    health:context.health??actor?.hp??hero.health,maxHealth:actor?.maxHp??heroProgression(hero).maxHealth,
    xp:hero.xp,gold:hero.gold,
    floor:typeof hero.floor==="number"?hero.floor:null,status:actor?"combat":hero.status,
    activity:context.activity??actor?.phase??null,goal:context.goal??plan?.goal??null,
    action:context.action??plan?.action??null,
    party:group?.memberIds??[],stats:displayedHeroStats(hero),traits:hero.traits,
    equipment:hero.equipment,inventory:hero.inventory,recent,observations:[],
    combat:null,
  };
}

export function combatHeroCard(
  spec:CombatantSpec,frame:GroupReplayFrame,
  options:{name?:string;liveHero?:AdventurerState|null;training?:boolean}={},
):HeroCardView {
  const actor=frame.actors.find(a=>a.id===spec.id);
  const live=options.liveHero??null;
  const source=options.training?"training":live?"live":"recorded";
  return {
    id:spec.id,name:options.name??live?.name??spec.id,
    role:spec.role==="monster"?"DPS":spec.role,source,
    level:live?.level??null,health:actor?.hp??spec.hp,
    maxHealth:spec.maxHp,xp:live?.xp??null,gold:live?.gold??null,
    floor:typeof live?.floor==="number"?live.floor:null,
    status:actor?.hp===0?"dead":"combat",
    activity:actor?.phase??null,goal:null,action:null,party:[],
    stats:live?displayedHeroStats(live):null,traits:live?.traits??null,
    equipment:spec.equipment??live?.equipment??{weapon:null,armor:null},
    inventory:live?.inventory??null,recent:[],observations:[],
    combat:{damage:spec.damage,armor:spec.armor,
      heals:Math.max(0,(spec.healCharges??0)+(spec.magicHeals??0)),
      phase:actor?.phase??null,stamina:actor?.stamina??null},
  };
}

/** Shared presentation-only XP progress; levels advance every 100 real XP. */
export function heroXpProgress(xp:number|null):number|null{
  return xp===null?null:Math.max(0,Math.min(100,xp%100));
}

/** Outside combat, spatial recordings know the historical role, gear, path,
 * position and HP, but not every RPG attribute. No present-day values leak. */
export function recordedHeroCard(
  record:SpatialDungeonReplay,name:string,
  observedStep=record.steps[0],
):HeroCardView {
  return {
    id:record.heroId,name,role:record.appearance.role,
    source:"recorded",level:null,
    health:observedStep?.hp??null,maxHealth:null,
    xp:null,gold:null,floor:record.floor,status:"recorded expedition",
    activity:observedStep?.action??"archived",goal:null,action:null,
    party:record.partyMemberIds??[],stats:null,traits:null,
    equipment:record.appearance.equipment,inventory:null,recent:[],
    combat:null,observations:[
      {icon:"map",text:"Floor "+record.floor+" · Day "+record.day},
      ...(observedStep?[{icon:"map" as const,
        text:"Tile ("+observedStep.x+", "+observedStep.z+")"},
        {icon:"info" as const,text:"HP "+observedStep.hp+" · recorded"},
      ]:[]),
      {icon:"info",text:"Only saved historical data shown"},
    ],
  };
}

/** The wall, E/R roster and compact day HUD now share actual committed
 * hero status. The older event-only signal projection is not a roster.
 * This visibility is merchant presentation only, never an AI input. */
export function liveRosterCards(state:GameState,filter:RosterFilter,includeRecent=false):readonly HeroCardView[]{
  const names=heroDisplayNames(state.adventurers);
  return rosterEntries(state,filter).map(hero=>liveHeroCard(state,hero.id,
    {includeRecent,name:names.get(hero.id)})!);
}
export function rosterActivityLabel(hero:HeroCardView):string{
  if(hero.status==="dead")return "Fallen";
  if(hero.status==="combat")return "Fighting";
  if(hero.status==="at-shop")return "In shop";
  if(hero.status==="departing")return "Leaving shop";
  if(hero.status==="off-duty")return "Recovering";
  if(hero.status==="traveling"||hero.status==="returning")return "Traveling";
  if(hero.goal==="resupply")return "Resupply";
  if(hero.goal==="hunt-ghouls")return "Hunting";
  if(hero.goal==="loot-chest")return "Seeking loot";
  if(hero.action==="descend")return "Descending";
  if(hero.action==="ascend")return "Ascending";
  if(hero.goal==="farm")return "Farming";
  return "Exploring";
}
