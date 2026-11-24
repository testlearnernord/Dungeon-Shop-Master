import {heroProgression} from "./heroProgression.ts";
import {equipmentEffects} from "./gearCatalog.ts";
import type { AdventurerState } from "./adventurers.ts";
import type { DungeonLayout,DungeonPoint } from "./dungeonLayout.ts";
import { generateExpeditionLayout } from "./dungeonLayout.ts";
import {
  getSpatialDungeonProgress,chooseKnownRouteStep,type SpatialDungeonWorld, type SpatialDungeonFloor,
} from "./spatialDungeonExploration.ts";
import {isBossExpeditionCandidate,canRiskOrdinaryDescent,type HeroDungeonDecision,
  type HeroFloorAction} from "./dungeonDecisions.ts";
import {dungeonCurrentSight} from "./heroPerception.ts";

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
    (isBossExpeditionCandidate(hero)||hero.role==="healer" || hero.traits.negative!=="reckless" ||
      hero.health/heroProgression(hero).maxHealth<0.6);
}

/**
 * Opportunistic formation handles new explorers and parties which have
 * naturally broken up. It is not a compatibility path for old Alpha saves.
 */
export interface BossRendezvous {
  readonly peerId:string;
  /** null means wait on the actual tile for the visible approaching peer. */
  readonly step:DungeonPoint|null;
}

/** Only currently visible, available, individually prepared explorers can
 * rendezvous. The actual party still forms on a later co-located map tick.
 * Deterministic ID priority prevents two peers trading places every tick. */
export function chooseBossRendezvous(
  leader:AdventurerState,roster:readonly AdventurerState[],
  world:SpatialDungeonWorld,layout:DungeonLayout,unavailable:ReadonlySet<string>,
):BossRendezvous|null{
  if(!isBossExpeditionCandidate(leader)||layout.floor!==9||
    unavailable.has(leader.id))return null;
  const at=getSpatialDungeonProgress(world,leader.id,layout);
  const sight=dungeonCurrentSight(layout,at);
  const known=new Set([...at.visited,...[...sight].filter(cell=>layout.tiles[cell]!=="wall")]);
  const candidates=roster.flatMap(peer=>{
    if(peer.id===leader.id||unavailable.has(peer.id)||!isBossExpeditionCandidate(peer))return [];
    const point=getSpatialDungeonProgress(world,peer.id,layout);
    if(!sight.has(point.z*layout.width+point.x))return [];
    const together=point.x===at.x&&point.z===at.z;
    const step=together?null:chooseKnownRouteStep(layout,{...at,visited:[...known]},point);
    if(!together&&!step)return [];
    return [{peer,point,step}];
  }).sort((a,b)=>Math.abs(a.point.x-at.x)+Math.abs(a.point.z-at.z)-
    Math.abs(b.point.x-at.x)-Math.abs(b.point.z-at.z)||
    Number(a.peer.role===leader.role)-Number(b.peer.role===leader.role)||
    a.peer.id.localeCompare(b.peer.id));
  const target=candidates[0];
  if(!target)return null;
  return {peerId:target.peer.id,
    step:leader.id.localeCompare(target.peer.id)<0?null:target.step};
}

export function chooseCoLocatedDungeonParty(
  leader:AdventurerState, roster:readonly AdventurerState[],
  world:SpatialDungeonWorld, layout:DungeonLayout,
  processed:ReadonlySet<string>,
):readonly AdventurerState[] {
  const validStatus="exploring";
  if(processed.has(leader.id)||leader.floor!==layout.floor||
    leader.status!==validStatus||!willingToTravelTogether(leader))
    return [leader];
  const start=getSpatialDungeonProgress(world,leader.id,layout);
  const companions=roster.filter(hero=>
    hero.id!==leader.id&&!processed.has(hero.id)&&
    hero.floor===layout.floor&&hero.status===validStatus&&
    willingToTravelTogether(hero)&&
    (()=>{const p=getSpatialDungeonProgress(world,hero.id,layout);
      return p.x===start.x&&p.z===start.z;})());
  // Score against ALL already chosen members, not just the leader.
  // A Tank + DPS + Healer is preferred when those willing explorers are
  // genuinely co-located. Same-class parties remain legal.
  const selected=[leader];
  while(selected.length<3&&companions.length){
    const roles=new Set(selected.map(h=>h.role));
    companions.sort((a,b)=>Number(roles.has(a.role))-Number(roles.has(b.role))||
      a.id.localeCompare(b.id));
    selected.push(companions.shift()!);
  }
  return selected;
}

function availableOldMembers(
  party:DungeonPartyState,
  roster:readonly AdventurerState[],
  world:SpatialDungeonWorld, layout:DungeonLayout,
  processed:ReadonlySet<string>,
):readonly AdventurerState[]|null {
  if(party.floor!==layout.floor||party.memberIds.length<2||
    party.memberIds.length>3)return null;
  const lead=roster.find(hero=>hero.id===party.memberIds[0]);
  const expectedStatus="exploring";
  const members=party.memberIds.map(id=>roster.find(hero=>hero.id===id));
  if(members.some(hero=>!hero||processed.has(hero.id)||
    hero.floor!==layout.floor||hero.status!==expectedStatus||
    !willingToTravelTogether(hero)))return null;
  const ready=members as AdventurerState[];
  const start=getSpatialDungeonProgress(world,ready[0].id,layout);
  return ready.every(hero=>{
    const p=getSpatialDungeonProgress(world,hero.id,layout);
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
  world:SpatialDungeonWorld, layout:DungeonLayout,
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
  worldForFloor:(floor:SpatialDungeonFloor)=>SpatialDungeonWorld,
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
        hero.status==="exploring");
    if(members.length<2||members.length>3)continue;
    const floor=members[0].floor;
    if(typeof floor!=="number"||!(floor>=1&&floor<=9) ||
      members.some(hero=>hero.floor!==floor||
        hero.status!==members[0].status||occupied.has(hero.id)))continue;
    const firstAction=decisions.get(members[0].id);
    // A group stays together only if its living explorers autonomously
    // chose the SAME transition. "shop" always ends that expedition.
    if(firstAction===undefined||firstAction==="shop"||
      members.some(hero=>decisions.get(hero.id)!==firstAction))continue;
    const sharedFloor=floor as SpatialDungeonFloor;
    const world=worldForFloor(sharedFloor);
    const layout=generateExpeditionLayout(campaignSeed,sharedFloor);
    const first=getSpatialDungeonProgress(world,members[0].id,layout);
    if(!members.every(hero=>{
      const position=getSpatialDungeonProgress(world,hero.id,layout);
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
        member.health/heroProgression(member).maxHealth>=0.55))
      return change("ascend");
    return decisions;
  }
  if(!distinct.has("descend"))return decisions;
  // The boss is never a normal negotiated depth change. Every participant
  // needs the pass, usable gear, health and an independent boss commitment.
  if(members[0].floor===9)return decisions;

  const stayers=members.filter(member=>
    decisions.get(member.id)!.action==="stay");
  const descenders=members.filter(member=>
    decisions.get(member.id)!.action==="descend");

  // Caution or the need to farm money is a genuine preference, not an
  // obligation to race after an impatient companion.
  const canFollow=stayers.every(member=>{
    const goal=decisions.get(member.id)!.goal;
    const health=member.health/heroProgression(member).maxHealth;
    const threshold=member.traits.positive==="careful"?0.92:0.78;
    return goal!=="caution"&&goal!=="resupply"&&
      goal!=="farm"&&canRiskOrdinaryDescent(member)&&health>=threshold;
  });
  if(canFollow)return change("descend");

  // Patient companions can put off a desired descent for one more
  // real expedition day. Waiting does not heal anyone or create loot.
  // Do not trap a prepared party in perpetual waiting for a member who
  // still needs a weapon. Such an explorer can genuinely split and resupply.
  if(stayers.some(member=>!equipmentEffects(member.role,member.equipment).weapon&&
    member.floor!==1))return decisions;
  const willingToWait=descenders.every(member=>
    member.traits.negative!=="reckless"&&
    (member.traits.positive==="generous"||
      member.traits.positive==="careful"||member.role==="healer"));
  if(willingToWait)return change("stay");
  return decisions;
}
