import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { Material } from "@babylonjs/core/Materials/material";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import { palmGripBetweenFingers } from "./tripoGripPresentation.ts";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { loadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import "@babylonjs/loaders/glTF/2.0";
import { createCaveTrollVisual, type CaveTrollVisual, type CaveTrollAnimation, type TrollGripPose } from "./caveTrollVisual.ts";
import { sampleTripoBossPose, sampleTripoFade, sampleTripoTurnStride, TRIPO_FADE_SECONDS, type TripoClip, type TripoLocomotion } from "./tripoBossMotion.ts";

const MODEL = "assets/models/ashen-tunnel-mauler-tripo-combat.glb";
const REQUIRED_CLIPS: readonly TripoClip[] = [
  "idle_combat", "walk_heavy", "attack_2h_swing", "stagger", "roar", "death_fall",
  "grab_hero", "throw_hero",
];

type TripoBlend = { from: AnimationGroup; frame: number; elapsed: number };

/** Visual-only unarmed skinned boss. The Tripo rig does not grip a weapon, so
 * the rejected stone-maul prop is gone. The existing two-hand overhead motion
 * reads as a heavy double-fist smash instead. All combat stays authoritative.
 */
export function createTripoCaveTrollVisual(scene: Scene): CaveTrollVisual {
  const root = new TransformNode("arena-boss-troll", scene);
  root.metadata = {
    kind: "boss", role: "boss", visualId: "ashen-tunnel-mauler-tripo",
    tripoStatus: "loading", geometryCount: 0, animationClip: null,
    facingCorrectionRadians: 0, weaponMode: "unarmed",
  };
  const fallback = createCaveTrollVisual(scene);
  fallback.root.name = "troll-legacy-loading-fallback";
  fallback.root.parent = root;

  let disposed = false;
  let loaded: AssetContainer | null = null;
  let clips: Map<string, AnimationGroup> | null = null;
  let active: AnimationGroup | null = null;
  let activeFrame = 0;
  let blend: TripoBlend | null = null;
  let lastYaw: number | null = null;
  let lastInput: CaveTrollAnimation | null = null;
  let previousPhase: CaveTrollAnimation["phase"] | null = null;
  let deathClock = 0;
  let travelled = 0;
  let quietTime = .3;
  let walking = false;
  let gripJoints: { palm: TransformNode; index: TransformNode;
    middle: TransformNode; thumb: TransformNode } | null = null;

  /** The exported 65-bone Tripo source really animates LeftHand, its thumb,
   * index and middle fingers. Read the *evaluated* Babylon world matrices
   * after each animation sample; never approximate with the boss heading. */
  const gripPose = (): TrollGripPose | null => {
    if (!gripJoints || disposed || root.isDisposed()) return null;
    const {palm,index,middle,thumb} = gripJoints;
    const palmWorld = palm.getAbsolutePosition();
    const fingerWorld = index.getAbsolutePosition();
    const middleWorld = middle.getAbsolutePosition();
    const thumbWorld = thumb.getAbsolutePosition();
    const handRotation = Quaternion.Identity();
    palm.computeWorldMatrix(true).decompose(undefined,handRotation,undefined);
    return {
      position: palmGripBetweenFingers(palmWorld,fingerWorld,middleWorld,thumbWorld),
      handRotation,
    };
  };

  scene.onDisposeObservable.addOnce(() => { disposed = true; });

  const play = (input: CaveTrollAnimation): void => {
    if (!clips) return;
    const sample = sampleTripoBossPose(input, deathClock, { walking, distance: travelled });
    const group = clips.get(sample.clip);
    if (!group) return;
    if (active !== group) {
      // Two poses at a time: keep the old pose at the handoff frame, start the
      // new group at zero weight. Avoid permanent paused animations / jitter.
      blend?.from.stop();
      blend = active ? { from: active, frame: activeFrame, elapsed: 0 } : null;
      active = group;
      group.start(false);
      group.pause();
    }
    const frame = group.from + (group.to - group.from) * sample.progress;
    if (blend) {
      blend.elapsed = Math.min(TRIPO_FADE_SECONDS, blend.elapsed +
        Math.max(0, Math.min(.1, input.delta)));
      const weight = sampleTripoFade(blend.elapsed);
      blend.from.setWeightForAllAnimatables(1 - weight);
      group.setWeightForAllAnimatables(weight);
      blend.from.goToFrame(blend.frame);
      group.goToFrame(frame);
      root.metadata.tripoBlendWeight = weight;
      if (weight >= 1) {
        blend.from.stop();
        blend = null;
      }
    } else {
      group.setWeightForAllAnimatables(1);
      group.goToFrame(frame);
      root.metadata.tripoBlendWeight = 1;
    }
    activeFrame = frame;
    root.metadata.animationClip = sample.clip;
    root.metadata.animationProgress = sample.progress;
    root.metadata.animationPhase = input.phase;
    root.metadata.animationClock = input.time;
    root.metadata.tripoGaitDistance = travelled;
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
      // The original 180° correction faced the textured FRONT away from the
      // hero. The combat root already faces +Z toward its authoritative target.
      pivot.scaling.setAll(5.7);
      pivot.rotation.y = 0;
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
      const skeleton=staged.skeletons[0];
      const lookup = (name:string): TransformNode | null => {
        const joint=staged.transformNodes.find(node=>node.name===name);
        if (joint) return joint;
        const linked=skeleton.bones.find(b=>b.name===name)?.getTransformNode();
        return linked??null;
      };
      const palm=lookup("mixamorig:LeftHand");
      const index=lookup("mixamorig:LeftHandIndex1");
      const middle=lookup("mixamorig:LeftHandMiddle1");
      const thumb=lookup("mixamorig:LeftHandThumb2");
      if (!palm || !index || !middle || !thumb)
        throw new Error("Tripo left-hand grip bones are missing from the skinned rig");
      gripJoints={palm,index,middle,thumb};
      loaded = staged;
      clips = available;
      root.metadata.tripoStatus = "ready";
      root.metadata.tripoUrl = url;
      root.metadata.tripoGripAnchor = "mixamorig:LeftHand";
      root.metadata.tripoGripReady = true;
      root.metadata.tripoBoneCount = staged.skeletons[0].bones.length;
      root.metadata.tripoClipCount = staged.animationGroups.length;
      root.metadata.geometryCount = candidates.length;
      fallback.root.setEnabled(false);
      if (lastInput) play(lastInput);
    } catch (error) {
      gripJoints=null;
      if (staged && staged !== loaded) staged.dispose();
      if (disposed || root.isDisposed()) return;
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
    gripPose,
    animate(input: CaveTrollAnimation): void {
      lastInput = input;
      const dt=Math.max(0,Math.min(.1,input.delta));
      const turnStep = sampleTripoTurnStride(lastYaw, root.rotation.y);
      lastYaw = root.rotation.y;
      if (input.introTime===undefined && input.phase==="chase") {
        if (input.moved>.008 || turnStep>.004) {
          // Circling heroes turn the motor's boss root without translation.
          // Add a few visible foot steps while turning; no gameplay movement.
          travelled+=Math.max(0,input.moved)+turnStep;
          quietTime=0;
          walking=true;
        } else {
          quietTime+=dt;
          if (quietTime>.24) walking=false;
        }
      } else {
        quietTime=.3;
        walking=false;
      }
      if (input.phase === "dead") {
        deathClock = previousPhase === "dead"
          ? deathClock + dt : 0;
      } else deathClock = 0;
      previousPhase = input.phase;
      if (clips) play(input);
      else fallback.animate(input);
    },
  };
}
