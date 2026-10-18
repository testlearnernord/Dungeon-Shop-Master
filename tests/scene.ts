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

export function aimAtShelfSlot() {
  const start = inspectPlayer({ x: -1.5, y: 1.7, z: -2 });
  const scene = Engine.LastCreatedScene!;
  const camera = scene.activeCamera as UniversalCamera;
  camera.setTarget(scene.getMeshByName("shelf-1-slot-1")!.getAbsolutePosition());
  return start.frame;
}

export function inspectNpcVisuals() {
  const scene = Engine.LastCreatedScene!;
  const corridorWalls = scene.meshes.filter(({ name }) => name.startsWith("corridor-wall-") || name.startsWith("corridor-end-"));
  return {
    frame: scene.getFrameId(),
    time: performance.now(),
    npcMeshes: scene.meshes.filter(({ name }) => name.startsWith("npc-adventurer-")).map(({ name }) => name),
    visitors: scene.transformNodes
      .filter((node) => node.name.startsWith("npc-adventurer-") && node.metadata?.adventurerId)
      .map((node) => ({
        id: node.metadata.adventurerId as string,
        name: node.metadata.name as string,
        role: node.metadata.role as string,
        phase: node.metadata.phase as string,
        status: node.metadata.simulationStatus as string,
        uniqueId: node.uniqueId,
        x: node.position.x,
        y: node.position.y,
        z: node.position.z,
        unpickable: node.getChildMeshes(false).every((mesh) => !mesh.isPickable && !mesh.checkCollisions),
        hasLabel: node.getChildMeshes(false).some((mesh) => mesh.name === `${node.name}-label`),
        wallClear: corridorWalls.every((wall) => {
          const bounds = wall.getBoundingInfo().boundingBox;
          const radius = 0.31;
          return node.position.x + radius <= bounds.minimumWorld.x || node.position.x - radius >= bounds.maximumWorld.x ||
            node.position.z + radius <= bounds.minimumWorld.z || node.position.z - radius >= bounds.maximumWorld.z ||
            node.position.y + 2.5 <= bounds.minimumWorld.y || node.position.y >= bounds.maximumWorld.y;
        }),
        feetY: Math.min(...node.getChildMeshes(false)
          .filter((mesh) => mesh.name.includes("-leg-"))
          .map((mesh) => {
            mesh.computeWorldMatrix(true);
            return mesh.getBoundingInfo().boundingBox.minimumWorld.y;
          })),
      })),
    gateY: scene.getMeshByName("level-4-barrier")?.position.y,
    playerBarrierSolid: scene.getMeshByName("level-4-player-barrier")?.checkCollisions ?? false,
  };
}
