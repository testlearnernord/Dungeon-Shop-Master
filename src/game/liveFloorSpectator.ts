import type {GameState} from "./gameState.ts";
import type {AdventurerState} from "./adventurers.ts";
import type {SpatialDungeonFloor} from "./spatialDungeonExploration.ts";
import type {DungeonMonsterState} from "./dungeonMonsterWorld.ts";
import {needsHealthResupply,isBossExpeditionCandidate,selectKnownResourceSite} from "./dungeonDecisions.ts";
import {chooseDungeonThreatReaction,chooseRememberedThreatReaction,recentDungeonThreat,type DungeonThreatAction}
  from "./dungeonThreatDecisions.ts";
import {generateExpeditionLayout,dungeonDownStair,type DungeonPoint} from "./dungeonLayout.ts";
import type {CombatantSpec,GroupReplayFrame,GroupCombatCue} from "./groupCombat.ts";

/** The supported *physical* expedition floors, not a fictional set of 100. */
export const LIVE_SPECTATOR_FLOORS=[1,2,3,4,5,6,7,8,9,10] as const satisfies readonly SpatialDungeonFloor[];

export interface LiveFloorHero {
  readonly id:string;
  readonly name:string;
  readonly role:AdventurerState["role"];
  readonly level:number;
  readonly stats:AdventurerState["stats"];
  readonly traits:AdventurerState["traits"];
  readonly inventory:AdventurerState["inventory"];
  readonly goal:GameState["liveDungeon"]["plans"][number]["goal"]|null;
  readonly plannedAction:GameState["liveDungeon"]["plans"][number]["action"]|null;
  readonly activity:"combat"|"exploring"|"backtracking"|"portal";
  readonly equipment:AdventurerState["equipment"];
  readonly x:number;
  readonly z:number;
  readonly health:number;
  readonly gold:number;
  readonly visited:readonly number[];
  readonly partyId:string|null;
  readonly partyMemberIds:readonly string[];
  readonly inCombat:boolean;
  /** Same pure response that actually drives the next world-tick step. */
  readonly threatAction?:DungeonThreatAction;
  readonly threatNextStep?:DungeonPoint;
  readonly pursuingMonsterId?:string;
}
export interface LiveFloorFight {
  readonly id:string;
  readonly featureId:string;
  readonly x:number;
  readonly z:number;
  readonly heroIds:readonly string[];
  readonly actors:readonly CombatantSpec[];
  readonly frame:GroupReplayFrame;
  readonly frames:readonly GroupReplayFrame[];
  readonly cues:readonly GroupCombatCue[];
}
export interface LiveFloorSpectatorFrame {
  readonly day:number;
  readonly worldTick:number;
  readonly floor:SpatialDungeonFloor;
  readonly heroes:readonly LiveFloorHero[];
  readonly fights:readonly LiveFloorFight[];
  /** Exact saved world packs; never recomputed from the static layout. */
  readonly monsters?:readonly DungeonMonsterState[];
  readonly resolved:readonly string[];
}

/** Opt-in, all-floor projection. This is intentionally NOT the merchant Board:
 * each actor reads its OWN saved x/z/visited, never the focused hero's data.
 * Full-map knowledge stays on the spectator side of the boundary. */
export function selectLiveFloorSpectatorFrame(
  state:GameState,floor:SpatialDungeonFloor,
):LiveFloorSpectatorFrame|null {
  if(!state.liveDungeon.enabled||!LIVE_SPECTATOR_FLOORS.includes(floor))
    return null;
  const world=state.dungeonWorlds.find(entry=>entry.floor===floor)?.world;
  const progress=new Map((world?.heroes??[]).map(h=>[h.heroId,h]));
  const tacticalLayout=floor<=9?generateExpeditionLayout(state.seed,floor):null;
  const running=state.liveDungeon.combats.filter(f=>f.encounter.floor===floor);
  const fights:LiveFloorFight[]=running.flatMap(f=>{
    const frame=f.frames.at(-1);
    return frame?[{
      id:f.id,featureId:f.encounter.featureId,x:f.encounter.x,z:f.encounter.z,
      heroIds:f.heroIds,actors:f.encounter.options.actors,
      frame,frames:f.frames,cues:f.state.events,
    }]:[];
  });
  if(floor===10&&state.liveDungeon.partyBossCombat){
    const boss=state.liveDungeon.partyBossCombat;
    const frame=boss.frames.at(-1);
    const entrance=generateExpeditionLayout(state.seed,10).entrance;
    if(frame)fights.push({
      id:boss.id,featureId:"cave-troll",...entrance,
      heroIds:boss.heroIds,actors:boss.options.actors,
      frame,frames:boss.frames,cues:boss.state.events,
    });
  }
  const heroes:LiveFloorHero[]=state.adventurers
    .filter(h=>h.floor===floor&&h.health>0&&
      (h.status==="exploring"||
       floor===10&&h.status==="expedition"))
    .flatMap(hero=>{
      const site=progress.get(hero.id);
      const fight=fights.find(f=>f.heroIds.includes(hero.id));
      if(!site&&!fight)return [];
      const party=state.dungeonParties?.find(p=>p.floor===floor&&
        p.memberIds.includes(hero.id));
      const members=party?.memberIds??(fight?.heroIds??[hero.id]);
      const partyIds=members.length>1?[...members].sort():[];
      const combatActor=fight?.frame.actors.find(a=>a.id===hero.id);
      const plan=state.liveDungeon.plans.find(p=>
        p.heroId===hero.id&&p.floor===floor);
      const returning=state.liveDungeon.returns.find(r=>r.heroId===hero.id);
      const activity=fight?"combat":returning?.phase==="portal"?"portal":
        returning?.phase==="backtrack"?"backtracking":"exploring";
      const gathered=party&&site?party.memberIds.map(id=>
        state.adventurers.find(member=>member.id===id)).filter(
        (member):member is AdventurerState=>!!member&&
          member.floor===floor&&member.status==="exploring"&&
          (progress.get(member.id)?.x??NaN)===site.x&&
          (progress.get(member.id)?.z??NaN)===site.z):[hero];
      const threat=world&&site&&!fight&&returning?.phase!=="portal"&&tacticalLayout
        ?chooseDungeonThreatReaction(tacticalLayout,world,
          returning?[hero]:gathered,state.adventurers,returning?.phase==="backtrack",
          gathered.some(member=>state.liveDungeon.plans.some(p=>p.heroId===member.id&&
            p.goal==="caution")&&needsHealthResupply(member))):null;
      const group=returning?[hero]:gathered;
      const memory=recentDungeonThreat(group.map(member=>state.liveDungeon.plans.find(p=>
        p.heroId===member.id&&p.floor===floor)?.threatMemory),state.worldClock.tick);
      const resource=plan?.goal==="loot-chest"?"treasure":plan?.goal==="hunt-ghouls"?"monster":null;
      const target=tacticalLayout&&(plan?.action==="ascend"?tacticalLayout.entrance:
        plan?.action==="descend"||floor===9&&group.length===1&&
          isBossExpeditionCandidate(hero)&&plan?.action!=="shop"&&!state.dungeonFloors.some(f=>f.floor===10&&f.cleared)
          ?dungeonDownStair(tacticalLayout):undefined);
      const resourceTarget=!target&&world&&site&&tacticalLayout&&resource
        ?selectKnownResourceSite(tacticalLayout,site,world,resource,group):null;
      const remembered=!threat&&world&&site&&!fight&&returning?.phase!=="portal"&&tacticalLayout
        ?chooseRememberedThreatReaction(tacticalLayout,world,group,memory,
          target||resourceTarget||undefined,returning?.phase==="backtrack"):null;
      return [{
        id:hero.id,name:hero.name,role:hero.role,equipment:hero.equipment,
        level:hero.level,stats:hero.stats,traits:hero.traits,
        inventory:hero.inventory,goal:plan?.goal??null,
        plannedAction:plan?.action??null,activity,
        x:site?.x??fight!.x,z:site?.z??fight!.z,
        health:combatActor?.hp??hero.health,gold:hero.gold,
        visited:site?.visited??[],
        partyId:partyIds.length>1?floor+":"+partyIds.join("+"):null,
        partyMemberIds:partyIds,
        inCombat:!!fight,
        ...(threat?{
          threatAction:threat.action,threatNextStep:threat.step,
          pursuingMonsterId:threat.monsterId,
        }:remembered?{
          threatAction:remembered.action,
          ...(remembered.step?{threatNextStep:remembered.step}:{}),
        }:{}),
      }];
    });
  return {day:state.day,worldTick:state.worldClock.tick,floor,
    heroes,fights,monsters:world?.monsters??[],
    resolved:world?.resolvedFeatureIds??[]};
}
