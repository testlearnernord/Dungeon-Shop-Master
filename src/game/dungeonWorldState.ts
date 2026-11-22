import {emptySpatialDungeonWorld,type SpatialDungeonWorld,type SpatialDungeonFloor} from "./spatialDungeonExploration.ts";

/** One persisted authority for all nine ordinary numbered dungeon maps. */
export interface DungeonFloorWorld {
  readonly floor:SpatialDungeonFloor;
  readonly world:SpatialDungeonWorld;
}

export function dungeonWorldAt(worlds:readonly DungeonFloorWorld[],floor:SpatialDungeonFloor):SpatialDungeonWorld {
  return worlds.find(entry=>entry.floor===floor)?.world??emptySpatialDungeonWorld();
}

export function setDungeonWorld(worlds:readonly DungeonFloorWorld[],floor:SpatialDungeonFloor,world:SpatialDungeonWorld):DungeonFloorWorld[] {
  return [...worlds.filter(entry=>entry.floor!==floor),{floor,world}].sort((a,b)=>a.floor-b.floor);
}
