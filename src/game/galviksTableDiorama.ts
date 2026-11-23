import {Color3} from "@babylonjs/core/Maths/math.color";
import {Matrix,Vector3} from "@babylonjs/core/Maths/math.vector";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {ShaderMaterial} from "@babylonjs/core/Materials/shaderMaterial";
import {DynamicTexture} from "@babylonjs/core/Materials/Textures/dynamicTexture";
import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import {loadAssetContainerAsync} from "@babylonjs/core/Loading/sceneLoader";
import type {AssetContainer} from "@babylonjs/core/assetContainer";
import {Mesh} from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/core/Meshes/instancedMesh";
import "@babylonjs/loaders/glTF/2.0";
import {TransformNode} from "@babylonjs/core/Meshes/transformNode";
import type {Scene} from "@babylonjs/core/scene";
import type {GameState} from "./gameState.ts";
import {tableDioramaPosition,TABLE_DIORAMA_WELL} from "./tableDioramaGeometry.ts";
import {generateExpeditionLayout,
  type DungeonLayout,type DungeonPoint} from "./dungeonLayout.ts";
import {getDungeonSurfaces} from "./dungeonSurfaces.ts";
import {createDungeonFeaturePalette,createReadableDungeonChest,
  createReadableDungeonTrap} from "./dungeonFeatureProps.ts";
import {dungeonFloorStairways} from "./dungeonStairways.ts";
import {createDungeonStairwayProp} from "./dungeonStairProps.ts";
import {createGhoulCryptRoom} from "./ghoulCryptArt.ts";
import {createHeroVisual,setHeroVisualEquipment,
  type HeroVisual} from "./heroVisual.ts";
import {GHOUL_MODEL} from "./ghoulMotion.ts";
import {createGhoulMapIconMaterial} from "./dungeonGhoulMapIcon.ts";
import {selectLiveFloorSpectatorFrame,LIVE_SPECTATOR_FLOORS,
  type LiveFloorSpectatorFrame} from "./liveFloorSpectator.ts";
import type {SpatialDungeonFloor} from "./spatialDungeonExploration.ts";

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
  private readonly floorMat:ShaderMaterial;
  private readonly palette:{
    stoneA:StandardMaterial;stoneB:StandardMaterial;
    corridor:StandardMaterial;room:StandardMaterial;
    platform:StandardMaterial;heroTank:StandardMaterial;
    heroDps:StandardMaterial;heroHeal:StandardMaterial;
    ghoul:StandardMaterial;treasure:StandardMaterial;
    trap:StandardMaterial;entrance:StandardMaterial;stair:StandardMaterial;
    combat:StandardMaterial;
  };
  private floorRoot:TransformNode|null=null;
  private miniatureWorldRoot:TransformNode|null=null;
  private readonly featurePaint:ReturnType<typeof createDungeonFeaturePalette>;
  private readonly ghoulFallback:StandardMaterial;
  private ghoulSource:Mesh|null=null;
  private ghoulAsset:AssetContainer|null=null;
  private ghoulLoading=false;
  private lastFrame:LiveFloorSpectatorFrame|null=null;
  private floorArtMaterials:StandardMaterial[]=[];
  private actorRoot:TransformNode|null=null;
  private featureRoot:TransformNode|null=null;
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
    this.root.position.z=TABLE_DIORAMA_WELL.centerZ;
    this.root.setEnabled(false); // GLB must be loaded before placing geometry

    // Exactly the SAME authored procedural stone and flagstone textures
    // as the full LIVE Dungeon viewer. The shop scene already caches them.
    // Weak ambient emission retains those texture details under cellar light.
    const live=getDungeonSurfaces(scene);
    const scaledSurface=(name:string,source:StandardMaterial,tint:number)=>{
      const mat=source.clone("table-diorama-live-"+name) as StandardMaterial;
      mat.diffuseColor=new Color3(tint,tint,tint);
      mat.emissiveTexture=source.diffuseTexture;
      mat.emissiveColor=new Color3(.28,.28,.28);
      mat.specularColor=new Color3(.04,.04,.04);
      return mat;
    };
    this.palette={
      stoneA:scaledSurface("stone",live.stone,.95),
      stoneB:scaledSurface("stone-accent",live.stoneAccent,.91),
      corridor:scaledSurface("flagstones",live.floor,.96),
      room:scaledSurface("room-flagstones",live.floor,1.08),
      platform:material(scene,"platform",new Color3(.11,.14,.15)),
      heroTank:material(scene,"hero-tank",new Color3(.28,.72,.96)),
      heroDps:material(scene,"hero-dps",new Color3(.97,.75,.34)),
      heroHeal:material(scene,"hero-heal",new Color3(.42,.94,.57)),
      ghoul:material(scene,"ghoul",new Color3(.91,.33,.37)),
      treasure:material(scene,"treasure",new Color3(1,.78,.26)),
      trap:material(scene,"trap",new Color3(.82,.32,.66)),
      entrance:material(scene,"entrance",new Color3(.24,.96,.74)),
      stair:material(scene,"stair",new Color3(.91,.72,.38)),
      combat:material(scene,"combat",new Color3(1,.28,.21)),
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
    plaque.parent=this.root;
    // Vertical, facing Galvik on the rear lip ABOVE the miniature.
    plaque.position.set(0,1.020,-.355);
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
    // Presentation-only throttle. World time and autonomous heroes never pause.
    if(now-this.lastUpdateAt<160)return;
    this.lastUpdateAt=now;
    const frame=selectLiveFloorSpectatorFrame(state,floor);
    if(!frame)return;
    this.lastFrame=frame;
    this.syncActors(frame);
    const resolved=[...frame.resolved].sort().join("|");
    if(resolved!==this.lastResolved){
      this.lastResolved=resolved;
      this.syncFeatures(frame);
    }
  }

  private setFloorLabel(floor:number):void{
    this.floorText.drawText("FLOOR "+String(floor).padStart(2,"0"),
      null,88,"bold 66px Georgia","#e5bd78","#151714",true,true);
  }

  private tileInstances(
    name:string,layout:DungeonLayout,kind:(x:number,z:number,tile:string)=>boolean,
    size:{width:number;height:number;depth:number;y:number},
    mat:StandardMaterial,
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
  }

  private buildFloor(layout:DungeonLayout,floor:SpatialDungeonFloor):void{
    this.floorRoot?.dispose();
    this.actorRoot?.dispose();
    this.featureRoot?.dispose();
    this.heroes.clear();
    this.layout=layout;
    this.floorRoot=new TransformNode("cellar-table-diorama-floor-"+floor,this.scene);
    this.floorRoot.parent=this.root;
    this.actorRoot=new TransformNode("cellar-table-diorama-actors",this.scene);
    this.actorRoot.parent=this.root;
    this.featureRoot=new TransformNode("cellar-table-diorama-features",this.scene);
    this.featureRoot.parent=this.root;
    this.setFloorLabel(floor);
    this.root.metadata={floor,layoutWidth:layout.width,layoutHeight:layout.height,
      featureCount:0,actorCount:0};
    const xStep=TABLE_DIORAMA_WELL.width/layout.width;
    const zStep=TABLE_DIORAMA_WELL.depth/layout.height;

    const base=MeshBuilder.CreateBox("cellar-table-diorama-base",{
      width:TABLE_DIORAMA_WELL.width+.012,
      depth:TABLE_DIORAMA_WELL.depth+.012,height:.012,
    },this.scene);
    base.parent=this.floorRoot;
    base.position.y=TABLE_DIORAMA_WELL.baseY;
    base.material=this.palette.platform;
    base.isPickable=false;base.checkCollisions=false;

    const thin=(name:string,
      predicate:(x:number,z:number,tile:string)=>boolean,
      y:number,h:number,mat:StandardMaterial)=>
      this.tileInstances(name,layout,predicate,{
        width:xStep*.988,height:h,depth:zStep*.988,y,
      },mat);

    thin("cellar-table-diorama-corridors",(_,__,tile)=>tile==="corridor",
      TABLE_DIORAMA_WELL.floorY,.008,this.palette.corridor);
    thin("cellar-table-diorama-rooms",(_,__,tile)=>tile==="room",
      TABLE_DIORAMA_WELL.floorY,.008,this.palette.room);
    // Cutaway front perimeter: tall close walls would hide every corridor
    // when Galvik stands on the keyboard/control side of the table.
    thin("cellar-table-diorama-front-cutaway",(_,z,tile)=>
      tile==="wall"&&z>=layout.height-2,
      TABLE_DIORAMA_WELL.floorY+.015,.028,this.palette.stoneB);
    thin("cellar-table-diorama-walls-a",(x,z,tile)=>
      tile==="wall"&&z<layout.height-2&&(x+z)%2===0,
      TABLE_DIORAMA_WELL.wallY,TABLE_DIORAMA_WELL.wallHeight,
      this.palette.stoneA);
    thin("cellar-table-diorama-walls-b",(x,z,tile)=>
      tile==="wall"&&z<layout.height-2&&(x+z)%2!==0,
      TABLE_DIORAMA_WELL.wallY,TABLE_DIORAMA_WELL.wallHeight,
      this.palette.stoneB);

    this.addMarker("entrance",layout.entrance,this.palette.entrance,.018,
      this.floorRoot);
    if(floor<10)this.addMarker("downstairs",dungeonDownStair(layout),
      this.palette.stair,.018,this.floorRoot);
    // Monuments, heroes and features NEVER own a physical collision shape.
  }

  private addMarker(name:string,p:DungeonPoint,mat:StandardMaterial,
    height:number,parent:TransformNode):Mesh{
    const layout=this.layout!;
    const pos=tableDioramaPosition(layout,p);
    const mesh=MeshBuilder.CreateCylinder("cellar-table-diorama-"+name,{
      height,diameter:Math.min(TABLE_DIORAMA_WELL.width/layout.width,
        TABLE_DIORAMA_WELL.depth/layout.height)*.72,tessellation:6,
    },this.scene);
    mesh.parent=parent;
    mesh.position.set(pos.x,TABLE_DIORAMA_WELL.floorY+.01+height/2,pos.z);
    mesh.material=mat;
    mesh.isPickable=false;mesh.checkCollisions=false;
    return mesh;
  }

  private syncFeatures(frame:LiveFloorSpectatorFrame):void{
    this.featureRoot?.dispose();
    this.featureRoot=new TransformNode("cellar-table-diorama-features",this.scene);
    this.featureRoot.parent=this.root;
    const resolved=new Set(frame.resolved);
    let visible=0;
    for(const feature of this.layout!.features){
      if(resolved.has(feature.id))continue;
      const mat=feature.kind==="monster"?this.palette.ghoul:
        feature.kind==="treasure"?this.palette.treasure:this.palette.trap;
      visible++;
      this.addMarker("feature-"+feature.id,feature,mat,
        feature.kind==="monster"?.035:.022,this.featureRoot);
    }
    this.root.metadata.featureCount=visible;
  }

  private syncActors(frame:LiveFloorSpectatorFrame):void{
    const alive=new Set(frame.heroes.map(h=>h.id));
    for(const [id,figure] of this.heroes){
      if(alive.has(id))continue;
      figure.mesh.dispose();
      figure.ring?.dispose();
      this.heroes.delete(id);
    }
    for(const hero of frame.heroes){
      let figure=this.heroes.get(hero.id);
      if(!figure){
        const roleMat=hero.role==="tank"?this.palette.heroTank:
          hero.role==="healer"?this.palette.heroHeal:this.palette.heroDps;
        const mesh=this.addMarker("hero-"+hero.id,hero,roleMat,.042,
          this.actorRoot!);
        const ring=MeshBuilder.CreateTorus("cellar-table-diorama-party-"+hero.id,{
          diameter:.026,thickness:.0025,tessellation:12,
        },this.scene);
        ring.parent=this.actorRoot;
        ring.material=this.palette.entrance;
        ring.isPickable=false;ring.checkCollisions=false;
        figure={mesh,ring};
        this.heroes.set(hero.id,figure);
      }
      const at=tableDioramaPosition(this.layout!,hero);
      figure.mesh.position.x=at.x;
      figure.mesh.position.z=at.z;
      figure.mesh.material=hero.inCombat?this.palette.combat:
        hero.role==="tank"?this.palette.heroTank:
          hero.role==="healer"?this.palette.heroHeal:this.palette.heroDps;
      figure.ring!.position.set(at.x,TABLE_DIORAMA_WELL.floorY+.006,at.z);
      figure.ring!.isVisible=!!hero.partyId;
    }
    this.root.metadata.actorCount=this.heroes.size;
  }

  get observedFloor():number|null{return this.activeFloor;}
  get miniatureActorCount():number{return this.heroes.size;}
  dispose():void{
    this.root.dispose();
    this.floorText.dispose();
    this.floorMat.dispose();
    for(const mat of Object.values(this.palette))mat.dispose();
  }
}
