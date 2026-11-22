/** One material-space mapping for all unrotated cave stone/floor boxes.
 * UVs are derived from *world* metres, not the size of an individual mesh.
 * Thus a mined one-metre slice does not restart a full texture at its edge.
 * Both shop and cellar, original and freshly excavated, use this mapping.
 * No saved state, gameplay RNG, meshes or textures are allocated here.
 */
export const CAVE_SURFACE_METRES_PER_REPEAT=2;
export interface CaveVector{
  readonly x:number;readonly y:number;readonly z:number;
}
export function caveSurfaceUV(point:CaveVector,normal:CaveVector):{
  readonly u:number;readonly v:number;
}{
  const m=CAVE_SURFACE_METRES_PER_REPEAT;
  if(Math.abs(normal.y)>.5)return {u:point.x/m,v:point.z/m};
  if(Math.abs(normal.x)>.5)return {u:point.z/m,v:point.y/m};
  return {u:point.x/m,v:point.y/m};
}
