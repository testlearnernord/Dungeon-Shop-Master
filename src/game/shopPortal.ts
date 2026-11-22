/** The ONE physical threshold between Galvik's cursed shop and the dungeon.
 * Coordinates are Babylon metres in the shop world. No numbered floor or
 * history-specific door can select a second route. This is presentation /
 * placement geometry, not permission to teleport an expedition.
 */
export const SHOP_PORTAL_X=-4;
export const SHOP_PORTAL_INNER_Z=6;
export const SHOP_PORTAL_OUTER_Z=13;
export const SHOP_PORTAL_DOOR_Z=11.7;
export const SHOP_PORTAL_STAGING_Z=4.65;
export const SHOP_PORTAL_GATE="portal" as const;
export type ShopPortalGate=typeof SHOP_PORTAL_GATE;
export type PortalTrafficPhase="entering"|"leaving";
export const PORTAL_HALF_CLEARANCE=0.68;
export const SHOP_PORTAL_BUILD_CLEARANCE=Object.freeze({
  minX:-5.6,maxX:-2.4,minZ:3.15,maxZ:7,
});
/** The second opening has become solid rock, not a spare build slot. */
export const SEALED_PASSAGE_BUILD_CLEARANCE=Object.freeze({
  minX:2.4,maxX:5.6,minZ:3.15,maxZ:7,
});
/** The former right exit is continuous solid rock, NOT a furniture mount.
 * Wider furniture can overlap it even if the crosshair is outside this zone;
 * actual footprints are validated separately.
 */
export function isSealedPassageWallHit(
  hit:{readonly x:number;readonly z:number},
):boolean{
  return Number.isFinite(hit.x)&&Number.isFinite(hit.z)&&
    hit.x>=SEALED_PASSAGE_BUILD_CLEARANCE.minX&&
    hit.x<=SEALED_PASSAGE_BUILD_CLEARANCE.maxX&&
    hit.z>=6.55&&hit.z<=7.35;
}
export interface ShopPortalBounds {
  readonly minX:number;readonly maxX:number;
  readonly minZ:number;readonly maxZ:number;
}
export function overlapsShopPortalClearance(box:ShopPortalBounds,padding=0):boolean{
  return [SHOP_PORTAL_BUILD_CLEARANCE,SEALED_PASSAGE_BUILD_CLEARANCE].some(zone=>
    box.minX<zone.maxX+padding&&box.maxX>zone.minX-padding&&
    box.minZ<zone.maxZ+padding&&box.maxZ>zone.minZ-padding);
}
export function shopPortalTravelLane(phase:PortalTrafficPhase):number{
  // 1.14 m between traffic lanes, comfortably above shoulder separation.
  return SHOP_PORTAL_X+(phase==="entering"?-0.57:0.57);
}
export function insideShopPortalCorridor(
  point:{readonly x:number;readonly z:number},innerZ=SHOP_PORTAL_INNER_Z,
):boolean{
  return point.z>innerZ+0.25&&
    Math.abs(point.x-SHOP_PORTAL_X)<=PORTAL_HALF_CLEARANCE;
}
export function inShopPortalThroat(
  point:{readonly x:number;readonly z:number},
):boolean{
  return point.z>=4.8&&point.z<=13.2&&
    Math.abs(point.x-SHOP_PORTAL_X)<1.45;
}
