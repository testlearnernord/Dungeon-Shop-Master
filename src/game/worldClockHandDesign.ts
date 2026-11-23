/** Tripo clock coordinates measured from the actual committed GLB.
 * Source front dial at x≈0 and y≈0.49 reaches z≈0.035–0.055 m.
 * The old code mounted the hand beyond the entire GLB depth (z=0.103),
 * leaving an obvious air gap. These numbers refer to the DIAL, not chains. */
export const TRIPO_CLOCK_HEIGHT=0.91888427734375;
export const TRIPO_CLOCK_DIAL_CENTER_Y=0.49;
export const TRIPO_CLOCK_DIAL_FACE_Z=0.055;
export const WORLD_CLOCK_WALL_HANGING_Y=0.75;
export const CLOCK_HAND_GAP_METRES=0.018;

/** Local to the shared wall-mount root. Never mutates any game clock. */
export function worldClockHandMount(displayHeight:number):{
  readonly scale:number;
  readonly y:number;
  readonly z:number;
  readonly dialSurfaceZ:number;
}{
  if(!Number.isFinite(displayHeight)||displayHeight<=0)
    throw new RangeError("Expected a positive clock furniture height.");
  const scale=displayHeight/TRIPO_CLOCK_HEIGHT;
  const dialSurfaceZ=TRIPO_CLOCK_DIAL_FACE_Z*scale;
  return {
    scale,
    y:WORLD_CLOCK_WALL_HANGING_Y+TRIPO_CLOCK_DIAL_CENTER_Y*scale,
    z:dialSurfaceZ+CLOCK_HAND_GAP_METRES,
    dialSurfaceZ,
  };
}
