import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { loadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import "@babylonjs/loaders/glTF/2.0";
import { createCaveTrollVisual, type CaveTrollVisual, type CaveTrollAnimation } from "./caveTrollVisual.ts";
import { sampleTripoBossPose, type TripoClip, type TripoLocomotion } from "./tripoBossMotion.ts";

const MODEL = "assets/models/ashen-tunnel-mauler-tripo.glb";
const REQUIRED_CLIPS: readonly TripoClip[] = [
  "idle_combat", "walk_heavy", "attack_2h_swing", "stagger", "roar", "death_fall",
];

/** Visual prop, not combat collision. The Tripo GLB has 65 animated joints
 * but no weapon mesh; a scene-owned stone maul tracks the two hand targets.
 * This is a temporary art-direction prop until a fitted authored weapon exists.
 */
function createHeldMaul(scene: Scene): TransformNode {
  const root = new TransformNode("tripo-maul-visual", scene);
  const wood = new StandardMaterial("tripo-maul-haft-wood", scene);
  wood.diffuseColor = Color3.FromHexString("#4f3325");
  const stone = new StandardMaterial("tripo-maul-stone", scene);
  stone.diffuseColor = Color3.FromHexString("#55504c");
  const iron = new StandardMaterial("tripo-maul-iron", scene);
  iron.diffuseColor = Color3.FromHexString("#82756e");
  const shaft = MeshBuilder.CreateCylinder("tripo-maul-haft",{
    height: 2.45, diameter: .20, tessellation: 10,
  },scene);
  shaft.parent=root;shaft.material=wood;
  const head=MeshBuilder.CreateSphere("tripo-maul-stone-head",{
    diameter: 1.6,segments: 8,
  },scene);
  head.parent=root;
  head.position.y=1.35;
  head.scaling.set(.95,.58,.72);
  head.material=stone;
  for(const y of [1.03,1.65]){
    const band=MeshBuilder.CreateTorus("tripo-maul-iron-band",{
      diameter: 1.31, thickness: .13, tessellation: 12,
    },scene);
    band.parent=root;
    band.position.y=y;
    band.rotation.z=Math.PI/2;
    band.material=iron;
  }
  for(const mesh of root.getChildMeshes(false)){
    mesh.isPickable=false;
    mesh.checkCollisions=false;
  }
  root.rotationQuaternion=Quaternion.Identity();
  root.setEnabled(false);
  return root;
}

/** Experimental presentation-only skinned boss. Neither this animation graph
 * nor the held maul can resolve hits, move actors, alter RNG or edit replays.
 */
export function createTripoCaveTrollVisual(scene: Scene): CaveTrollVisual {
  const root = new TransformNode("arena-boss-troll", scene);
  root.metadata = {
    kind: "boss", role: "boss", visualId: "ashen-tunnel-mauler-tripo",
    tripoStatus: "loading", geometryCount: 0, animationClip: null,
    facingCorrectionRadians: 0,
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
  let travelled = 0;
  let quietTime = .3;
  let walking = false;
  let maul: TransformNode | null = null;
  let rightHand: TransformNode | null = null;
  let leftHand: TransformNode | null = null;

  scene.onDisposeObservable.addOnce(() => { disposed = true; });

  function updateHeldMaul(input: CaveTrollAnimation): void {
    if (!maul || !rightHand || !leftHand) return;
    // These animated glTF joint transforms are evaluated by goToFrame().
    rightHand.computeWorldMatrix(true);
    leftHand.computeWorldMatrix(true);
    const right=rightHand.getAbsolutePosition();
    const left=leftHand.getAbsolutePosition();
    const attacking=input.phase==="windup"||input.phase==="strike"||input.phase==="recover";
    const grip=attacking ? right.add(left).scale(.5) : right.clone();
    const front=new Vector3(Math.sin(root.rotation.y),0,Math.cos(root.rotation.y));
    const impact=Math.max(0,Math.min(1,input.phase==="strike"?input.phaseAge/.14:
      input.phase==="recover"?1:0));
    const axis=attacking
      ? front.scale(.88).add(new Vector3(0,.50-impact*.85,0)).normalize()
      : front.scale(.22).add(new Vector3(0,-1,0)).normalize();
    const cross=Vector3.Cross(Vector3.Up(),axis);
    const dot=Math.max(-1,Math.min(1,Vector3.Dot(Vector3.Up(),axis)));
    maul.position.copyFrom(grip.add(axis.scale(.85)));
    maul.rotationQuaternion=cross.lengthSquared()<1e-8
      ? (dot<0?Quaternion.RotationAxis(Vector3.Right(),Math.PI):Quaternion.Identity())
      : Quaternion.RotationAxis(cross.normalize(),Math.acos(dot));
  }

  const play = (input: CaveTrollAnimation) => {
    if (!clips) return;
    const locomotion:TripoLocomotion={walking,distance:travelled};
    const sampled = sampleTripoBossPose(input, deathClock, locomotion);
    const group = clips.get(sampled.clip);
    if (!group) return;
    if (active !== group) {
      active?.stop();
      active = group;
      group.start(false);
      group.pause(); // visual pose is sampled at motor/replay time, never Babylon wall time
    }
    group.goToFrame(group.from + (group.to - group.from) * sampled.progress);
    updateHeldMaul(input);
    root.metadata.animationClip = sampled.clip;
    root.metadata.animationProgress = sampled.progress;
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

      const right=staged.transformNodes.find(node => node.name==="mixamorig:RightHand");
      const left=staged.transformNodes.find(node => node.name==="mixamorig:LeftHand");
      if (!right || !left) throw new Error("Tripo asset is missing the animated hand grip joints");
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
      maul=createHeldMaul(scene);
      rightHand=right;
      leftHand=left;
      loaded = staged;
      clips = available;
      root.metadata.tripoStatus = "ready";
      root.metadata.tripoUrl = url;
      root.metadata.tripoBoneCount = staged.skeletons[0].bones.length;
      root.metadata.tripoClipCount = staged.animationGroups.length;
      root.metadata.geometryCount = candidates.length;
      fallback.root.setEnabled(false);
      maul.setEnabled(true);
      if (lastInput) play(lastInput);
    } catch (error) {
      if (staged && staged !== loaded) staged.dispose();
      if (disposed || root.isDisposed()) return;
      root.metadata.tripoStatus = "fallback";
      root.metadata.tripoError = String(error);
      maul?.setEnabled(false);
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
      const dt=Math.max(0,Math.min(.1,input.delta));
      if (input.introTime===undefined && input.phase==="chase") {
        if (input.moved>.008) {
          travelled+=input.moved;
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
