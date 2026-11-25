/**
 * Current conceptual dungeon topology: Galvik's cursed shop is its own
 * realm, NOT numeric dungeon Floor 5. All Floors 1–9 are ordinary seeded
 * locations; Floor 10 is the Cave Troll party encounter. These pure
 * predicates never move heroes or spawn fights: the persisted LIVE motor
 * commits travel. The save uses explicit `"shop"`/`"away"`/`"transit"` places;
 * Floor 10 requires real companions and autonomous readiness.
 */
export const CURSED_SHOP_REALM="cursed-shop" as const;
export const FIRST_DUNGEON_FLOOR=1;
export const LAST_ORDINARY_FLOOR=9;
export const CAVE_TROLL_FLOOR=10;

export type OrdinaryDungeonFloor=1|2|3|4|5|6|7|8|9;
export type BossDungeonFloor=10;
export type NumberedDungeonFloor=OrdinaryDungeonFloor|BossDungeonFloor;
export type DungeonDestination=
  |{readonly kind:"floor";readonly floor:NumberedDungeonFloor}
  |{readonly kind:"shop";readonly realm:typeof CURSED_SHOP_REALM};

export const isOrdinaryDungeonFloor=(floor:number):floor is OrdinaryDungeonFloor=>
  Number.isSafeInteger(floor)&&floor>=FIRST_DUNGEON_FLOOR&&
  floor<=LAST_ORDINARY_FLOOR;

export const isNumberedDungeonFloor=(floor:number):floor is NumberedDungeonFloor=>
  isOrdinaryDungeonFloor(floor)||floor===CAVE_TROLL_FLOOR;

/** The cursed threshold is accessible as an option on upward travel from
 * any normal floor. Heroes may instead walk up to the actual next floor.
 * This does not teleport them: the scheduled entrance/backtrack must commit
 * before world state can change. */
export function upwardDestinations(floor:OrdinaryDungeonFloor):
  readonly DungeonDestination[]{
  return [
    ...(floor>FIRST_DUNGEON_FLOOR?[{
      kind:"floor" as const,floor:(floor-1) as NumberedDungeonFloor,
    }]:[]),
    {kind:"shop",realm:CURSED_SHOP_REALM},
  ];
}

/** The normal dungeon is contiguous. Floor 9's downward passage leads to
 * the one unique Cave Troll floor, never directly to Galvik's shop. */
export function downwardDestination(
  floor:OrdinaryDungeonFloor,
):DungeonDestination{
  return {kind:"floor",floor:(floor+1) as NumberedDungeonFloor};
}

/** A genuine fight attempt requires at least two saved companions.
 * Equipment is evaluated by the real combat motor, not faked by this rule. */
export const canAttemptCaveTroll=(memberCount:number):boolean=>
  Number.isSafeInteger(memberCount)&&memberCount>=2&&memberCount<=3;
