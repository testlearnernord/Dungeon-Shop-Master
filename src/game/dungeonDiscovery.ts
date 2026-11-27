import type {AdventurerState} from "./adventurers.ts";
import type {GameState,WorldEvent} from "./gameState.ts";
import {generateExpeditionLayout} from "./dungeonLayout.ts";
import {dungeonRoomPurposeAt} from "./dungeonRoomPurpose.ts";
import {dungeonSiteGeneration} from "./dungeonRegeneration.ts";
import type {SpatialDungeonPartyTick} from "./spatialDungeonExploration.ts";

export const SURVEYOR_PLAN_PRICE=12;
export const SURVEYOR_PLAN_NAME="Surveyor's Plan";
export interface SurveyorPlanSource {
  readonly floor:number;
  readonly siteId:string;
}
export interface SurveyorPlan extends SurveyorPlanSource {
  readonly status:"carried"|"purchased";
  readonly heroId:string;
  readonly cycle:number;
  readonly foundDay:number;
}

/** One source per campaign. Prefer the earliest actual workshop chest.
 * A vault fallback prevents an unusual layout from locking progression. */
export function surveyorPlanSource(seed:number):SurveyorPlanSource{
  let fallback:SurveyorPlanSource|undefined;
  for(let floor=5;floor<=9;floor++){
    const map=generateExpeditionLayout(seed,floor);
    for(const f of map.features.filter(f=>f.kind==="treasure").sort((a,b)=>a.id.localeCompare(b.id))){
      const theme=dungeonRoomPurposeAt(map,f);
      if(theme==="workshop")return {floor,siteId:f.id};
      if(theme==="vault"&&!fallback)fallback={floor,siteId:f.id};
    }
  }
  if(fallback)return fallback;
  throw new RangeError("No eligible discovery chest");
}

/** A real committed treasure step and resolved generation are required.
 * Roster ownership is unique; death permits a later generation, never a
 * second copy or free recovery. No extra ordinary item or RNG draw. */
export function claimSurveyorPlan(
  previous:SurveyorPlan|null,seed:number,day:number,
  party:SpatialDungeonPartyTick,roster:readonly AdventurerState[],
):SurveyorPlan|null{
  if(previous?.status==="purchased")return previous;
  if(previous&&roster.some(h=>h.id===previous.heroId&&h.health>0&&h.status!=="dead"))
    return previous;
  const eligible=party.ticks.filter(t=>t.adventurer.health>0&&
    t.adventurer.status!=="dead"&&t.replay.floor>=5&&
    t.replay.steps.some(s=>s.action==="treasure"));
  if(!eligible.length)return previous;
  const source=surveyorPlanSource(seed);
  if(!party.world.resolvedFeatureIds.includes(source.siteId))return previous;
  const cycle=dungeonSiteGeneration(party.world.siteCycles,source.siteId);
  if(previous&&cycle<=previous.cycle)return previous;
  const owner=eligible.filter(t=>t.replay.floor===source.floor&&
    !t.replay.resolvedAtStart?.includes(source.siteId)&&
    t.replay.steps.some(s=>s.action==="treasure"&&s.featureId===source.siteId))
    .sort((a,b)=>a.adventurer.id.localeCompare(b.adventurer.id))[0];
  return owner?{...source,status:"carried",heroId:owner.adventurer.id,cycle,foundDay:day}:previous;
}

/** Only an actual living visitor may sell. Physical dock, visit eligibility
 * and closed-chest policy are additionally enforced by dungeonBuyback.ts. */
export function canBuySurveyorPlan(state:GameState,heroId:string):boolean{
  const plan=state.surveyorPlan;
  if(plan?.status!=="carried"||plan.heroId!==heroId||
    !state.buybackChestOpen||state.shopEconomy.balance<SURVEYOR_PLAN_PRICE)return false;
  const hero=state.adventurers.find(h=>h.id===heroId);
  return !!hero&&hero.status==="at-shop"&&hero.floor==="shop"&&hero.health>0&&
    hero.gold<=Number.MAX_SAFE_INTEGER-SURVEYOR_PLAN_PRICE;
}

export function surveyorPlanReceipt(hero:AdventurerState,day:number):WorldEvent{
  return {id:"day-"+day+":"+hero.id+":discovery-buyback",type:"discovery-buyback",
    day,adventurerId:hero.id,cost:SURVEYOR_PLAN_PRICE,
    message:"Galvik bought the "+SURVEYOR_PLAN_NAME+" from "+hero.name+
      " for "+SURVEYOR_PLAN_PRICE+" gold. Shop expansion tier 2 is now available."};
}
