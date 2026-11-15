/** Compatibility facade for existing code. The canonical definitions and
 * geometry algorithms now live together in furnitureRegistry.ts for ALL
 * eight current furniture types, not in separate shelf/private/wall tables.
 */
export {
  SHOP_FLOOR_FURNITURE,turnShopOffset,shopFixtureBounds,
  pointTouchesShopBounds,shopFixtureTouches,
  shelfServicePoint,cashierServicePoint,
} from "./furnitureRegistry.ts";
export type {
  ShopFloorKind,QuarterTurn,ShopFloorTransform,ShopFloorPoint,
  ShopFloorBounds,ShopFloorVisual,
} from "./furnitureRegistry.ts";
