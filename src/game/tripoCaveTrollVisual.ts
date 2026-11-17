import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { Material } from "@babylonjs/core/Materials/material";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { loadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import "@babylonjs/loaders/glTF/2.0";
import { createCaveTrollVisual, type CaveTrollVisual, type CaveTrollAnimation } from "./caveTrollVisual.ts";
import { sampleTripoBossPose, type TripoClip } from "./tripoBossMotion.ts";

const MODEL = "assets/models/ashen-tunnel-mauler-tripo.glb";
const REQUIRED_CLIPS: readonly TripoClip[] = [
  "idle_combat", "walk_heavy", "attack_2h_swing", "attack_slam", "stagger", "roar", "death_fall",
];

/** Experimental *presentation-only* skinned boss. The original boss is kept
 * as a visible loading/error fallback and can still be selected explicitly.
 * This visual owns no collision, health, AI, audio or persisted state.
 */
export function createTripoCaveTrollVisual(scene: Scene): CaveTrollVisual {
  const root = new TransformNode("arena-boss-troll", scene);
  root.metadata = {
    kind: "boss", role: "boss", visualId: "ashen-tunnel-mauler-tripo",
    tripoStatus: "loading", geometryCount: 0, animationClip: null,
  };
  const fallback = createCaveTrollVisual(scene);
  fallback.root.name = "troll-legacy-loading-fallback";
  fallback.root.parent = root;

  let disposed = false;
  let loaded: AssetContainer | null = null;
  let clips: Map<string, AnimationGroup> | null = null;
  let active: AnimationGroup | null = null;
  let lastInput: CaveTrollAnimation | null = null;
  let previousPhase: CaveTrollAnimation["phase"] | null = null;
  let deathClock = 0;

  scene.onDisposeObservable.addOnce(() => { disposed = true; });

  const play = (input: CaveTrollAnimation) => {
    if (!clips) return;
    const sampled = sampleTripoBossPose(input, deathClock);
    const group = clips.get(sampled.clip);
    if (!group) return; // validated before the model becomes visible
    if (active !== group) {
      active?.stop();
      active = group;
      group.start(false);
      group.pause(); // phase/replay time is authoritative, never Babylon wall time
    }
    group.goToFrame(group.from + (group.to - group.from) * sampled.progress);
    root.metadata.animationClip = sampled.clip;
    root.metadata.animationProgress = sampled.progress;
    root.metadata.animationPhase = input.phase;
    root.metadata.animationClock = input.time;
  };

  const ready = (async (): Promise<void> => {
    let staged: AssetContainer | null = null;
    try {
      const url = import.meta.env.BASE_URL + MODEL;
      staged = await loadAssetContainerAsync(url, scene);
      if (disposed || root.isDisposed()) { staged.dispose(); return; }
      const candidates = staged.meshes.filter(mesh => mesh.getTotalVertices() > 0);
      const available = new Map(staged.animationGroups.map(group => [group.name, group]));
      if (candidates.length !== 1 || !staged.skeletons.length ||
          REQUIRED_CLIPS.some(name => !available.has(name)))
        throw new Error("Tripo asset is missing a skinned mesh or required animation clips");

      staged.addAllToScene();
      const pivot = new TransformNode("troll-tripo-asset-pivot", scene);
      pivot.parent = root;
      // Original Tripo mesh is ~0.98 m tall. Approximate the legacy ~5.6 m
      // boss; GLTF-to-Babylon handedness flips its local forward direction.
      pivot.scaling.setAll(5.7);
      pivot.rotation.y = Math.PI;
      for (const node of staged.transformNodes) {
        if (!node.parent) node.parent = pivot;
      }
      for (const mesh of staged.meshes) {
        if (!mesh.parent) mesh.parent = pivot;
        mesh.isPickable = false;
        mesh.checkCollisions = false;
        mesh.hasVertexAlpha = false;
        if (mesh.material) {
          mesh.material.alpha = 1;
          mesh.material.transparencyMode = Material.MATERIAL_OPAQUE;
          mesh.material.forceDepthWrite = true;
        }
      }

      loaded = staged;
      clips = available;
      root.metadata.tripoStatus = "ready";
      root.metadata.tripoUrl = url;
      root.metadata.tripoBoneCount = staged.skeletons[0].bones.length;
      root.metadata.tripoClipCount = staged.animationGroups.length;
      root.metadata.geometryCount = candidates.length;
      fallback.root.setEnabled(false);
      if (lastInput) play(lastInput);
    } catch (error) {
      if (staged && staged !== loaded) staged.dispose();
      if (disposed || root.isDisposed()) return;
      // Never leave an invisible troll if a GLB fails or is malformed.
      root.metadata.tripoStatus = "fallback";
      root.metadata.tripoError = String(error);
      fallback.root.setEnabled(true);
    }
  })();

  return {
    root,
    get geometryCount() {
      return (root.metadata.geometryCount as number) || fallback.geometryCount;
    },
    ready,
    animate(input: CaveTrollAnimation): void {
      lastInput = input;
      if (input.phase === "dead") {
        deathClock = previousPhase === "dead"
          ? deathClock + Math.max(0, input.delta) : 0;
      } else deathClock = 0;
      previousPhase = input.phase;
      if (clips) play(input);
      else fallback.animate(input);
    },
  };
}
