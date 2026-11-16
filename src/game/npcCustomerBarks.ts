import { ITEMS, type ItemId } from "./economy.ts";
import type { VisitorRole } from "./npcVisitors.ts";

/** Short, cosmetic lines from things the NPC has already experienced.
 * Never inspect a forecast of combat or consume simulation RNG here.
 */
export type CustomerBarkKind =
  "restock" | "credit-request" | "pickup" | "paid" |
  "credit-granted" | "unserved" | "refused" | "no-need";

export interface CustomerBarkContext {
  readonly heroId: string;
  readonly role: VisitorRole;
  readonly kind: CustomerBarkKind;
  readonly itemId?: ItemId | null;
  readonly gold?: number;
}

/** Stable across frames and reloads without consuming a gameplay random roll. */
function variant(heroId: string, kind: CustomerBarkKind): number {
  let hash = 2166136261;
  for (const character of heroId + ":" + kind) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2;
}

export function customerBark(context: CustomerBarkContext): string {
  const item = ITEMS.find(entry => entry.id === context.itemId)?.name ?? "supplies";
  const coins = Number.isSafeInteger(context.gold) && (context.gold ?? -1) >= 0
    ? String(context.gold) + "g" : "not enough gold";
  const {kind, role} = context;
  const lines: Record<CustomerBarkKind, readonly [string, string]> = {
    restock: [
      "Any " + item + " left? The shelf says otherwise.",
      "I need " + item + ". I'll wait, but not forever.",
    ],
    "credit-request": [
      "Could you put " + item + " on my tab?",
      "I have " + coins + ". How much faith will that buy?",
    ],
    pickup: [
      role === "tank" ? "I can use that " + item + " on the front line."
        : role === "healer" ? "Good. " + item + " might keep someone standing."
        : "This " + item + " had better be worth carrying.",
      "Got the " + item + ". Better pay before the merchant bites.",
    ],
    paid: [
      "There's your gold. Try not to count it twice.",
      "Paid in full. No promises about coming back.",
    ],
    "credit-granted": [
      "Put " + item + " in your debt book. I'll remember.",
      "Another debt to Galvik. At least I have " + item + ".",
    ],
    unserved: [
      "No " + item + "? I'll have to take my chances.",
      "Still no " + item + ". I'm done waiting.",
    ],
    refused: [
      "No credit. Understood. I'll find another way.",
      "Keep your ledger, Galvik. I'm leaving.",
    ],
    "no-need": [
      "Nothing I need today. Keep the shelves.",
      "Just looking. Even adventurers have budgets.",
    ],
  };
  return lines[kind][variant(context.heroId, kind)];
}

/** Only one speaker on screen. Prioritize completed transactions over chatter. */
export function customerBarkPriority(kind:CustomerBarkKind):number {
  if(kind==="paid" || kind==="credit-granted")return 3;
  if(kind==="pickup" || kind==="unserved" || kind==="refused")return 2;
  return 1;
}
