/**
 * The V-mode combat motor always advances in actual 1/60s ticks. Its compact
 * 10Hz checkpoints are for replay/save-size economy only. Drawing at those
 * checkpoints directly would visibly cap movement at 10 FPS.
 *
 * To interpolate between TWO already committed checkpoints, presentation
 * runs one checkpoint behind the authoritative sandbox clock. Nothing here
 * predicts damage, executes combat AI or alters the encounter timeline.
 */
export const LAB_CAPTURE_STRIDE=6;
export const LAB_PRESENTATION_LAG=LAB_CAPTURE_STRIDE/60;

/** Draw time is monotonic within a single test and never outruns the most
 * recent saved pose. Pausing/finishing displays the exact last committed pose
 * rather than showing a permanently delayed final HP/result. */
export function developerPresentationTime(
  simulationSeconds:number,
  unconsumedSeconds:number,
  lastCommittedSeconds:number,
  previousPresentationSeconds:number,
  pausedOrFinished:boolean,
):number {
  const values=[simulationSeconds,unconsumedSeconds,
    lastCommittedSeconds,previousPresentationSeconds];
  if(values.some(value=>!Number.isFinite(value)||value<0))
    throw new RangeError("Non-finite or negative combat presentation time");
  const desired=pausedOrFinished?lastCommittedSeconds:
    Math.max(0,simulationSeconds+unconsumedSeconds-LAB_PRESENTATION_LAG);
  return Math.min(lastCommittedSeconds,Math.max(
    previousPresentationSeconds,desired));
}
