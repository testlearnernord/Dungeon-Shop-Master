export const DEFAULT_SEED = 7351;

export function validateSeed(seed: number): void {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError("Seed must be an unsigned 32-bit integer.");
  }
}

// A tick owns its stream; only the resulting numeric state is persisted.
export class SeededRandom {
  state: number;

  constructor(state: number) {
    validateSeed(state);
    this.state = state;
  }

  next(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  int(max: number): number {
    return Math.floor(this.next() * max);
  }
}
