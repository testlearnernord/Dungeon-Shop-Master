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


export function appearanceForHero(id: string, role: AdventurerRole) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash = Math.imul(hash ^ id.charCodeAt(i), 16777619) >>> 0;
  }
  const skinTones = ["#b88b69", "#d3a17a", "#8f674d", "#e1bb96", "#a87859"];
  const hairTones = ["#282320", "#553923", "#a56b35", "#a6a19a", "#473f39"];
  return {
    key: id + ":" + role + ":" + hash.toString(16),
    skin: skinTones[hash % skinTones.length],
    hair: hairTones[(hash >>> 4) % hairTones.length],
    trim: ["#b48d58", "#8d9b8f", "#c7a66b"][(hash >>> 9) % 3],
    beard: role !== "healer" && ((hash >>> 13) & 1) === 1,
    stature: 0.97 + ((hash >>> 16) % 7) / 100,
  };
}

