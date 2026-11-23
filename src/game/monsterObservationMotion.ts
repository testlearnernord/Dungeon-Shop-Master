import {MONSTER_STEP_TICKS} from "./dungeonMonsterWorld.ts";
import type {DungeonMonsterState} from "./dungeonMonsterWorld.ts";

/** Minimal saved facts needed to display, never to simulate, one Ghoul step. */
export type MonsterMotionSnapshot=Pick<DungeonMonsterState,
  "x"|"z"|"siteCycle"|"lastMoveTick"> & {
    readonly day:number;
    readonly floor:number;
    readonly worldTick:number;
  };

/** A renderer may animate only one real, consecutive, recorded pack move.
 * Watching a different floor, sleeping, regenerating a site or skipping more
 * than one monster step must SNAP to the authoritative current tile.
 * The animation cannot manufacture a route from two distant observations. */
export function isObservedMonsterStep(
  from:MonsterMotionSnapshot,to:MonsterMotionSnapshot,
):boolean{
  const elapsed=to.worldTick-from.worldTick;
  const cells=Math.abs(to.x-from.x)+Math.abs(to.z-from.z);
  return from.floor===to.floor&&from.day===to.day&&
    from.siteCycle===to.siteCycle&&
    elapsed>0&&elapsed<=MONSTER_STEP_TICKS&&
    cells===1&&
    to.lastMoveTick>from.lastMoveTick&&
    to.lastMoveTick<=to.worldTick&&
    to.lastMoveTick>=from.worldTick;
}

/** Visual traversal takes only a brief, weighty burst: monsters WAIT
 * between real 400-tick decisions, just like heroes wait between steps.
 * This is NOT the gameplay move interval (400 ticks / 20 seconds). */
export const MONSTER_OBSERVATION_STEP_SECONDS=1.2;
