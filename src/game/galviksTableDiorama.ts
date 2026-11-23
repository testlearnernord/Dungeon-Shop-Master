import {Color3} from "@babylonjs/core/Maths/math.color";
import {Matrix,Vector3} from "@babylonjs/core/Maths/math.vector";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {PBRMaterial} from "@babylonjs/core/Materials/PBR/pbrMaterial";
import {HemisphericLight} from "@babylonjs/core/Lights/hemisphericLight";
import type {Material} from "@babylonjs/core/Materials/material";
import {ShaderMaterial} from "@babylonjs/core/Materials/shaderMaterial";
import {DynamicTexture} from "@babylonjs/core/Materials/Textures/dynamicTexture";
import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import {Mesh} from "@babylonjs/core/Meshes/mesh";
import type {LinesMesh} from "@babylonjs/core/Meshes/linesMesh";
import {TransformNode} from "@babylonjs/core/Meshes/transformNode";
import type {Scene} from "@babylonjs/core/scene";
import type {GameState} from "./gameState.ts";
import {tableDioramaFit,tableDioramaPosition,TABLE_DIORAMA_WELL,
  type TableDioramaFit} from "./tableDioramaGeometry.ts";
import {generateExpeditionLayout,dungeonShortestPath,
  type DungeonLayout,type DungeonPoint} from "./dungeonLayout.ts";
import {getDungeonSurfaces} from "./dungeonSurfaces.ts";
import {createDungeonFeaturePalette,createReadableDungeonChest,
  createReadableDungeonTrap} from "./dungeonFeatureProps.ts";
import {dungeonFloorStairways} from "./dungeonStairways.ts";
import {createDungeonStairwayProp} from "./dungeonStairProps.ts";
import {createGhoulCryptRoom} from "./ghoulCryptArt.ts";
import {createHeroVisual,setHeroVisualEquipment,
  type HeroVisual} from "./heroVisual.ts";
import {GhoulMapInstances,type GhoulMapSite}
  from "./dungeonGhoulMapInstances.ts";
import {createGhoulMapIconMaterial} from "./dungeonGhoulMapIcon.ts";
import {selectLiveFloorSpectatorFrame,LIVE_SPECTATOR_FLOORS,
  type LiveFloorSpectatorFrame} from "./liveFloorSpectator.ts";
import {liveFloorFeatureIdentity} from "./liveFloorFeatureIdentity.ts";
import type {DungeonMonsterState} from "./dungeonMonsterWorld.ts";
import {isObservedMonsterStep,monsterObservationStepProgress}
  from "./monsterObservationMotion.ts";
import type {SpatialDungeonFloor} from "./spatialDungeonExploration.ts";
import {TABLE_OBSERVATION_LOCAL_YAW,dungeonTileWorldCenter}
  from "./dungeonObservationOrientation.ts";

function material(scene:Scene,id:string,color:Color3):StandardMaterial{
  const mat=new StandardMaterial("table-diorama-"+id,scene);
  // Unlit Babylon StandardMaterial requires actual emissive colour.
  // Diffuse-only with disableLighting made every 3D miniature mesh black.
  mat.diffuseColor=Color3.Black();
  mat.emissiveColor=color;
  mat.specularColor=Color3.Black();
  mat.disableLighting=true;
  mat.backFaceCulling=false;
  return mat;
}

type Figure={readonly visual:HeroVisual;readonly ring:Mesh};

/**
 * Visual-only miniature of the SAME LIVE floor. Meshes belong to the shop's
 * Babylon Scene, not to the spectator's Scene. No RenderTarget/second camera,
 * gameplay tick, combat AI, pathfinding or mutation of the GameStore.
 *
 * Static masonry is batched via thin instances. Dynamic figures are updated
 * from selectLiveFloorSpectatorFrame, which also feeds the full LIVE viewer.
 */
export class GalviksTableDiorama{
  readonly root:TransformNode;
  private readonly floorText:DynamicTexture;
  private readonly floorPlaque:Mesh;
  private readonly tabletopLight:HemisphericLight;
  private readonly floorMat:ShaderMaterial;
  private readonly palette:{
    stoneA:PBRMaterial;stoneB:PBRMaterial;
    corridor:PBRMaterial;room:PBRMaterial;
    platform:StandardMaterial;entrance:StandardMaterial;
  };
  private floorRoot:TransformNode|null=null;
  private miniatureWorldRoot:TransformNode|null=null;
  private readonly featurePaint:ReturnType<typeof createDungeonFeaturePalette>;
  private readonly ghoulFallback:StandardMaterial;
  private ghoulMap:GhoulMapInstances|null=null;
  private floorArtMaterials:StandardMaterial[]=[];
  private actorRoot:TransformNode|null=null;
  private featureRoot:TransformNode|null=null;
  private readonly monsterAnchors=new Map<string,TransformNode>();
  /** Only presentation endpoints. Gameplay positions remain in the LIVE world. */
  private readonly priorMonsterTiles=new Map<string,Pick<DungeonMonsterState,
    "x"|"z"|"siteCycle"|"lastMoveTick">>();
  private readonly monsterTravel=new Map<string,{
    from:Vector3;to:Vector3;startedAt:number;
  }>();
  private monsterObservedTick:number|null=null;
  private monsterObservedDay:number|null=null;
  private readonly monsterHints=new Map<string,{mesh:LinesMesh;signature:string}>();
  private heroes=new Map<string,Figure>();
  private activeFloor:SpatialDungeonFloor|null=null;
  private activeSeed:number|null=null;
  private layout:DungeonLayout|null=null;
  private lastResolved="~";
  private lastUpdateAt=-Infinity;
  private modelReady=false;

  private readonly scene:Scene;

  constructor(scene:Scene,tableRoot:TransformNode){
    this.scene=scene;
    this.root=new TransformNode("cellar-table-diorama-root",scene);
    this.root.parent=tableRoot;
    // The table is approached from local +Z; the LIVE map is seen from -Z.
    // Align their observer frames independently of the movable table parent.
    this.root.rotation.y=TABLE_OBSERVATION_LOCAL_YAW;
    this.root.position.z=TABLE_DIORAMA_WELL.centerZ;
    this.root.setEnabled(false); // GLB must be loaded before placing geometry
    // Scoped light affects ONLY the miniaturized floor and wall meshes,
    // never the shopkeeper, customers, furniture or camera.
    this.tabletopLight=new HemisphericLight(
      "cellar-table-diorama-stone-light",new Vector3(.45,.86,-.35),scene);
    this.tabletopLight.intensity=.95;
    this.tabletopLight.setEnabled(false); // never illuminate the whole shop

    // Exactly the SAME authored procedural stone and flagstone textures
    // as the full LIVE Dungeon viewer. The shop scene already caches them.
    // A scoped angled light preserves their detail and miniature wall relief.
    const live=getDungeonSurfaces(scene);
    const scaledSurface=(name:string,source:StandardMaterial,tint:number)=>{
      // Babylon's PBR albedo path samples the same procedural stone image
      // used in the LIVE viewer. The table-only light reveals face relief
      // without a second authored art pipeline or illuminating the shop.
      const mat=new PBRMaterial("table-diorama-live-"+name,scene);
      mat.albedoTexture=source.diffuseTexture;
      mat.albedoColor=new Color3(tint,tint,tint);
      mat.metallic=0;
      mat.roughness=1;
      mat.unlit=false;
      mat.backFaceCulling=false;
      return mat;
    };
    this.palette={
      stoneA:scaledSurface("stone",live.stone,1.22),
      stoneB:scaledSurface("stone-accent",live.stoneAccent,1.15),
      corridor:scaledSurface("flagstones",live.floor,.49),
      room:scaledSurface("room-flagstones",live.floor,.63),
      platform:material(scene,"platform",new Color3(.11,.14,.15)),
      entrance:material(scene,"entrance",new Color3(.24,.96,.74)),
    };
    this.featurePaint=createDungeonFeaturePalette(scene);
    for(const mat of Object.values(this.featurePaint))
      mat.emissiveColor=mat.diffuseColor.scale(.26);
    this.ghoulFallback=createGhoulMapIconMaterial(scene);

    this.floorText=new DynamicTexture("cellar-table-floor-label-text",
      {width:512,height:128},scene,false);
    // Gold glyphs on a physically mounted sign. An explicit same-scene
    // shader makes the dynamic label readable independent of cellar lights.
    this.floorMat=new ShaderMaterial("table-diorama-floor-sign",scene,{
      vertexSource:`precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec2 vUV;
void main(void){
  // Correct the placard's mirrored U mapping while respecting the
  // DynamicTexture's already inverted V upload orientation.
  vUV=vec2(1.0-uv.x,uv.y);
  gl_Position=worldViewProjection*vec4(position,1.0);
}`,
      fragmentSource:`precision highp float;
varying vec2 vUV;
uniform sampler2D labelSampler;
void main(void){
  gl_FragColor=vec4(texture2D(labelSampler,vUV).rgb,1.0);
}`,
    },{attributes:["position","uv"],uniforms:["worldViewProjection"],
      samplers:["labelSampler"]});
    this.floorMat.backFaceCulling=false;
    this.floorMat.setTexture("labelSampler",this.floorText);
    const plaque=MeshBuilder.CreatePlane("cellar-table-floor-label",{
      width:.40,height:.085,
    },scene);
    // Sign belongs to the physical furniture, NOT the 180° rotated
    // observation root. Otherwise FLOOR 01 reads mirrored from Galvik. 
    plaque.parent=tableRoot;
    plaque.position.set(0,1.020,TABLE_DIORAMA_WELL.centerZ-.355);
    this.floorPlaque=plaque;
    plaque.isPickable=false;plaque.checkCollisions=false;
    plaque.material=this.floorMat;
    this.setFloorLabel(1);
  }

  setModelReady():void{
    this.modelReady=true;
    this.root.setEnabled(true);
  }

  /** Called only in normal shop mode. No spectator viewport is opened. */
  update(selected:number,state:GameState,shopCamera:Vector3):void{
    if(!this.modelReady||!state.liveDungeon.enabled)return;
    const table=state.cellarTable;
    if(shopCamera.y>-1||
      Math.hypot(shopCamera.x-table.x,shopCamera.z-table.z)>11)return;
    const floor=LIVE_SPECTATOR_FLOORS.includes(selected as SpatialDungeonFloor)
      ?selected as SpatialDungeonFloor:1;
    if(this.activeFloor!==floor||this.activeSeed!==state.seed){
      this.buildFloor(generateExpeditionLayout(state.seed,floor),floor);
      this.activeSeed=state.seed;
      this.activeFloor=floor;
      this.lastResolved="~";
      this.lastUpdateAt=-Infinity;
    }
    const now=performance.now();
    // Smooth authored movement runs at render cadence. Expensive route/fog
    // projection remains throttled and never advances the world simulation.
    this.advanceGhoulPresentation(now);
    // Presentation-only throttle. World time and autonomous heroes never pause.
    if(now-this.lastUpdateAt<160)return;
    this.lastUpdateAt=now;
    const frame=selectLiveFloorSpectatorFrame(state,floor);
    if(!frame)return;
    this.syncActors(frame);
    // Rebuild only when actual feature entities appear/disappear or cycle;
    // never on an ordinary position update (which moves an existing mesh).
    const featureIdentity=liveFloorFeatureIdentity(frame);
    if(featureIdentity!==this.lastResolved){
      this.lastResolved=featureIdentity;
      this.syncFeatures(frame);
    }
    this.syncMonsters(frame,now);
    this.advanceGhoulPresentation(now);
  }

  private setFloorLabel(floor:number):void{
    this.floorText.drawText("FLOOR "+String(floor).padStart(2,"0"),
      null,88,"bold 66px Georgia","#e5bd78","#151714",true,true);
  }

  private tileInstances(
    name:string,layout:DungeonLayout,kind:(x:number,z:number,tile:string)=>boolean,
    size:{width:number;height:number;depth:number;y:number},
    mat:Material,
  ):void{
    const transforms:number[]=[];
    for(let z=0;z<layout.height;z++){
      for(let x=0;x<layout.width;x++){
        if(!kind(x,z,layout.tiles[z*layout.width+x]!))continue;
        const pos=tableDioramaPosition(layout,{x,z});
        transforms.push(...Matrix.Translation(pos.x,size.y,pos.z).asArray());
      }
    }
    if(!transforms.length)return;
    const mesh=MeshBuilder.CreateBox(name,{
      width:size.width,height:size.height,depth:size.depth,
    },this.scene);
    mesh.parent=this.floorRoot;
    mesh.material=mat;
    mesh.isPickable=false;mesh.checkCollisions=false;
    mesh.thinInstanceSetBuffer("matrix",new Float32Array(transforms),16,true);
    this.tabletopLight.includedOnlyMeshes.push(mesh);
  }

  /** The LIVE map itself keeps near-square tiles. The extra width of the
   * real rectangular well becomes sculpted, fully textured bedrock at both
   * sides, not stretched corridors, black strips or a false dungeon level.
   * All meshes are presentation-only children disposed on floor rebuild.
   */
  private createBedrockBanks(fit:TableDioramaFit):number{
    const well=TABLE_DIORAMA_WELL;
    const plates:{name:string;x:number;z:number;width:number;depth:number}[]=[];
    if(fit.borderX>.001)for(const side of [-1,1])
      plates.push({
        name:"side-"+(side<0?"left":"right"),
        x:side*(fit.coreWidth/2+fit.borderX/2),z:0,
        width:fit.borderX,depth:well.depth,
      });
    if(fit.borderZ>.001)for(const side of [-1,1])
      plates.push({
        name:"end-"+(side<0?"rear":"front"),
        x:0,z:side*(fit.coreDepth/2+fit.borderZ/2),
        width:fit.coreWidth,depth:fit.borderZ,
      });

    // The actual GLB well has a deep black undertray. A thin floor slab was
    // BELOW its visually occluding lip and left conspicuous black bands.
    // Raised, solid bedrock escarpments instead reach up beside the masonry,
    // with real textured vertical cutaway faces all the way to the underlay.
    const bankBottom=well.baseY+.006;
    const bankTop=well.wallY+.017;
    for(const plate of plates){
      const mesh=MeshBuilder.CreateBox(
        "cellar-table-diorama-bedrock-"+plate.name,{
          width:plate.width+.002,depth:plate.depth+.002,
          height:bankTop-bankBottom,
        },this.scene);
      mesh.parent=this.floorRoot;
      mesh.position.set(plate.x,(bankTop+bankBottom)/2,plate.z);
      mesh.material=this.palette.stoneB;
      mesh.isPickable=false;mesh.checkCollisions=false;
      this.tabletopLight.includedOnlyMeshes.push(mesh);
    }

    // Art-directed terraces along the cutaway: two staggered stone courses
    // with bounded heights. Repeated facets are drawn with TWO thin-instance
    // batches, never hundreds of independently simulated scene objects.
    const facets:[number[],number[]]=[[],[]];
    const push=(x:number,z:number,w:number,d:number,h:number,shade:number)=>{
      const y=bankTop+h/2;
      facets[shade].push(...Matrix.Scaling(w,h,d).multiply(
        Matrix.Translation(x,y,z)).asArray());
    };
    if(fit.borderX>.001){
      const segments=Math.max(10,Math.ceil(well.depth/.035));
      const step=well.depth/segments;
      for(const side of [-1,1])for(let i=0;i<segments;i++){
        const z=-well.depth/2+(i+.5)*step;
        const wave=.5+.5*Math.sin(i*2.17+side*1.31);
        for(let lane=0;lane<2;lane++){
          const t=lane===0?.26:.73;
          const w=fit.borderX*(lane===0?.42:.38);
          const x=side*(fit.coreWidth/2+fit.borderX*t);
          const h=.012+wave*.024+(lane===1?.009:0);
          push(x,z,w,step*.90,h,(i+lane+(side===1?1:0))%2);
        }
      }
    }
    if(fit.borderZ>.001){
      const segments=Math.max(10,Math.ceil(well.width/.035));
      const step=fit.coreWidth/segments;
      for(const side of [-1,1])for(let i=0;i<segments;i++){
        const x=-fit.coreWidth/2+(i+.5)*step;
        const wave=.5+.5*Math.sin(i*2.17+side*1.31);
        for(let lane=0;lane<2;lane++){
          const t=lane===0?.26:.73;
          const d=fit.borderZ*(lane===0?.42:.38);
          const z=side*(fit.coreDepth/2+fit.borderZ*t);
          const h=.012+wave*.024+(lane===1?.009:0);
          push(x,z,step*.90,d,h,(i+lane+(side===1?1:0))%2);
        }
      }
    }
    for(let shade=0;shade<2;shade++){
      if(!facets[shade].length)continue;
      const mesh=MeshBuilder.CreateBox(
        "cellar-table-diorama-bedrock-facets-"+shade,{
          width:1,height:1,depth:1,
        },this.scene);
      mesh.parent=this.floorRoot;
      mesh.material=shade===0?this.palette.stoneA:this.palette.stoneB;
      mesh.isPickable=false;mesh.checkCollisions=false;
      mesh.thinInstanceSetBuffer("matrix",
        new Float32Array(facets[shade]),16,true);
      this.tabletopLight.includedOnlyMeshes.push(mesh);
    }
    return plates.length;
  }

  /** Same 2.5 m tile coordinate space as DungeonViewer, displayed at scale
   * inside the physical furniture. All authored props use this one adapter. */
  private worldPoint(p:DungeonPoint):Vector3{
    const map=this.layout!;
    const at=dungeonTileWorldCenter(map,p);
    return new Vector3(at.x,0,at.z);
  }

  private disposeFigure(figure:Figure):void{
    const ownedMaterials=new Set(figure.visual.root.getChildMeshes(false)
      .map(mesh=>mesh.material).filter(mat=>mat!==null));
    figure.visual.root.dispose();
    figure.ring.dispose();
    for(const mat of ownedMaterials)mat?.dispose();
  }

  private buildFloor(layout:DungeonLayout,floor:SpatialDungeonFloor):void{
    for(const figure of this.heroes.values())this.disposeFigure(figure);
    this.tabletopLight.includedOnlyMeshes.length=0;
    this.floorRoot?.dispose();
    this.miniatureWorldRoot?.dispose();
    for(const mat of this.floorArtMaterials)mat.dispose();
    this.floorArtMaterials=[];
    this.heroes.clear();
    this.priorMonsterTiles.clear();
    this.monsterTravel.clear();
    this.monsterObservedTick=null;
    this.monsterObservedDay=null;
    this.layout=layout;

    this.floorRoot=new TransformNode("cellar-table-diorama-floor-"+floor,this.scene);
    this.floorRoot.parent=this.root;
    this.miniatureWorldRoot=new TransformNode(
      "cellar-table-diorama-live-art-scale",this.scene);
    this.miniatureWorldRoot.parent=this.root;
    this.miniatureWorldRoot.position.y=TABLE_DIORAMA_WELL.floorY;
    // Same tile coordinates as the LIVE viewer; fit controls only the
    // physical art adapter, not saved topology or hero movement.
    const fit=tableDioramaFit(layout);
    this.miniatureWorldRoot.scaling.set(
      fit.coreWidth/(layout.width*2.5),.034,
      fit.coreDepth/(layout.height*2.5));

    this.actorRoot=new TransformNode("cellar-table-diorama-actors",this.scene);
    this.actorRoot.parent=this.miniatureWorldRoot;
    this.featureRoot=new TransformNode("cellar-table-diorama-features",this.scene);
    this.featureRoot.parent=this.miniatureWorldRoot;
    this.setFloorLabel(floor);
    this.root.metadata={floor,layoutWidth:layout.width,layoutHeight:layout.height,
      featureCount:0,actorCount:0,renderKind:"shared-live-dungeon-art",
      coreWidth:fit.coreWidth,coreDepth:fit.coreDepth,
      borderX:fit.borderX,borderZ:fit.borderZ,
      bankTop:TABLE_DIORAMA_WELL.wallY+.017,
      wellCoverage:(fit.coreWidth+2*fit.borderX)*
        (fit.coreDepth+2*fit.borderZ)/
        (TABLE_DIORAMA_WELL.width*TABLE_DIORAMA_WELL.depth)};
    const xStep=fit.tileWidth;
    const zStep=fit.tileDepth;

    const base=MeshBuilder.CreateBox("cellar-table-diorama-base",{
      width:TABLE_DIORAMA_WELL.width+.012,
      depth:TABLE_DIORAMA_WELL.depth+.012,height:.012,
    },this.scene);
    base.parent=this.floorRoot;
    base.position.y=TABLE_DIORAMA_WELL.baseY;
    base.material=this.palette.platform;
    base.isPickable=false;base.checkCollisions=false;
    this.root.metadata.bedrockPlates=this.createBedrockBanks(fit);

    const thin=(name:string,
      predicate:(x:number,z:number,tile:string)=>boolean,
      y:number,h:number,mat:Material)=>
      this.tileInstances(name,layout,predicate,{
        width:xStep*.988,height:h,depth:zStep*.988,y,
      },mat);

    // The very same stone and flagstone procedural textures used in the
    // fullscreen LIVE viewer; only the geometry transform is miniature.
    thin("cellar-table-diorama-corridors",(_,__,tile)=>tile==="corridor",
      TABLE_DIORAMA_WELL.floorY,.008,this.palette.corridor);
    thin("cellar-table-diorama-rooms",(_,__,tile)=>tile==="room",
      TABLE_DIORAMA_WELL.floorY,.009,this.palette.room);
    // After the documented 180° table observation alignment, the LOCAL
    // front (+Z) sees the original grid -Z edge, not its +Z edge.
    thin("cellar-table-diorama-front-cutaway",(_,z,tile)=>
      tile==="wall"&&z<=1,
      TABLE_DIORAMA_WELL.floorY+.015,.028,this.palette.stoneB);
    thin("cellar-table-diorama-walls-a",(x,z,tile)=>
      tile==="wall"&&z>1&&(x+z)%2===0,
      TABLE_DIORAMA_WELL.wallY,TABLE_DIORAMA_WELL.wallHeight,
      this.palette.stoneA);
    thin("cellar-table-diorama-walls-b",(x,z,tile)=>
      tile==="wall"&&z>1&&(x+z)%2!==0,
      TABLE_DIORAMA_WELL.wallY,TABLE_DIORAMA_WELL.wallHeight,
      this.palette.stoneB);
    // Only now is the include-list populated: enable the scoped light.
    this.tabletopLight.setEnabled(true);

    // Actual LIVE Dungeon burial crypt props. Each room gets the same
    // relics and tomb geometry, not the former flat marker. Their full
    // floor-scale lights would illuminate the entire shop: dispose those.
    for(const [index,room] of layout.rooms.entries()){
      const materialStart=this.scene.materials.length;
      const crypt=createGhoulCryptRoom(this.scene,room,this.worldPoint(room),index);
      crypt.light.dispose();
      crypt.mesh.parent=this.miniatureWorldRoot;
      crypt.mesh.name="cellar-table-diorama-crypt-"+index;
      this.floorArtMaterials.push(...this.scene.materials.slice(materialStart)
        .filter((mat):mat is StandardMaterial=>mat instanceof StandardMaterial));
      // Small ambient support for the same materials in the dark cellar.
      for(const mat of this.scene.materials.slice(materialStart))
        if(mat instanceof StandardMaterial)
          mat.emissiveColor=mat.emissiveColor.add(mat.diffuseColor.scale(.19));
    }

    // Reuse the FULL viewer's authored staircase props and route semantics.
    for(const stair of dungeonFloorStairways(layout)){
      const materialStart=this.scene.materials.length;
      const mesh=createDungeonStairwayProp(
        this.scene,stair,this.worldPoint(stair));
      mesh.parent=this.miniatureWorldRoot;
      mesh.name="cellar-table-diorama-stair-"+stair.id;
      mesh.isPickable=false;
      this.floorArtMaterials.push(...this.scene.materials.slice(materialStart)
        .filter((mat):mat is StandardMaterial=>mat instanceof StandardMaterial));
      for(const mat of this.scene.materials.slice(materialStart))
        if(mat instanceof StandardMaterial)
          mat.emissiveColor=mat.emissiveColor.add(mat.diffuseColor.scale(.23));
    }
    this.ensureAuthoredGhouls();
  }

  private ensureAuthoredGhouls():void{
    if(this.ghoulMap)return;
    this.ghoulMap=new GhoulMapInstances(this.scene,[],{
      visualHeight:2.05,
      instancePrefix:"cellar-table-diorama-authored-ghoul-",
      onReady:()=>{
        // Rebuild the same already selected floor's cosmetic instances once
        // the single shared two-pose asset is loaded. Never touch GameStore.
        if(!this.root.isDisposed())this.lastResolved="~";
      },
    });
  }

  private syncFeatures(frame:LiveFloorSpectatorFrame):void{
    this.featureRoot?.dispose();
    this.monsterAnchors.clear();
    this.monsterHints.clear();
    this.monsterTravel.clear();
    this.priorMonsterTiles.clear();
    this.monsterObservedTick=null;
    this.featureRoot=new TransformNode("cellar-table-diorama-features",this.scene);
    this.featureRoot.parent=this.miniatureWorldRoot;
    const resolved=new Set(frame.resolved);
    let visible=0,authoredProps=0;
    const ghoulSites:GhoulMapSite[]=[];
    for(const feature of this.layout!.features){
      if(resolved.has(feature.id))continue;
      const pack=feature.kind==="monster"
        ?frame.monsters?.find(m=>m.id===feature.id):null;
      if(feature.kind==="monster"&&frame.monsters&&!pack)continue;
      visible++;
      const p=this.worldPoint(pack??feature);
      if(feature.kind==="treasure"||feature.kind==="trap"){
        const mesh=feature.kind==="treasure"?
          createReadableDungeonChest(this.scene,feature,p,this.featurePaint):
          createReadableDungeonTrap(this.scene,feature,p,this.featurePaint);
        mesh.parent=this.featureRoot;
        mesh.name="cellar-table-diorama-"+feature.kind+"-"+feature.id;
        mesh.isPickable=false;mesh.checkCollisions=false;
        authoredProps++;
      }else{
        const anchor=MeshBuilder.CreateBox(
          "cellar-table-diorama-ghoul-anchor-"+feature.id,{
            width:1.65,height:.07,depth:1.65,
          },this.scene);
        anchor.parent=this.featureRoot;
        anchor.position.set(p.x,.33,p.z);
        this.monsterAnchors.set(feature.id,anchor);
        anchor.visibility=0;anchor.isPickable=false;
        anchor.checkCollisions=false;
        // An illustrated fallback stays visible until both authored pose
        // rigs are ready. The shared owner disables it when instances exist.
        const fallback=MeshBuilder.CreatePlane(
          "cellar-table-diorama-ghoul-loading-"+feature.id,
          {width:1.65,height:1.65},this.scene);
        fallback.parent=anchor;
        fallback.position.y=.04;
        fallback.rotation.x=-Math.PI/2;
        fallback.material=this.ghoulFallback;
        fallback.isPickable=false;fallback.checkCollisions=false;
        ghoulSites.push({id:feature.id,root:anchor,fallback});
      }
    }
    this.ghoulMap?.setSites(ghoulSites);
    this.root.metadata.featureCount=visible;
    this.root.metadata.authoredProps=authoredProps;
    this.root.metadata.authoredGhouls=this.ghoulMap?.authoredCount??0;
  }

  /** Update existing instances only. The same LIVE world drives both
   * projections; table updates never choose a path or advance a monster. */
  private syncMonsters(frame:LiveFloorSpectatorFrame,now:number):void{
    if(!this.layout)return;
    // Each tile change is checked against the SAME saved-step requirements
    // as the full LIVE viewer. No route extrapolation while offscreen.
    for(const [id,anchor] of this.monsterAnchors){
      const monster=frame.monsters?.find(m=>m.id===id);
      if(frame.monsters&&!monster){
        anchor.setEnabled(false);
        this.monsterTravel.delete(id);
        this.priorMonsterTiles.delete(id);
      }else{
        anchor.setEnabled(monster?.mode!=="ENGAGED");
        if(monster){
          const point=this.worldPoint(monster);
          const destination=new Vector3(point.x,.33,point.z);
          const old=this.priorMonsterTiles.get(id);
          const changed=!!old&&(old.x!==monster.x||old.z!==monster.z);
          const allowed=changed&&this.monsterObservedDay!==null&&
            this.monsterObservedTick!==null&&
            isObservedMonsterStep({
              ...old!,day:this.monsterObservedDay,floor:frame.floor,
              worldTick:this.monsterObservedTick,
            },{...monster,day:frame.day,floor:frame.floor,
              worldTick:frame.worldTick});
          if(allowed){
            this.monsterTravel.set(id,{
              from:anchor.position.clone(),to:destination,startedAt:now,
            });
          }else if(changed||!old){
            this.monsterTravel.delete(id);
          }
          this.priorMonsterTiles.set(id,{
            x:monster.x,z:monster.z,siteCycle:monster.siteCycle,
            lastMoveTick:monster.lastMoveTick,
          });
          const journey=this.monsterTravel.get(id);
          if(journey){
            const progress=monsterObservationStepProgress(
              (now-journey.startedAt)/1000);
            anchor.position.copyFrom(Vector3.Lerp(
              journey.from,journey.to,progress));
            if(progress>=1)this.monsterTravel.delete(id);
          }else anchor.position.copyFrom(destination);
        }
      }
      const next=monster?.target&&monster.mode!=="ENGAGED"
        ?dungeonShortestPath(this.layout,monster,monster.target)[1]:null;
      const signature=next&&monster
        ?monster.x+","+monster.z+":"+next.x+","+next.z:"";
      const old=this.monsterHints.get(id);
      if(old?.signature===signature)continue;
      old?.mesh.dispose();this.monsterHints.delete(id);
      if(!next||!monster||!this.featureRoot)continue;
      const start=this.worldPoint(monster),end=this.worldPoint(next);
      start.y=.55;end.y=.55;
      const vx=end.x-start.x,vz=end.z-start.z;
      const length=Math.hypot(vx,vz)||1;
      const ux=vx/length,uz=vz/length;
      const left=new Vector3(end.x-ux*.47-uz*.28,.55,
        end.z-uz*.47+ux*.28);
      const right=new Vector3(end.x-ux*.47+uz*.28,.55,
        end.z-uz*.47-ux*.28);
      const hint=MeshBuilder.CreateLines(
        "cellar-table-monster-next-"+id,{
          points:[start,end,left,end,right],
        },this.scene);
      hint.parent=this.featureRoot;
      hint.color=Color3.FromHexString("#f44f50");
      hint.isPickable=false;hint.checkCollisions=false;
      hint.metadata={previewOnly:true,monsterId:id};
      this.monsterHints.set(id,{mesh:hint,signature});
    }
    this.monsterObservedTick=frame.worldTick;
    this.monsterObservedDay=frame.day;
  }

  private syncActors(frame:LiveFloorSpectatorFrame):void{
    const alive=new Set(frame.heroes.map(h=>h.id));
    for(const [id,figure] of this.heroes){
      if(alive.has(id))continue;
      this.disposeFigure(figure);
      this.heroes.delete(id);
    }
    for(const hero of frame.heroes){
      let figure=this.heroes.get(hero.id);
      if(!figure){
        // Exactly the same role/equipment/appearance factory as the fullscreen
        // LIVE Dungeon and Galvik's physical shop visitors.
        const visual=createHeroVisual(this.scene,{
          id:hero.id,role:hero.role,equipment:hero.equipment,
        },"cellar-table-diorama-hero-"+hero.id);
        // Readable 3D miniatures, not flat HUD markers. Silhouettes need to
        // clear the small masonry relief at the normal shop view distance.
        visual.root.scaling.setAll(1.3);
        visual.root.parent=this.actorRoot;
        // Slight ambient glow at miniature size, never a flat class cylinder.
        for(const mesh of visual.root.getChildMeshes(false)){
          mesh.isPickable=false;mesh.checkCollisions=false;
          const mat=mesh.material;
          if(mat instanceof StandardMaterial)
            mat.emissiveColor=mat.diffuseColor.scale(.24);
        }
        const ring=MeshBuilder.CreateTorus(
          "cellar-table-diorama-party-"+hero.id,{
            diameter:1.85,thickness:.12,tessellation:12,
          },this.scene);
        ring.parent=this.actorRoot;
        ring.material=this.palette.entrance;
        ring.isPickable=false;ring.checkCollisions=false;
        figure={visual,ring};
        this.heroes.set(hero.id,figure);
      }
      const at=this.worldPoint(hero);
      figure.visual.root.position.copyFrom(at);
      setHeroVisualEquipment(figure.visual,hero.equipment);
      figure.ring.position.set(at.x,.10,at.z);
      figure.ring.isVisible=!!hero.partyId;
    }
    this.root.metadata.actorCount=this.heroes.size;
  }

  get observedFloor():number|null{return this.activeFloor;}
  get miniatureActorCount():number{return this.heroes.size;}
  dispose():void{
    for(const figure of this.heroes.values())this.disposeFigure(figure);
    this.heroes.clear();
    this.root.dispose();
    this.floorPlaque.dispose();
    this.tabletopLight.dispose();
    this.ghoulMap?.dispose();
    for(const mat of this.floorArtMaterials)mat.dispose();
    this.floorText.dispose();
    this.floorMat.dispose();
    this.ghoulFallback.dispose();
    for(const mat of Object.values(this.featurePaint))mat.dispose();
    for(const mat of Object.values(this.palette))mat.dispose();
  }
}
