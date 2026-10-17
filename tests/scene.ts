import { Engine } from "@babylonjs/core/Engines/engine";
import type { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";

export function inspectPlayer(reset?: { x: number; y: number; z: number }) {
  const scene = Engine.LastCreatedScene!;
  const camera = scene.activeCamera as UniversalCamera;
  if (reset) {
    camera.position.set(reset.x, reset.y, reset.z);
    camera.rotation.setAll(0);
    camera.cameraDirection.setAll(0);
    camera.cameraRotation.setAll(0);
  }
  return {
    x: camera.position.x,
    y: camera.position.y,
    z: camera.position.z,
    yaw: camera.rotation.y,
    frame: scene.getFrameId(),
    collisions: camera.checkCollisions && scene.collisionsEnabled,
    gravity: camera.applyGravity,
  };
}
