import type {GameState} from "./gameState.ts";
import type {AdventurerState} from "./adventurers.ts";
import type {GroupReplayFrame,CombatantSpec} from "./groupCombat.ts";
import type {SpatialDungeonFloor} from "./level7Exploration.ts";
import {generateExpeditionLayout,type DungeonLayout} from "./dungeonLayout.ts";

/** Presentation-only cache of immutable seeded geometry, never game state. */
const layoutCache=new Map<string,DungeonLayout>();
function spectatorLayout(seed:number,floor:number):DungeonLayout {
  const key=seed+":"+floor;
  const existing=layoutCache.get(key);
  if(existing)return existing;
  const layout=generateExpeditionLayout(seed,floor);
  if(layoutCache.size>=10)layoutCache.delete(layoutCache.keys().next().value!);
  layoutCache.set(key,layout);
  return layout;
}

/** Deliberate opt-in knowledge boundary. Never attach this projection to
 * the ordinary Adventurer Board, a shop report, or a persisted replay.
 * Every position, frame, party and discovered cell already exists in the
 * saved, authoritative world. This function performs no simulation or RNG.
 */
export interface LiveSpectatorFrame {
  readonly worldTick:number;
  readonly day:number;
  readonly heroId:string;
  readonly floor:SpatialDungeonFloor;
  readonly heroes:readonly Pick<AdventurerState,"id"|"role"|"equipment"|"health">[];
  readonly x:number;
  readonly z:number;
  readonly visited:readonly number[];
  readonly resolved:readonly string[];
  readonly combat:null|{
    readonly id:string;
    readonly featureId:string;
    readonly x:number;
    readonly z:number;
    readonly actors:readonly CombatantSpec[];
    readonly frame:GroupReplayFrame;
    readonly frames:readonly GroupReplayFrame[];
  };
}

/** A missing view means the hero cannot currently be observed, not that
 * we should invent a journey, teleport a dead hero or replay a sealed run.
 */
export function selectLiveSpectatorFrame(
  state:GameState,heroId:string,
):LiveSpectatorFrame|null {
  if(!state.liveDungeon.enabled)return null;
  const hero=state.adventurers.find(h=>h.id===heroId);
  if(!hero||hero.health<=0||
     !(hero.status==="exploring"&&hero.floor>=1&&hero.floor<=4||
       hero.status==="expedition"&&hero.floor===7))return null;
  const floor=hero.floor as SpatialDungeonFloor;
  const world=floor===7?state.level7World:
    state.earlyDungeonWorlds?.find(f=>f.floor===floor)?.world;
  const layout=spectatorLayout(state.seed,floor);
  const progress=world?.heroes.find(h=>h.heroId===heroId);
  const fight=state.liveDungeon.combats.find(c=>c.heroIds.includes(heroId));
  if(!progress&&!fight)return null;
  const partyIds=fight?.heroIds??
    state.dungeonParties?.find(p=>p.floor===floor&&
      p.memberIds.includes(heroId))?.memberIds??[heroId];
  const party=partyIds.map(id=>state.adventurers.find(h=>h.id===id))
    .filter((h):h is AdventurerState=>!!h&&h.floor===floor&&h.health>0&&
      (h.status==="exploring"||h.status==="expedition"));
  const x=progress?.x??fight?.encounter.x??layout.entrance.x;
  const z=progress?.z??fight?.encounter.z??layout.entrance.z;
  const visited=progress?.visited??[z*layout.width+x];
  const known=new Set(visited);
  // Other parties may have resolved sites. Do not leak them outside the
  // selected hero's observed cells, even though the world stores them.
  const resolved=(world?.resolvedFeatureIds??[]).filter(id=>{
    const site=layout.features.find(feature=>feature.id===id);
    return !!site&&known.has(site.z*layout.width+site.x);
  });
  const last=fight?.frames.at(-1);
  return {
    worldTick:state.worldClock.tick,day:state.day,heroId,floor,
    heroes:party.map(h=>({id:h.id,role:h.role,equipment:h.equipment,health:h.health})),
    x,z,visited,resolved,
    combat:fight&&last?{
      id:fight.id,featureId:fight.encounter.featureId,
      x:fight.encounter.x,z:fight.encounter.z,
      actors:fight.encounter.options.actors,frame:last,frames:fight.frames,
    }:null,
  };
}
