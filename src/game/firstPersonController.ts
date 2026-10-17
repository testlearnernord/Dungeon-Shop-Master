import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import "@babylonjs/core/Collisions/collisionCoordinator";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";

export function createFirstPersonCamera(canvas: HTMLCanvasElement, scene: Scene): UniversalCamera {
  const camera = new UniversalCamera("player-camera", new Vector3(0, 1.7, -4.6), scene);
  camera.setTarget(new Vector3(0, 1.7, 0));
  camera.attachControl(canvas, true);
  camera.speed = 0.18;
  camera.inertia = 0.72;
  camera.angularSensibility = 2700;
  camera.keysUp.push(87);
  camera.keysDown.push(83);
  camera.keysLeft.push(65);
  camera.keysRight.push(68);
  camera.checkCollisions = true;
  camera.applyGravity = true;
  camera.ellipsoid = new Vector3(0.35, 0.85, 0.35);
  scene.gravity = new Vector3(0, -0.22, 0);
  return camera;
}
