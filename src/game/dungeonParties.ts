import type { AdventurerState } from "./adventurers.ts";
import type { DungeonLayout } from "./dungeonLayout.ts";
import { generateExpeditionLayout } from "./dungeonLayout.ts";
import {
  getLevel7Progress, type Level7World, type SpatialDungeonFloor,
} from "./level7Exploration.ts";
import type {
  HeroDungeonDecision, HeroFloorAction,
} from "./dungeonDecisions.ts";

/**
 * Persistent but voluntary companionship. This is a campaign relationship,
 * never an order from the merchant or a second exploration world.
 * A two-or-three-person party has no artificial bonus or shared HP pool.
 */
export interface DungeonPartyState {
  readonly memberIds: readonly string[];
  readonly floor: SpatialDungeonFloor;
  readonly formedDay: number;
}

export function willingToTravelTogether(hero:AdventurerState):boolean {
  return hero.health>0 &&
    (hero.role==="healer" || hero.traits.negative!=="reckless" ||
      hero.health/hero.stats.maxHealth<0.6);
}

/**
 * The original opportunistic formation remains the fallback for old saves,
 * newly arriving explorers and parties which have naturally broken up.
 */
export function chooseCoLocatedDungeonParty(
  leader:AdventurerState, roster:readonly AdventurerState[],
  world:Level7World, layout:DungeonLayout,
  processed:ReadonlySet<string>,
):readonly AdventurerState[] {
  const validStatus=layout.floor===7?"expedition":"exploring";
  if(processed.has(leader.id)||leader.floor!==layout.floor||
    leader.status!==validStatus||!willingToTravelTogether(leader))
    return [leader];
  const start=getLevel7Progress(world,leader.id,layout);
  const companions=roster.filter(hero=>
    hero.id!==leader.id&&!processed.has(hero.id)&&
    hero.floor===layout.floor&&hero.status===validStatus&&
    willingToTravelTogether(hero)&&
    (()=>{const p=getLevel7Progress(world,hero.id,layout);
      return p.x===start.x&&p.z===start.z;})());
  companions.sort((a,b)=>Number(a.role===leader.role)-
    Number(b.role===leader.role)||a.id.localeCompare(b.id));
  return [leader,...companions.slice(0,2)];
}

function availableOldMembers(
  party:DungeonPartyState,
  roster:readonly AdventurerState[],
  world:Level7World, layout:DungeonLayout,
  processed:ReadonlySet<string>,
):readonly AdventurerState[]|null {
  if(party.floor!==layout.floor||party.memberIds.length<2||
    party.memberIds.length>3)return null;
  const expectedStatus=layout.floor===7?"expedition":"exploring";
  const members=party.memberIds.map(id=>roster.find(hero=>hero.id===id));
  if(members.some(hero=>!hero||processed.has(hero.id)||
    hero.floor!==layout.floor||hero.status!==expectedStatus||
    !willingToTravelTogether(hero)))return null;
  const ready=members as AdventurerState[];
  const start=getLevel7Progress(world,ready[0].id,layout);
  return ready.every(hero=>{
    const p=getLevel7Progress(world,hero.id,layout);
    return p.x===start.x&&p.z===start.z;
  })?ready:null;
}

/**
 * Existing willing parties get first claim to their actual companions,
 * even when a new outsider appears earlier in roster iteration order.
 * This prevents a transient bystander stealing an established partner.
 */
export function choosePersistentDungeonParty(
  leader:AdventurerState, roster:readonly AdventurerState[],
  world:Level7World, layout:DungeonLayout,
  processed:ReadonlySet<string>,
  saved:readonly DungeonPartyState[],
):readonly AdventurerState[] {
  const protectedIds=new Set<string>();
  for(const prior of saved){
    const members=availableOldMembers(prior,roster,world,layout,processed);
    if(!members)continue;
    if(members.some(member=>member.id===leader.id))return members;
    for(const member of members)protectedIds.add(member.id);
  }
  return chooseCoLocatedDungeonParty(leader,
    roster.filter(hero=>hero.id===leader.id||!protectedIds.has(hero.id)),
    world,layout,processed);
}

/** A committed day may keep companionship across a shared floor transition. */
export function settlePersistentDungeonParties(
  previous:readonly DungeonPartyState[],
  sharedEncounters:readonly (readonly string[])[],
  roster:readonly AdventurerState[],
  worldForFloor:(floor:SpatialDungeonFloor)=>Level7World,
  campaignSeed:number, day:number,
  decisions:ReadonlyMap<string,HeroFloorAction>,
):readonly DungeonPartyState[] {
  const byId=new Map(roster.map(hero=>[hero.id,hero]));
  const occupied=new Set<string>();
  const next:DungeonPartyState[]=[];
  for(const group of sharedEncounters){
    // A casualty can leave two survivors from a three-person party.
    const members=group.map(id=>byId.get(id)).filter(
      (hero):hero is AdventurerState=>!!hero&&hero.health>0&&
        (hero.status==="exploring"||hero.status==="expedition"));
    if(members.length<2||members.length>3)continue;
    const floor=members[0].floor;
    if(!([1,2,3,4,7] as readonly number[]).includes(floor) ||
      members.some(hero=>hero.floor!==floor||
        hero.status!==members[0].status||occupied.has(hero.id)))continue;
    const firstAction=decisions.get(members[0].id);
    // A group stays together only if its living explorers autonomously
    // chose the SAME transition. "shop" always ends that expedition.
    if(floor!==7 && (firstAction===undefined||firstAction==="shop"||
      members.some(hero=>decisions.get(hero.id)!==firstAction)))continue;
    if(floor===7 && members[0].status!=="expedition")continue;
    const sharedFloor=floor as SpatialDungeonFloor;
    const world=worldForFloor(sharedFloor);
    const layout=generateExpeditionLayout(campaignSeed,sharedFloor);
    const first=getLevel7Progress(world,members[0].id,layout);
    if(!members.every(hero=>{
      const position=getLevel7Progress(world,hero.id,layout);
      return position.x===first.x&&position.z===first.z;
    }))continue;
    const memberIds=members.map(hero=>hero.id);
    const prior=previous.find(party=>
      memberIds.every(id=>party.memberIds.includes(id)));
    next.push({
      memberIds,floor:sharedFloor,formedDay:prior?.formedDay??day,
    });
    memberIds.forEach(id=>occupied.add(id));
  }
  return next;
}


/** Real changes of companionship between committed expeditions and day end.
 * Forming a pair emits join for its founders; keeping it produces no spam.
 * A third hero joining an existing pair emits only THEIR join.
 * Leaving a formed group (including after a same-day split) emits a leave.
 * No hero can receive more than one event of each kind per day. */
export interface TemporaryPartyChange {
  readonly heroId:string;
  readonly action:"join"|"leave";
  readonly memberIds:readonly string[];
}
export function temporaryPartyChanges(
  previous:readonly DungeonPartyState[],
  encounters:readonly (readonly string[])[],
  next:readonly DungeonPartyState[],
):readonly TemporaryPartyChange[] {
  const previousFor=(id:string)=>previous.find(group=>group.memberIds.includes(id))?.memberIds;
  const encounteredFor=(id:string)=>encounters.find(group=>group.includes(id));
  const nextFor=(id:string)=>next.find(group=>group.memberIds.includes(id))?.memberIds;
  const sharesCompanion=(id:string,former:readonly string[]|undefined,
    latter:readonly string[]|undefined):boolean=>
    !!former&&!!latter&&former.some(peer=>peer!==id&&latter.includes(peer));
  const leaves:TemporaryPartyChange[]=[],joins:TemporaryPartyChange[]=[];
  const left=new Set<string>(),joined=new Set<string>();
  const leave=(id:string,memberIds:readonly string[])=>{
    if(!left.has(id)){
      left.add(id);leaves.push({heroId:id,action:"leave",memberIds:[...memberIds]});
    }
  };
  for(const group of previous)for(const id of group.memberIds){
    if(!sharesCompanion(id,group.memberIds,encounteredFor(id)))
      leave(id,group.memberIds);
  }
  for(const group of encounters)if(group.length>=2){
    for(const id of group){
      if(!sharesCompanion(id,previousFor(id),group)&&!joined.has(id)){
        joined.add(id);
        joins.push({heroId:id,action:"join",memberIds:[...group]});
      }
    }
  }
  const after:TemporaryPartyChange[]=[];
  for(const group of encounters)if(group.length>=2){
    for(const id of group)if(!sharesCompanion(id,group,nextFor(id))&&!left.has(id)){
      left.add(id);
      after.push({heroId:id,action:"leave",memberIds:[...group]});
    }
  }
  return [...leaves,...joins,...after];
}

/**
 * Voluntary negotiation after ONE already-committed group encounter.
 * This modifies only the next-floor intentions, never combat, health,
 * equipment, site rewards, the world, or an individual's medium-term goal.
 *
 * A hard resupply request is never vetoed. Nobody is forced into a
 * dangerous descent; an eligible hero may voluntarily keep exploring
 * with a confident companion or a patient hero may wait on this floor.
 * A caring ally may escort a cautious climber. Otherwise they split.
 */
export function negotiatePartyFloorDecisions(
  members:readonly AdventurerState[],
  independent:ReadonlyMap<string,HeroDungeonDecision>,
):ReadonlyMap<string,HeroDungeonDecision> {
  const decisions=new Map(independent);
  if(members.length<2||members.length>3||
    members.some(member=>member.status!=="exploring"||
      member.health<=0||member.floor!==members[0].floor||
      !decisions.has(member.id)))return decisions;
  const actions=members.map(member=>decisions.get(member.id)!.action);
  if(actions.some(action=>action==="shop")||
    actions.every(action=>action===actions[0]))return decisions;

  const change=(target:HeroFloorAction):ReadonlyMap<string,HeroDungeonDecision>=>{
    for(const member of members){
      const current=decisions.get(member.id)!;
      decisions.set(member.id,{...current,action:target});
    }
    return decisions;
  };
  const distinct=new Set(actions);
  if(distinct.size!==2||!distinct.has("stay"))return decisions;

  if(distinct.has("ascend")){
    // A genuinely supportive explorer may accompany a companion who needs
    // to retreat upward, but never against a personal resupply/descend goal.
    if(members.every(member=>decisions.get(member.id)!.action==="ascend"||
      (member.role==="healer"||member.traits.positive==="generous")&&
        member.health/member.stats.maxHealth>=0.55))
      return change("ascend");
    return decisions;
  }
  if(!distinct.has("descend"))return decisions;

  const stayers=members.filter(member=>
    decisions.get(member.id)!.action==="stay");
  const descenders=members.filter(member=>
    decisions.get(member.id)!.action==="descend");

  // Caution or the need to farm money is a genuine preference, not an
  // obligation to race after an impatient companion.
  const canFollow=stayers.every(member=>{
    const goal=decisions.get(member.id)!.goal;
    const health=member.health/member.stats.maxHealth;
    const equipped=member.equipment.weapon!==null||
      member.equipment.armor!==null;
    const threshold=member.traits.positive==="careful"?0.92:0.78;
    return goal!=="caution"&&goal!=="resupply"&&
      goal!=="farm"&&equipped&&health>=threshold;
  });
  if(canFollow)return change("descend");

  // Patient companions can put off a desired descent for one more
  // real expedition day. Waiting does not heal anyone or create loot.
  const willingToWait=descenders.every(member=>
    member.traits.negative!=="reckless"&&
    (member.traits.positive==="generous"||
      member.traits.positive==="careful"||member.role==="healer"));
  if(willingToWait)return change("stay");
  return decisions;
}
