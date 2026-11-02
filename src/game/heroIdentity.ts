/** UI-only, stable across living and fallen hero history. Saved names/RNG are untouched. */
export function heroDisplayNames(heroes: readonly { readonly id: string; readonly name: string }[]): ReadonlyMap<string, string> {
  const sorted = [...heroes].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  const counts = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const hero of sorted) {
    const index = (counts.get(hero.name) ?? 0) + 1;
    counts.set(hero.name, index);
    labels.set(hero.id, index === 1 ? hero.name : hero.name + " #" + index);
  }
  return labels;
}
export function heroPortraitIndex(id: string): number {
  const match = /^adventurer-([1-9]\d*)$/.exec(id);
  return match ? (Number(match[1]) - 1) % 25 : 0;
}
