import type {DungeonRoom} from "./dungeonLayout.ts";

export const CRYPT_STONE="#444940";
export const CRYPT_WALL="#272c29";
export const CRYPT_FLOOR="#383c38";
export const CRYPT_EMBER="#b1bd85";

/** Dungeon rooms have only cosmetic wall-edge props. They do not block
 * simulated walkable tiles, modify combat obstacles, or spawn monsters. */
export function cryptRelicPositions(room:Pick<DungeonRoom,"width"|"height">){
  const sx=(room.width*2.5)/2-0.7;
  const sz=(room.height*2.5)/2-0.7;
  return [
    {x:-sx,z:-sz},
    {x:sx,z:-sz},
    {x:-sx,z:sz},
    {x:sx,z:sz},
  ] as const;
}

