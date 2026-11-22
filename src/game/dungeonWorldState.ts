import {emptyLevel7World,type Level7World,type SpatialDungeonFloor} from "./level7Exploration.ts";

/** One persisted authority for all nine ordinary numbered dungeon maps. */
export interface DungeonFloorWorld {
  readonly floor:SpatialDungeonFloor;
  readonly world:Level7World;
}

export function dungeonWorldAt(worlds:readonly DungeonFloorWorld[],floor:SpatialDungeonFloor):Level7World {
  return worlds.find(entry=>entry.floor===floor)?.world??emptyLevel7World();
}

export function setDungeonWorld(worlds:readonly DungeonFloorWorld[],floor:SpatialDungeonFloor,world:Level7World):DungeonFloorWorld[] {
  return [...worlds.filter(entry=>entry.floor!==floor),{floor,world}].sort((a,b)=>a.floor-b.floor);
}
