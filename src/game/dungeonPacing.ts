import {WORLD_TICK_SECONDS} from "./worldClock.ts";
/** One authoritative movement cadence, independent of camera and frame rate.
 * Combat, recovery, shop services and the 24-minute world day are separate. */
export const DUNGEON_STEP_INTERVAL_TICKS=50;
export const MONSTER_STEP_TICKS=2*DUNGEON_STEP_INTERVAL_TICKS;
export const DUNGEON_STEP_SECONDS=DUNGEON_STEP_INTERVAL_TICKS*WORLD_TICK_SECONDS;
export const MONSTER_STEP_SECONDS=MONSTER_STEP_TICKS*WORLD_TICK_SECONDS;
