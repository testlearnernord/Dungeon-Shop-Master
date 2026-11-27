import type {LiveFloorSpectatorFrame} from "./liveFloorSpectator.ts";

/** Only features requiring mesh construction affect this identity.
 * A pack's one-cell movement changes its transform, NOT its mesh identity.
 * An active pack can first appear on a floor without any resolved-site
 * change, so looking only at resolvedFeatureIds loses the Ghoul forever. */
export function liveFloorFeatureIdentity(
  view:Pick<LiveFloorSpectatorFrame,"resolved"|"monsters"|"fallen">,
):string {
  const resolved=[...view.resolved].sort();
  const generations=[...(view.monsters??[])].map(monster=>
    [monster.id,monster.siteCycle] as const)
    .sort(([a],[b])=>a.localeCompare(b));
  const fallen=(view.fallen??[]).map(body=>[body.heroId,body.x,body.z]);
  return JSON.stringify([resolved,generations,fallen]);
}

/** Resolved renewable containers and pressure plates remain physical
 * landmarks. A defeated monster, unlike its site, has no visible actor. */
export function dungeonSiteDisplay(kind:string,resolved:boolean):
  "active"|"spent"|"hidden" {
  if(!resolved)return "active";
  return kind==="treasure"||kind==="trap"?"spent":"hidden";
}

/** Shared map symbols; dim spent sites must not look like live rewards. */
export function dungeonSiteMapColor(kind:string,resolved:boolean):string|null{
  const display=dungeonSiteDisplay(kind,resolved);
  if(display==="hidden")return null;
  if(display==="spent")return kind==="treasure"?"#665a40":"#68504d";
  return kind==="treasure"?"#e6b845":kind==="trap"?"#c94c42":
    kind==="stair-descend"?"#e7bf75":kind==="stair-sealed"?"#a35e5e":
    kind.startsWith("stair-")?"#70d2b4":"#e27c62";
}
