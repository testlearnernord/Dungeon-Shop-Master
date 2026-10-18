export type VisitorStatus = "exploring" | "traveling" | "at-shop" | "returning" | "dead";
export type VisitorRole = "tank" | "DPS" | "healer";

export interface VisitorSnapshot {
  readonly id: string;
  readonly name: string;
  readonly role: VisitorRole;
  readonly status: VisitorStatus;
}

export interface VisitorChanges {
  readonly entering: readonly VisitorSnapshot[];
  readonly staying: readonly VisitorSnapshot[];
  readonly leaving: readonly VisitorSnapshot[];
}

export function reconcileVisitors(
  previous: readonly VisitorSnapshot[],
  current: readonly VisitorSnapshot[],
): VisitorChanges {
  const oldVisitors = new Map(previous.filter(({ status }) => status === "at-shop").map((hero) => [hero.id, hero]));
  const newVisitors = new Map(current.filter(({ status }) => status === "at-shop").map((hero) => [hero.id, hero]));

  return {
    entering: [...newVisitors.values()].filter(({ id }) => !oldVisitors.has(id)),
    staying: [...newVisitors.values()].filter(({ id }) => oldVisitors.has(id)),
    leaving: [...oldVisitors.values()].filter(({ id }) => !newVisitors.has(id)),
  };
}
