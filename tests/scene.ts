import { Engine } from "@babylonjs/core/Engines/engine";
import type { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {surfaceFromMesh} from "../src/game/furnitureBlueprint.ts";

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

/** E2E camera position for interacting with a real stationary NPC, no UI hooks. */
export function aimAtBeggingVisitor(heroId:string):void {
  const scene=Engine.LastCreatedScene!;
  const node=scene.transformNodes.find(candidate=>
    candidate.metadata?.adventurerId===heroId);
  if(!node)throw new Error("Cannot find the requested visitor mesh.");
  const camera=scene.activeCamera as UniversalCamera;
  camera.position.set(node.position.x+1.25,1.7,node.position.z+0.8);
  camera.setTarget(new Vector3(node.position.x,1.5,node.position.z));
  camera.cameraDirection.setAll(0);
  camera.cameraRotation.setAll(0);
}

/** Center the *overhead* customer-bark position in a genuine FPS camera.
 * Normal credit conversations use the separate lower torso aim helper. */
export function aimAtCustomerBark(heroId:string):void {
  const scene=Engine.LastCreatedScene!;
  const node=scene.transformNodes.find(candidate=>
    candidate.metadata?.adventurerId===heroId);
  if(!node)throw new Error("Cannot find customer for speech-bubble camera.");
  const camera=scene.activeCamera as UniversalCamera;
  camera.position.set(node.position.x+2.6,1.7,node.position.z+2.8);
  camera.setTarget(new Vector3(node.position.x,node.position.y+3.25,node.position.z));
  camera.cameraDirection.setAll(0);
  camera.cameraRotation.setAll(0);
}

/** Select the actual cash register using the FPS crosshair before P. */
export function aimAtFurniture(name:string,distance=3.2):void {
  const scene=Engine.LastCreatedScene!;
  const camera=scene.activeCamera as UniversalCamera;
  const mesh=scene.getMeshByName(name);
  if(!mesh)throw new Error("Missing furniture: "+name);
  mesh.computeWorldMatrix(true);
  const target=mesh.getAbsolutePosition();
  // Always approach the register from its physical FRONT, not from a
  // fixed -Z camera location that would be behind the back-room wall
  // once a new-game counter is placed in the corner.
  if(name==="cash-register"){
    const facing=mesh.rotation.y;
    const reach=Math.min(distance,2.4);
    camera.position.set(target.x-Math.sin(facing)*reach,target.y+0.25,
      target.z-Math.cos(facing)*reach);
  }else camera.position.set(target.x,target.y+0.25,target.z-distance);
  camera.setTarget(target);
  camera.cameraDirection.setAll(0);
  camera.cameraRotation.setAll(0);
}

export function aimAtBlueprintFloor():void {
  const scene=Engine.LastCreatedScene!;
  const camera=scene.activeCamera as UniversalCamera;
  camera.position.set(0,1.7,-4.6);
  camera.setTarget(new Vector3(0,0,0));
  camera.cameraDirection.setAll(0);
  camera.cameraRotation.setAll(0);
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
/** The account book must be reachable without triggering Galvik's bed hold-E. */
export function aimAtDebtBook():void {
  const scene=Engine.LastCreatedScene!;
  const camera=scene.activeCamera as UniversalCamera;
  const book=scene.getMeshByName("bedroom-account-pages")!;
  camera.position.set(-1.7,1.7,-8.0);
  camera.setTarget(book.getAbsolutePosition());
  camera.cameraDirection.setAll(0);
  camera.cameraRotation.setAll(0);
}

export function aimAtBedroomProp(name:string) {
  inspectPlayer({ x: 0.6, y: 1.7, z: -8.95 });
  const scene = Engine.LastCreatedScene!;
  (scene.activeCamera as UniversalCamera).setTarget(scene.getMeshByName(name)!.getAbsolutePosition());
}

export function inspectBedroomSightlines() {
  const scene = Engine.LastCreatedScene!;
  const at=(name:string)=>scene.getMeshByName(name)!;
  return {
    rosterX:at("adventurer-roster-board").getAbsolutePosition().x,
    rightmostFrameX:at("roster-frame-right").getAbsolutePosition().x,
    boardClearOfWall:(()=>{
      const board=at("adventurer-roster-board");
      const leftFrame=at("roster-frame-left");
      const rightFrame=at("roster-frame-right");
      const bedroomWall=at("bedroom-left-wall");
      const mainWall=at("front-left-wall");
      for(const mesh of [board,leftFrame,rightFrame,bedroomWall,mainWall])
        mesh.computeWorldMatrix(true);
      const boardBounds=board.getBoundingInfo().boundingBox;
      const leftBounds=leftFrame.getBoundingInfo().boundingBox;
      const rightBounds=rightFrame.getBoundingInfo().boundingBox;
      const sideBounds=bedroomWall.getBoundingInfo().boundingBox;
      const wallBounds=mainWall.getBoundingInfo().boundingBox;
      return boardBounds.minimumWorld.x > wallBounds.minimumWorld.x+0.1 &&
        boardBounds.maximumWorld.x < sideBounds.minimumWorld.x-0.1 &&
        leftBounds.minimumWorld.x>wallBounds.minimumWorld.x+0.1 &&
        rightBounds.maximumWorld.x<sideBounds.minimumWorld.x-0.1 &&
        boardBounds.minimumWorld.z>sideBounds.maximumWorld.z+0.15;
    })(),
    signYaw:at("bedroom-sign").rotation.y,
    signZ:at("bedroom-sign").position.z,
    furnitureHulls:["chest","desk","candle-stool"].map(id=>{
      const mesh=at("bedroom-furniture-collider-"+id);
      return {id,exists:!!mesh,solid:mesh.checkCollisions,
        invisible:mesh.visibility===0,unpickable:!mesh.isPickable,
        width:mesh.getBoundingInfo().boundingBox.extendSize.x*2};
    }),
    wallLeftWidth:at("bedroom-left-wall").getBoundingInfo().boundingBox.extendSizeWorld.x*2,
    wallRightWidth:at("bedroom-right-wall").getBoundingInfo().boundingBox.extendSizeWorld.x*2,
    jambsSolid:at("bedroom-door-jamb--1").checkCollisions&&
      at("bedroom-door-jamb-1").checkCollisions,
    lintelSolid:at("bedroom-door-lintel").checkCollisions,
    noteZ:at("bedroom-debt-note").position.z,
    rearRockZ:at("bedroom-rear-rock-7").position.z,
  };
}

/** A loaded save can show Day 1 before rebuilt shelf meshes become pickable.
 * Wait for the actual interaction surface, not just the GLB asset promise. */
export async function waitForShelfSlotMesh(
  name="shelf-1-slot-1",timeoutMs=6000,
):Promise<void> {
  const deadline=performance.now()+timeoutMs;
  while(performance.now()<deadline){
    if(Engine.LastCreatedScene?.getMeshByName(name))return;
    await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
  }
  throw Error("Physical shelf slot never appeared: "+name);
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
        roamLeg: node.metadata.roamLeg as number|undefined,
        movementMode: node.metadata.movementMode as string|undefined,
        shopGesture: node.metadata.shopGesture as string|undefined,
        confirmedPickups: node.metadata.confirmedPickups as number|undefined,
        confirmedPayments: node.metadata.confirmedPayments as number|undefined,
        // Observe actual Babylon transforms, not just a metadata claim.
        headPitch: scene.getTransformNodeByName(node.name+"-head-pivot")?.rotation.x??0,
        leftArmPitch: scene.getTransformNodeByName(node.name+"-arm--1")?.rotation.x??0,
        rightArmPitch: scene.getTransformNodeByName(node.name+"-arm-1")?.rotation.x??0,
        wantedItemId: node.metadata.wantedItemId as string|null|undefined,
        restockRemaining: node.metadata.restockRemaining as number|null|undefined,
        gateYield: node.metadata.gateYield as boolean|undefined,
        blockedSeconds: node.metadata.blockedSeconds as number|undefined,
        softPassing: node.metadata.softPassing as boolean|undefined,
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
    trollVisualId: boss?.metadata?.visualId as string | undefined,
    sculptStatus: boss?.metadata?.sculptStatus as string | undefined,
    sculptSourceUrl: boss?.metadata?.sculptSourceUrl as string | undefined,
    sculptedPartCount: boss?.getChildMeshes(false).filter(
      mesh=>mesh.metadata?.sculpted===true).length ?? 0,
    trollMeshCount: boss?.metadata?.geometryCount as number | undefined,
    trollPhase: boss?.metadata?.animationPhase as string | undefined,
    trollAnimationClock: boss?.metadata?.animationClock as number | undefined,
    trollHammerRotation: boss?.metadata?.hammerSwing as number | undefined,
    trollDeathProgress: boss?.metadata?.deathProgress as number | undefined,
    realTroll3d: scene.getMeshByName("troll-head")?.getTotalVertices()??0,
    realMaul3d: scene.getMeshByName("troll-maul-stone-core")?.getTotalVertices()??0,
    canisterCount: scene.meshes.filter(m=>m.name.startsWith("troll-canister-body-")).length,
    mineWalls: scene.meshes.filter(m=>m.name.startsWith("troll-cavern-wall-")).length,
    armRig: scene.getMeshByName("troll-upper-arm-1")?.position.asArray(),
    hammerSocket: scene.getTransformNodeByName("troll-rig-hammer")?.rotation.z,
    impactVisibility: scene.getMeshByName("troll-maul-impact-dust")?.visibility,
  };
}

/** Visual-only death pose probe inside a training-preview scene.
 * No GameStore or combat motor APIs are invoked or changed. */
export async function inspectCaveTrollDeathPose():Promise<{
  elapsed:number;fall:number;weapon:number;vertices:number;
}> {
  const scene=Engine.LastCreatedScene!;
  const {createCaveTrollVisual}=await import("../src/game/caveTrollVisual.ts");
  const model=createCaveTrollVisual(scene);
  for(let i=0;i<22;i++)model.animate({
    phase:"dead",phaseAge:i*.10,slam:true,time:i*.1,
    moved:0,delta:.10,hp:0,maxHp:145,
  });
  const result={
    elapsed:model.root.metadata.animationClock as number,
    fall:model.root.metadata.deathProgress as number,
    weapon:model.root.metadata.hammerSwing as number,
    vertices:scene.getMeshByName("troll-head")?.getTotalVertices()??0,
  };
  model.root.dispose();
  return result;
}

/** Isolated rig regression: meters walked drive planted-to-lifted feet;
 * the real attack phase must sweep the heavy hammer overhead into the strike.
 * No game store, replay or combat motor is mutated. */
export async function inspectCaveTrollMotion():Promise<{
  gaitMeters:number;footMinimum:number;footMaximum:number;
  windup:number;strike:number;liftAtWindup:number;
}> {
  const scene=Engine.LastCreatedScene!;
  const {createCaveTrollVisual}=await import("../src/game/caveTrollVisual.ts");
  const model=createCaveTrollVisual(scene);
  const foot=model.root.getChildMeshes(false)
    .find(mesh=>mesh.name==="troll-boulder-foot-1");
  if(!foot)throw Error("Cave Troll has no animated foot.");
  const sample:number[]=[];
  for(let i=0;i<40;i++){
    model.animate({phase:"chase",phaseAge:0,slam:false,time:i*.05,
      moved:.13,delta:.05,hp:145,maxHp:145});
    sample.push(foot.position.y);
  }
  const gaitMeters=model.root.metadata.gaitDistance as number;
  for(let i=0;i<16;i++)model.animate({phase:"windup",phaseAge:i*.09,
    slam:true,time:2+i*.09,moved:0,delta:.09,hp:145,maxHp:145});
  const windup=model.root.metadata.hammerSwing as number;
  const liftAtWindup=model.root.metadata.hammerLift as number;
  for(let i=0;i<7;i++)model.animate({phase:"strike",phaseAge:i*.034,
    slam:true,time:4+i*.034,moved:0,delta:.034,hp:145,maxHp:145});
  const strike=model.root.metadata.hammerSwing as number;
  model.root.dispose();
  return {gaitMeters,footMinimum:Math.min(...sample),
    footMaximum:Math.max(...sample),windup,strike,liftAtWindup};
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
/** Read a genuinely instantiated extra shelf from the Babylon scene. */
export function inspectAdditionalShelf(id:string){
  const scene=Engine.LastCreatedScene!;
  const root=scene.getTransformNodeByName(id+"-root");
  const slots=scene.meshes.filter(mesh=>mesh.metadata?.kind==="shelf-slot"&&
    typeof mesh.metadata.slotId==="string"&&
    mesh.metadata.slotId.startsWith(id+"-slot-"));
  return {x:root?.position.x??null,slotCount:slots.length,
    allPickable:slots.every(mesh=>mesh.isPickable&&mesh.checkCollisions)};
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
    bed:{x:bed?.getAbsolutePosition().x,z:bed?.getAbsolutePosition().z,collides:bed?.checkCollisions,
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
    "checkout-counter","counter-top",
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
    sharedTimber:material("checkout-counter")===material("bed-frame"),
    sharedFloor:material("stone-floor")===material("bedroom-floor-skin"),
    semanticShelf:(at("shelf-1-slot-1")?.metadata?.kind as string|undefined),
    hasPrebuiltShelf:scene.meshes.some(mesh=>/^shelf-\\d+-back$/.test(mesh.name)),
    solidWalls:["left-wall","right-wall","bedroom-left-wall"]
      .every(name=>at(name)?.checkCollisions),
    idleDecor:scene.meshes.filter(m=>m.name.startsWith("bedroom-flagstone-"))
      .every(m=>!m.checkCollisions&&!m.isPickable),
  };
}

/** Deterministic visual-only placement for the observed day-3 reversal jam. */
export function stageReturningNpcVisualsInsideShop():void {
  const scene=Engine.LastCreatedScene!;
  for(const [id,x,z] of [
    ["adventurer-1",-0.6,1],["adventurer-2",-5,-0.37],
  ] as const){
    const node=scene.transformNodes.find(n=>n.metadata?.adventurerId===id);
    if(!node)throw new Error("Missing test NPC "+id);
    node.position.set(x,0,z);
  }
}

/** Aim at a real pickable rock face, not at an artificially injected UI hook. */
export function aimAtLevel5Rock(x:number,z:number):string {
  const scene=Engine.LastCreatedScene!;
  const mesh=scene.meshes.find(mesh=>
    mesh.metadata?.level5MineCell?.x===x&&
    mesh.metadata?.level5MineCell?.z===z);
  if(!mesh)throw new Error(`No exposed mineable rock at ${x},${z}`);
  const camera=scene.activeCamera as UniversalCamera;
  camera.position.set(x>0?5.65:-5.65,1.7,z);
  camera.setTarget(new Vector3(mesh.position.x,1.7,mesh.position.z));
  camera.cameraDirection.setAll(0);
  camera.cameraRotation.setAll(0);
  return mesh.name;
}

/** Read the visible mounted board's world transform after a reload. */
export function inspectMountedRosterBoardX():number|null {
  const board=Engine.LastCreatedScene?.getMeshByName("adventurer-roster-board");
  if(!board)return null;
  board.computeWorldMatrix(true);
  return Math.round(board.getAbsolutePosition().x*100)/100;
}

/** Aim the contextual P editor from an actually mined cell toward the
 * next unmined rock wall. Never teleport the board or fake a wall surface.
 */
export function aimAtExcavatedBoardWall(nextX:number,z:number):string{
  const scene=Engine.LastCreatedScene!;
  const face=scene.meshes.find(mesh=>
    mesh.metadata?.level5MineCell?.x===nextX&&
    mesh.metadata?.level5MineCell?.z===z&&
    Math.abs(mesh.position.x-(nextX-.5))<.05);
  if(!face)throw new Error("Missing exposed rock support "+nextX+","+z);
  const camera=scene.activeCamera as UniversalCamera;
  camera.position.set(nextX-1.4,1.7,z);
  camera.setTarget(new Vector3(face.position.x,1.7,face.position.z));
  camera.cameraDirection.setAll(0);
  camera.cameraRotation.setAll(0);
  const picked=scene.pickWithRay(camera.getForwardRay(48),
    mesh=>mesh.isEnabled()&&mesh.isVisible&&mesh.isPickable&&
      surfaceFromMesh(mesh.name)==="rock-wall");
  if(picked?.pickedMesh!==face)
    throw new Error("Editor aimed at "+
      (picked?.pickedMesh?.name??"nothing")+" instead of "+face.name);
  return face.name;
}

/** Wall and floor observations from the rendered Babylon scene. */
export function inspectLevel5Rock(x:number,z:number) {
  const scene=Engine.LastCreatedScene!;
  return {
    floor:!!scene.getMeshByName(`excavated-floor-${x},${z}`),
    clickableRock:scene.meshes.some(mesh=>
      mesh.metadata?.level5MineCell?.x===x&&
      mesh.metadata?.level5MineCell?.z===z),
    ceiling:!!scene.getMeshByName(`excavated-ceiling-${x},${z}`),
  };
}

/** Browser probe uses the rendered first-person meshes, not private game hooks. */
export function inspectGalvikBody(){
  const scene=Engine.LastCreatedScene!;
  const hands=[-1,1].map(side=>scene.getMeshByName(`galvik-hand-${side}`));
  const boots=[-1,1].map(side=>scene.getMeshByName(`galvik-boot-${side}`));
  const arms=[-1,1].map(side=>scene.getTransformNodeByName(`galvik-arm-pivot-${side}`));
  const legs=[-1,1].map(side=>scene.getTransformNodeByName(`galvik-leg-pivot-${side}`));
  return {
    hands:hands.filter(Boolean).length,boots:boots.filter(Boolean).length,
    allUnpickable:[...hands,...boots].every(mesh=>mesh&&!mesh.isPickable&&!mesh.checkCollisions),
    pickaxeVisible:!!scene.getMeshByName("galvik-pick-handle")?.isEnabled(),
    bodyVisible:!!scene.getTransformNodeByName("galvik-grounded-body")?.isEnabled(),
    leftLegAngle:legs[0]?.rotation.x??null,
    rightLegAngle:legs[1]?.rotation.x??null,
    leftArmAngle:arms[0]?.rotation.x??null,
    bodyHeight:scene.getTransformNodeByName("galvik-grounded-body")?.position.y??null,
    cameraHeight:scene.activeCamera?.position.y??null,
  };
}

/** E2E-only camera target inside the private room, aimed at real floor geometry. */
export function aimAtBedroomPlacement(x:number,z:number):void {
  const scene=Engine.LastCreatedScene!;
  const camera=scene.activeCamera as UniversalCamera;
  camera.position.set(-0.8,1.7,-8.0);
  camera.setTarget(new Vector3(x,0.018,z));
  camera.cameraDirection.setAll(0);
  camera.cameraRotation.setAll(0);
}

export function inspectModularBedroom(){
  const scene=Engine.LastCreatedScene!;
  const coords=(name:string)=>{
    const node=scene.getMeshByName(name);
    if(!node)throw Error("Missing bedroom mesh "+name);
    node.computeWorldMatrix(true);
    const p=node.getAbsolutePosition();
    return {x:p.x,z:p.z};
  };
  const root=scene.getTransformNodeByName("bedroom-module-candle");
  const light=scene.getLightByName("galvik-bed-candle");
  return {
    desk:coords("bedroom-desk"),
    book:coords("bedroom-account-book"),
    deskCollider:coords("bedroom-furniture-collider-desk"),
    chest:coords("galvik-bed-chest"),
    chestCollider:coords("bedroom-furniture-collider-chest"),
    candle:coords("bed-candle"),
    candleRoot:root?{x:root.position.x,z:root.position.z}:null,
    candleLightParent:light?.parent?.name??null,
  };
}

/** Drive the real FPS crosshair rather than synthesizing UI clicks. */
export function aimAtMainShopWall(x:number,z:number):void{
  const scene=Engine.LastCreatedScene!;
  const camera=scene.activeCamera as UniversalCamera;
  camera.position.set(x,1.7,z+2.5);
  camera.setTarget(new Vector3(x,1.65,z));
  camera.cameraDirection.setAll(0);
  camera.cameraRotation.setAll(0);
}
export function aimAtRelocatedRosterBoard():void{
  const scene=Engine.LastCreatedScene!;
  const camera=scene.activeCamera as UniversalCamera;
  const mesh=scene.getMeshByName("adventurer-roster-board")!;
  mesh.computeWorldMatrix(true);
  const pos=mesh.getAbsolutePosition();
  camera.position.set(pos.x,1.7,pos.z+2.5);
  camera.setTarget(pos);
  camera.cameraDirection.setAll(0);
  camera.cameraRotation.setAll(0);
}
export function inspectMovedBedAndBoard(){
  const scene=Engine.LastCreatedScene!;
  const at=(name:string)=>{
    const mesh=scene.getMeshByName(name)!;
    mesh.computeWorldMatrix(true);
    const pos=mesh.getAbsolutePosition();
    return {x:pos.x,z:pos.z,parent:mesh.parent?.name??null};
  };
  return {
    mattress:at("galvik-bed"),frame:at("bed-frame"),
    pillow:at("bed-pillow"),roster:at("adventurer-roster-board"),
    rosterFrame:at("roster-frame-right"),
  };
}

/** The same material and pickability invariant used by the FPS blueprint. */
export function inspectMinedFloorSurface(cell:string){
  const scene=Engine.LastCreatedScene!;
  const floor=scene.getMeshByName("excavated-floor-"+cell);
  const original=scene.getMeshByName("stone-floor");
  return {
    pickable:floor?.isPickable===true,
    sameMaterial:!!floor&&floor.material===original?.material,
    kind:floor?.name.startsWith("excavated-floor-")?"floor":null,
  };
}

/** U must not alter the original full-wall meshes until this side is mined. */
export function inspectMiningWallVisuals(){
  const scene=Engine.LastCreatedScene!;
  const left=scene.getMeshByName("left-wall");
  const right=scene.getMeshByName("right-wall");
  const targets=scene.meshes.filter(m=>m.metadata?.level5MineCell);
  const slice=scene.meshes.find(m=>m.name.startsWith("excavation-rock-face-")&&
    Math.abs(m.position.x-7.5)<.01&&m.visibility>=1);
  const uv=slice?.getVerticesData("uv")??[];
  const normals=slice?.getVerticesData("normal")??[];
  const u:number[]=[];
  for(let i=0;i<normals.length/3;i++)
    if(normals[i*3]<-.9)u.push(uv[i*2]);
  return {
    leftVisible:left?.isEnabled()??false,
    rightVisible:right?.isEnabled()??false,
    leftMaterial:left?.material?.name??null,
    rightMaterial:right?.material?.name??null,
    transparentPickTargets:targets.filter(m=>m.visibility<.001&&m.isPickable).length,
    uvSpan:u.length?Math.max(...u)-Math.min(...u):null,
  };
}
/** Mesh identity is stable for unchanged excavated floor while a second
 * nearby rock cell is removed. Rebuilding the entire cave breaks this. */
export function level5MeshIdentity(name:string):number|null {
  return Engine.LastCreatedScene?.getMeshByName(name)?.uniqueId??null;
}

export function aimAtExcavatedBlueprintFloor(x:number,z:number):string{
  const scene=Engine.LastCreatedScene!;
  const name=`excavated-floor-${Math.floor(x+.5)},${Math.floor(z+.5)}`;
  const floor=scene.getMeshByName(name);
  if(!floor||!floor.isPickable)throw new Error("Mined floor cannot be targeted");
  const camera=scene.activeCamera as UniversalCamera;
  // Stay in the original cave and look straight down an excavated wing.
  // A fully mined passage keeps the ray physically clear while extending
  // >16m beyond the initial editor's reach (x=-4.8 to x=13).
  // Keep the camera clear of the two original wall-mounted shelves.
  camera.position.set(x>0?-4.8:4.8,1.7,z);
  camera.setTarget(new Vector3(x,0,z));
  camera.cameraDirection.setAll(0);
  camera.cameraRotation.setAll(0);
  const visible=scene.pickWithRay(camera.getForwardRay(48),
    mesh=>mesh.isEnabled()&&mesh.isVisible&&mesh.isPickable&&
      surfaceFromMesh(mesh.name)!==null);
  const hitName=visible?.pickedMesh?.name??"none";
  if(hitName!==name)
    throw new Error("Blueprint ray selected "+hitName+
      " instead of "+name+" from original showroom. Right wall enabled="+
      String(scene.getMeshByName("right-wall")?.isEnabled()));
  return name;
}

/** Point the real FPS ray at a standard front-wall segment for wall decor. */
export function aimAtPortraitWall(x=4.25):string{
  const scene=Engine.LastCreatedScene!;
  const camera=scene.activeCamera as UniversalCamera;
  camera.position.set(x,1.7,-4.6);
  camera.setTarget(new Vector3(x,2.15,-6.8));
  camera.cameraDirection.setAll(0);
  camera.cameraRotation.setAll(0);
  const hit=scene.pickWithRay(camera.getForwardRay(48),
    mesh=>mesh.isEnabled()&&mesh.isVisible&&mesh.isPickable&&
      surfaceFromMesh(mesh.name)==="front-wall");
  return hit?.pickedMesh?.name??"no-wall";
}

/** Target the real portrait canvas so contextual P uses ray picking. */
export function aimAtWallPortrait():void{
  const scene=Engine.LastCreatedScene!;
  const camera=scene.activeCamera as UniversalCamera;
  const canvas=scene.getMeshByName("galvik-portrait-canvas");
  if(!canvas||!canvas.isEnabled())throw new Error("Portrait not hanging");
  const target=canvas.getAbsolutePosition();
  camera.position.set(target.x,1.7,target.z+2);
  camera.setTarget(target);
  camera.cameraDirection.setAll(0);
  camera.cameraRotation.setAll(0);
}
export function inspectWallPortrait(){
  const scene=Engine.LastCreatedScene!;
  const root=scene.getTransformNodeByName("galvik-portrait-root");
  const plane=scene.getMeshByName("galvik-portrait-canvas");
  return {enabled:!!root?.isEnabled(),
    x:root?.position.x??null,z:root?.position.z??null,
    textured:plane?.material instanceof StandardMaterial&&
      !!plane.material.diffuseTexture?.isReady()};
}

/** Non-interactive 3D stock meshes must exist for every catalog item. */
export async function inspectPhysicalStockMeshes() {
  const {ITEMS}=await import("../src/game/economy.ts");
  const {getShopStockTemplates}=await import("../src/game/shopStockAssets.ts");
  const scene=Engine.LastCreatedScene!;
  const templates=await getShopStockTemplates(scene);
  return ITEMS.map(item=>{
    const model=templates.get(item.id)!;
    const data={
      itemId:item.id,
      sourceUrl:model.metadata?.sourceUrl as string | undefined,
      vertices:model.getTotalVertices(),
      triangles:model.getTotalIndices()/3,
      pickable:model.isPickable,
      collisions:model.checkCollisions,
      hasVertexPaint:!!model.getVerticesData("color")?.length,
      size:model.getBoundingInfo().boundingBox.extendSize.asArray(),
    };
    return data;
  });
}

/** Wait for six real GLB imports and Shop's pending stock refresh. */
export async function waitForShopStockAssets(){
  const scene=Engine.LastCreatedScene!;
  const {getShopStockTemplates}=await import("../src/game/shopStockAssets.ts");
  await getShopStockTemplates(scene);
  // Shop registered its refresh callback before the browser test did.
  await Promise.resolve();
}

/** Observe the actual rendered shelf inventory, not only a template factory.
 * This must agree with saved slot quantities. */
export function inspectRenderedShopStock(shelfId="shelf-1"){
  const scene=Engine.LastCreatedScene!;
  return [1,2,3,4].map(index=>{
    const slotId=shelfId+"-slot-"+index;
    const pad=scene.getMeshByName(slotId);
    const units=scene.meshes.filter(mesh=>
      mesh.name.startsWith(slotId+"-item-")&&
      /^\d+$/.test(mesh.name.slice((slotId+"-item-").length)));
    return {slotId,padPresent:!!pad,
      padPickable:pad?.isPickable??false,
      padCollision:pad?.checkCollisions??false,
      units:units.length,
      modelVertices:units.map(mesh=>mesh.getTotalVertices()),
      modelsPickable:units.some(mesh=>mesh.isPickable),
      modelsCollision:units.some(mesh=>mesh.checkCollisions),
      modelsColor:units.every(mesh=>!!mesh.getVerticesData("color")?.length)};
  });
}
