/**
 * Pure register timing rules. The cashier UI has two distinct actions instead
 * of asking players to press R twice at an unexplained moving line.
 * Payment, stock and tips remain owned exclusively by GameStore.
 */
export const CASHIER_STAGES = [
  {
    title: "Verify the goods",
    detail: "Check the shopper's basket against the shelf receipt.",
    target: 0.42,
  },
  {
    title: "Seal the receipt",
    detail: "Stamp Galvik's ledger before the customer departs.",
    target: 0.64,
  },
] as const;

export const CASHIER_TIMING_TOLERANCE = 0.09;

export interface CashierTimingResult {
  readonly accepted: boolean;
  readonly nextStep: number;
  readonly completed: boolean;
  readonly direction: "early" | "late" | "exact";
}

/** Input is the actual on-screen 0..1 needle position, not game RNG. */
export function evaluateCashierTiming(step: number, position: number): CashierTimingResult {
  if(!Number.isInteger(step)||step<0||step>=CASHIER_STAGES.length)
    throw new RangeError("Invalid cashier step.");
  if(!Number.isFinite(position)||position<0||position>1)
    return {accepted:false,nextStep:step,completed:false,direction:"early"};
  const offset=position-CASHIER_STAGES[step].target;
  if(Math.abs(offset)>CASHIER_TIMING_TOLERANCE){
    return {accepted:false,nextStep:step,completed:false,
      direction:offset<0?"early":"late"};
  }
  const nextStep=step+1;
  return {accepted:true,nextStep,
    completed:nextStep===CASHIER_STAGES.length,direction:"exact"};
}
