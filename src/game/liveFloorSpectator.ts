import type {GameState} from "./gameState.ts";
import type {AdventurerState} from "./adventurers.ts";
import type {SpatialDungeonFloor} from "./level7Exploration.ts";
import type {CombatantSpec,GroupReplayFrame,GroupCombatCue} from "./groupCombat.ts";

/** The supported *physical* expedition floors, not a fictional set of 100. */
export const LIVE_SPECTATOR_FLOORS=[1,2,3,4,7] as const satisfies readonly SpatialDungeonFloor[];

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
  const world=floor===7?state.level7World:
    state.earlyDungeonWorlds?.find(entry=>entry.floor===floor)?.world;
  const progress=new Map((world?.heroes??[]).map(h=>[h.heroId,h]));
  const running=state.liveDungeon.combats.filter(f=>f.encounter.floor===floor);
  const fights:LiveFloorFight[]=running.flatMap(f=>{
    const frame=f.frames.at(-1);
    return frame?[{
      id:f.id,featureId:f.encounter.featureId,x:f.encounter.x,z:f.encounter.z,
      heroIds:f.heroIds,actors:f.encounter.options.actors,
      frame,frames:f.frames,cues:f.state.events,
    }]:[];
  });
  const activeStatus=floor===7?"expedition":"exploring";
  const heroes:LiveFloorHero[]=state.adventurers
    .filter(h=>h.floor===floor&&h.status===activeStatus&&h.health>0)
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
      }];
    });
  return {day:state.day,worldTick:state.worldClock.tick,floor,
    heroes,fights,resolved:world?.resolvedFeatureIds??[]};
}
