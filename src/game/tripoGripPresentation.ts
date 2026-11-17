import { Vector3 } from "@babylonjs/core/Maths/math.vector";

/**
 * The player's torso belongs in the pocket of the real animated LEFT hand:
 * between thumb, index and middle finger, not at a fixed point on the troll.
 * All inputs and the returned socket are in Babylon WORLD coordinates.
 *
 * This module never reads/modifies hit logic, navigation or saved replays.
 */
export function palmGripBetweenFingers(
  palm: Vector3, index: Vector3, middle: Vector3, thumb: Vector3,
): Vector3 {
  return palm.scale(.12)
    .add(index.scale(.28))
    .add(middle.scale(.21))
    .add(thumb.scale(.39));
}

/** The spectator's visible flight starts exactly where the animated hand
 * released the hero, follows the MOTOR'S horizontal displacement, then
 * converges on the motor's actual landing. No visual offset can change HP,
 * hit timing, lava contact or the saved outcome.
 */
export function airborneRootFromGrip(
  releasedRoot: Vector3,
  releaseMotor: Vector3,
  motorNow: Vector3,
  phaseProgress: number,
): Vector3 {
  const p = Math.max(0,Math.min(1,phaseProgress));
  const displaced = releasedRoot.add(new Vector3(
    motorNow.x-releaseMotor.x,0,motorNow.z-releaseMotor.z));
  const grounded = new Vector3(motorNow.x,0,motorNow.z);
  const result = Vector3.Lerp(displaced,grounded,p*p);
  result.y = Math.max(0,releasedRoot.y)*(1-p) +
    1.0*Math.sin(Math.PI*p);
  return result;
}
