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

export function aimAtRosterBoard() {
  inspectPlayer({ x: -5, y: 1.7, z: -4.2 });
  const scene = Engine.LastCreatedScene!;
  (scene.activeCamera as UniversalCamera).setTarget(scene.getMeshByName("adventurer-roster-board")!.getAbsolutePosition());
  return scene.getFrameId();
}

/** Aim the FPS camera at the actual mattress, not nearby bedroom props. */
export function aimAtBed() {
  inspectPlayer({ x: 0.6, y: 1.7, z: -8.95 });
  const scene = Engine.LastCreatedScene!;
  (scene.activeCamera as UniversalCamera).setTarget(scene.getMeshByName("galvik-bed")!.getAbsolutePosition());
}

/** Regression probe for objects around the bed that must not trigger sleep. */
export function aimAtBedroomProp(name:string) {
  inspectPlayer({ x: 0.6, y: 1.7, z: -8.95 });
  const scene = Engine.LastCreatedScene!;
  (scene.activeCamera as UniversalCamera).setTarget(scene.getMeshByName(name)!.getAbsolutePosition());
}

export function inspectBedroomSightlines() {
  const scene = Engine.LastCreatedScene!;
  const at=(name:string)=>scene.getMeshByName(name)!;
  return {
    rosterX:at("adventurer-roster-board").position.x,
    rightmostFrameX:at("roster-frame-right").position.x,
    wallLeftWidth:at("bedroom-left-wall").getBoundingInfo().boundingBox.extendSizeWorld.x*2,
    wallRightWidth:at("bedroom-right-wall").getBoundingInfo().boundingBox.extendSizeWorld.x*2,
    jambsSolid:at("bedroom-door-jamb--1").checkCollisions&&
      at("bedroom-door-jamb-1").checkCollisions,
    lintelSolid:at("bedroom-door-lintel").checkCollisions,
    noteZ:at("bedroom-debt-note").position.z,
    rearRockZ:at("bedroom-rear-rock-7").position.z,
  };
}

export function aimAtShelfSlot() {
  const start = inspectPlayer({ x: -5.05, y: 1.7, z: -2 });
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
        displayName: node.metadata.displayName as string,
        level: node.metadata.level as number,
        portraitIndex: node.metadata.portraitIndex as number,
        portraitReady: node.metadata.portraitReady as boolean,
        role: node.metadata.role as string,
        phase: node.metadata.phase as string,
        status: node.metadata.simulationStatus as string,
        gateSide: node.metadata.gateSide as string,
        shoppingReason: node.metadata.shoppingReason as string|undefined,
        shoppingPhase: node.metadata.shoppingPhase as string|undefined,
        shoppingTargetSlot: node.metadata.shoppingTargetSlot as string|null|undefined,
        shoppingTargets: node.metadata.shoppingTargets as string[]|undefined,
        cartUnits: node.metadata.cartUnits as number|undefined,
        cartTotal: node.metadata.cartTotal as number|undefined,
        cartPaid: node.metadata.cartPaid as boolean|undefined,
        cartItemIds: node.metadata.cartItemIds as string[]|undefined,
        carriedMeshes: node.metadata.carriedMeshes as number|undefined,
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
    saleTags: scene.meshes.filter(({ name }) => name.startsWith("npc-sale-")).map(({ name }) => name),
    gateY: scene.getMeshByName("level-4-barrier")?.position.y,
    gate6Y: scene.getMeshByName("level-6-barrier")?.position.y,
    playerBarrierSolid: scene.getMeshByName("level-4-player-barrier")?.checkCollisions ?? false,
    playerBarrier6Solid: scene.getMeshByName("level-6-player-barrier")?.checkCollisions ?? false,
    playerBarrier6Hidden: scene.getMeshByName("level-6-player-barrier")?.visibility === 0,
  };
}

/** Called via Vite's module URL, avoiding bare-specifier imports from page.evaluate. */
export function inspectBossArena() {
  const scene = Engine.LastCreatedScene!;
  const hero = scene.transformNodes.find(node => node.name.startsWith("arena-hero-"));
  const boss = scene.transformNodes.find(node => node.name === "arena-boss-troll");
  return {
    camera: {
      x: scene.activeCamera!.position.x,
      y: scene.activeCamera!.position.y,
      z: scene.activeCamera!.position.z,
    },
    boss: scene.transformNodes.some(node => node.name === "arena-boss-troll"),
    hero: scene.transformNodes.some(node => node.name.startsWith("arena-hero-")),
    lava: !!scene.getMeshByName("lethal-lava"),
    ring: !!scene.getMeshByName("lava-ring"),
    spikes: scene.meshes.filter(mesh => mesh.name.startsWith("cavern-stalagmite-")).length,
    heroPosition: hero ? { x: hero.position.x, z: hero.position.z } : null,
    bossPosition: boss ? { x: boss.position.x, z: boss.position.z } : null,
    heroPhase: hero?.metadata?.combatPhase as string | undefined,
    heroArmRotation: scene.transformNodes.find(node => node.name === `${hero?.name}-arm-1`)?.rotation.z,
    heroSwordEnabled: scene.getMeshByName(`${hero?.name}-equipped-iron-sword`)?.isEnabled() ?? false,
    bossPhase: boss?.metadata?.combatPhase as string | undefined,
    heroDistanceTraveled: hero?.metadata?.distanceTraveled as number | undefined,
    dodgeCount: boss?.metadata?.dodgeCount as number | undefined,
    parryCount: boss?.metadata?.parryCount as number | undefined,
    missedHits: boss?.metadata?.missedHits as number | undefined,
  };
}

/** Shared scene-agnostic visual identity inspection for browser tests. */
export function inspectHeroModels() {
  const scene = Engine.LastCreatedScene!;
  return scene.transformNodes.filter(node =>
    node.name.startsWith("npc-adventurer-") ||
    node.name.startsWith("arena-hero-adventurer-")).filter(node =>
      node.metadata?.appearanceKey).map(node => {
      const sword = scene.getMeshByName(`${node.name}-equipped-iron-sword`);
      const vest = scene.getMeshByName(`${node.name}-equipped-leather-vest`);
      return {
        rootName: node.name,
        id: node.metadata.adventurerId as string,
        role: node.metadata.role as string,
        appearanceKey: node.metadata.appearanceKey as string,
        skinColor: node.metadata.skinColor as string,
        hairColor: node.metadata.hairColor as string,
        weapon: node.metadata.weapon as string | null,
        armor: node.metadata.armor as string | null,
        swordVisible: !!sword && sword.isEnabled() && sword.visibility > 0,
        vestVisible: !!vest && vest.isEnabled() && vest.visibility > 0,
      };
    });
}

/** Inspection of the isolated read-only Babylon dungeon-layout preview. */
export function inspectDungeonLayout() {
  const scene=Engine.LastCreatedScene!;
  return {
    wallCount:scene.meshes.filter(m=>m.name.startsWith("dungeon-wall-")).length,
    floorCount:scene.meshes.filter(m=>m.name.startsWith("dungeon-corridor-tile-") ||
      m.name.startsWith("dungeon-room-tile-")).length,
    monsters:scene.meshes.filter(m=>m.name.startsWith("dungeon-monster-")).length,
    treasures:scene.meshes.filter(m=>m.name.startsWith("dungeon-treasure-")).length,
    traps:scene.meshes.filter(m=>m.name.startsWith("dungeon-trap-")).length,
    heroReference:scene.transformNodes.some(node=>node.name.startsWith("dungeon-reference-")),
    camera:{x:scene.activeCamera?.position.x??0,y:scene.activeCamera?.position.y??0,
      z:scene.activeCamera?.position.z??0},
    mapWidth:document.querySelector<HTMLCanvasElement>("#dungeon-minimap")?.width??0,
  };
}


/** Inspect actual Level 7 playback meshes without invoking any simulator. */
export function inspectDungeonPlayback() {
  const scene=Engine.LastCreatedScene!;
  const hero=scene.transformNodes.find(node=>node.name.startsWith("dungeon-replay-")&&
    node.metadata?.replayOnly);
  return {
    replayHero:!!hero,
    heroId:hero?.metadata?.adventurerId as string|undefined,
    appearanceKey:hero?.metadata?.appearanceKey as string|undefined,
    weapon:hero?.metadata?.weapon as string|null|undefined,
    phase:hero?.metadata?.combatPhase as string|undefined,
    heroPosition:hero?{x:hero.position.x,z:hero.position.z}:null,
    hiddenTiles:scene.meshes.filter(mesh=>
      (mesh.name.startsWith("dungeon-wall-")||
       mesh.name.startsWith("dungeon-corridor-tile-")||
       mesh.name.startsWith("dungeon-room-tile-"))&&!mesh.isVisible).length,
    shownTiles:scene.meshes.filter(mesh=>
      (mesh.name.startsWith("dungeon-wall-")||
       mesh.name.startsWith("dungeon-corridor-tile-")||
       mesh.name.startsWith("dungeon-room-tile-"))&&mesh.isVisible).length,
    hiddenTorches:scene.meshes.filter(mesh=>
      mesh.name.startsWith("dungeon-torch-")&&!mesh.isEnabled()).length,
    disabledTorchLights:scene.lights.filter(light=>
      light.name.startsWith("dungeon-torchlight-")&&!light.isEnabled()).length,
    combatEnemyVisible:scene.getMeshByName("dungeon-combat-creature")?.isEnabled()??false,
  };
}

/** Browser regression probe for fixtures and Shift movement. */
export function inspectShopPolish() {
  const scene=Engine.LastCreatedScene!;
  const camera=scene.activeCamera as UniversalCamera;
  return {
    speed:camera.speed,
    shelves:[scene.getMeshByName("shelf-1-back")?.getAbsolutePosition().x,
      scene.getMeshByName("shelf-2-back")?.getAbsolutePosition().x],
    torchFlames:[0,1,2].map(i=>{
      const light=scene.getLightByName("torch-"+i);
      const flame=scene.getMeshByName("torch-flame-"+i);
      const bracket=scene.getMeshByName("torch-bracket-"+i);
      return {light:!!light,flame:!!flame,bracket:!!bracket,
        x:flame?.position.x,z:flame?.position.z};
    }),
  };
}

/** Test-only world-matrix inspection of the persisted furniture transforms. */
export function inspectShopPlacement() {
  const scene=Engine.LastCreatedScene!;
  const data=(id:"shelf-1"|"shelf-2")=>{
    const root=scene.getTransformNodeByName(id+"-root");
    const back=scene.getMeshByName(id+"-back");
    const slot=scene.getMeshByName(id+"-slot-2");
    const item=scene.getMeshByName(id+"-slot-2-item-0");
    root?.computeWorldMatrix(true);
    back?.computeWorldMatrix(true);
    slot?.computeWorldMatrix(true);
    item?.computeWorldMatrix(true);
    return {
      root:root?{x:root.position.x,z:root.position.z,rotation:root.rotation.y}:null,
      back:back?{x:back.getAbsolutePosition().x,z:back.getAbsolutePosition().z}:null,
      slot:slot?{x:slot.getAbsolutePosition().x,z:slot.getAbsolutePosition().z}:null,
      item:item?{x:item.getAbsolutePosition().x,z:item.getAbsolutePosition().z}:null,
      guideEnabled:scene.getMeshByName(id+"-placement-preview")?.isEnabled()??false,
    };
  };
  return {left:data("shelf-1"),right:data("shelf-2")};
}

/** Integration probe: physical cashier meshes must follow editor previews and saves. */
export function inspectCheckoutPlacement() {
  const scene=Engine.LastCreatedScene!;
  const read=(name:string)=>{
    const mesh=scene.getMeshByName(name);
    mesh?.computeWorldMatrix(true);
    return mesh?{x:mesh.position.x,z:mesh.position.z,rotation:mesh.rotation.y,
      collides:mesh.checkCollisions,enabled:mesh.isEnabled()}:null;
  };
  return {counter:read("checkout-counter"),top:read("counter-top"),
    register:read("cash-register"),guide:read("counter-placement-preview")};
}

/** Browser-friendly scene probe for Galvik's new sleeping room. */
export function inspectBedroom() {
  const scene=Engine.LastCreatedScene!;
  const bed=scene.getMeshByName("galvik-bed");
  return {
    exists:!!bed,
    collides:bed?.checkCollisions??false,
    rearWall:!!scene.getMeshByName("bedroom-rear-wall"),
    oldWall:!!scene.getMeshByName("front-middle-wall"),
  };
}

/** Dedicated structural and dressing probe. Decorative meshes must be inert. */
export function inspectBedroomAtmosphere() {
  const scene=Engine.LastCreatedScene!;
  const pick=(name:string)=>scene.getMeshByName(name);
  const decor=scene.meshes.filter(mesh=>
    mesh.name.startsWith("bedroom-rock-rib-")||
    mesh.name.startsWith("bedroom-rear-rock-")||
    mesh.name.startsWith("bedroom-fallen-stone-")||
    mesh.name.startsWith("bedroom-flagstone-"));
  const bed=pick("galvik-bed");
  const candle=scene.getLightByName("galvik-bed-candle");
  const torch=scene.getLightByName("bedroom-door-torch-light");
  return {
    bed:{x:bed?.position.x,z:bed?.position.z,collides:bed?.checkCollisions,
      pickable:bed?.isPickable,kind:bed?.metadata?.kind},
    entryClear:!pick("front-middle-wall"),
    entrancePiers:["bedroom-door-left-pier","bedroom-door-right-pier"]
      .every(name=>pick(name)?.checkCollisions),
    wallSolid:["bedroom-left-wall","bedroom-right-wall","bedroom-rear-wall"]
      .every(name=>pick(name)?.checkCollisions),
    decorCount:decor.length,
    decorInert:decor.every(mesh=>!mesh.checkCollisions&&!mesh.isPickable),
    furniture:["bedroom-desk","bedroom-account-book","bedroom-inkwell",
      "bed-chest-lid","bed-blanket-fold","bedroom-tally-board",
      "bedroom-debt-note","bed-candle-flame","bedroom-torch-flame"]
      .every(name=>!!pick(name)),
    practicalLighting:!!candle&&!!torch,
  };
}

/** Check material reuse on actual gameplay meshes without adding a production debug API. */
export function inspectDungeonSurfaces() {
  const scene=Engine.LastCreatedScene!;
  const at=(name:string)=>scene.getMeshByName(name);
  const material=(name:string)=>at(name)?.material;
  const textured=(name:string)=>!!(material(name) &&
    "diffuseTexture" in material(name)! && (material(name) as {diffuseTexture?:{isReady():boolean}}).diffuseTexture?.isReady());
  const props=["stone-floor","stone-ceiling","left-wall","right-wall",
    "checkout-counter","counter-top","shelf-1-back","shelf-2-plank",
    "bedroom-left-wall","bedroom-flagstone-0","bedroom-door-lintel",
    "bed-frame","bedroom-desk","bedroom-floor-skin"];
  return {
    floorUVMax:(()=>{
      const uv=at("stone-floor")?.getVerticesData("uv")??[];
      return {u:Math.max(...uv.filter((_,i)=>i%2===0)),
        v:Math.max(...uv.filter((_,i)=>i%2===1))};
    })(),
    textureCount:scene.textures.filter(t=>t.name.startsWith("dungeon-")&&t.name.endsWith("-diffuse")).length,
    surfaceCount:props.filter(textured).length,
    requestedCount:props.length,
    sharedWall:material("left-wall")===material("bedroom-left-wall"),
    sharedTimber:material("shelf-1-back")===material("bed-frame"),
    sharedFloor:material("stone-floor")===material("bedroom-floor-skin"),
    semanticShelf:(at("shelf-1-slot-1")?.metadata?.kind as string|undefined),
    solidWalls:["left-wall","right-wall","bedroom-left-wall"]
      .every(name=>at(name)?.checkCollisions),
    idleDecor:scene.meshes.filter(m=>m.name.startsWith("bedroom-flagstone-"))
      .every(m=>!m.checkCollisions&&!m.isPickable),
  };
}
