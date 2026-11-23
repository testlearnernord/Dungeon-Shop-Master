import type {LiveFloorSpectatorFrame} from "./liveFloorSpectator.ts";

/** Only features requiring mesh construction affect this identity.
 * A pack's one-cell movement changes its transform, NOT its mesh identity.
 * An active pack can first appear on a floor without any resolved-site
 * change, so looking only at resolvedFeatureIds loses the Ghoul forever. */
export function liveFloorFeatureIdentity(
  view:Pick<LiveFloorSpectatorFrame,"resolved"|"monsters">,
):string {
  const resolved=[...view.resolved].sort();
  const generations=[...(view.monsters??[])].map(monster=>
    [monster.id,monster.siteCycle] as const)
    .sort(([a],[b])=>a.localeCompare(b));
  return JSON.stringify([resolved,generations]);
}
