import {Color3} from "@babylonjs/core/Maths/math.color";
import {Vector3} from "@babylonjs/core/Maths/math.vector";
import {PointLight} from "@babylonjs/core/Lights/pointLight";
import {Mesh} from "@babylonjs/core/Meshes/mesh";
import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import {VertexData} from "@babylonjs/core/Meshes/mesh.vertexData";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import type {Scene} from "@babylonjs/core/scene";
import {bossStrikeGeometry,type BossPhase} from "./arenaCombatMotion.ts";
import {sampleMaulerImpact} from "./maulerImpactPresentation.ts";

/** Pure opt-in art. All contact, lava damage, telegraph timing and outcome
 * remain solely owned by the committed 60-Hz group motor. */
export interface TrollImpactPose {
  readonly phase:BossPhase;
  readonly phaseAge:number;
  readonly slam:boolean;
  readonly attackType:"smash"|"slam"|"grab";
  readonly lockedHeading:number;
  readonly x:number;
  readonly z:number;
}
export interface CaveTrollImpactVisual {
  paint(pose:TrollImpactPose):void;
  dispose():void;
}

/** The original Level-6 authored telegraph and impact curves, transplanted
 * without resimulating a single attack in the shared group spectator. Each
 * boss owns exactly one bounded mesh pool, never per-frame allocations. */
export function createCaveTrollImpactVisual(
  scene:Scene,prefix="group-troll",
):CaveTrollImpactVisual{
  const owned:Mesh[]=[];
  const materials:StandardMaterial[]=[];
  const mat=(label:string,hex:string,emissive=false)=>{
    const value=new StandardMaterial(prefix+"-"+label,scene);
    value.diffuseColor=Color3.FromHexString(hex);
    value.specularColor=new Color3(.08,.06,.04);
    if(emissive)value.emissiveColor=Color3.FromHexString(hex).scale(.9);
    materials.push(value);
    return value;
  };
  const own=(mesh:Mesh)=>{mesh.isPickable=false;mesh.checkCollisions=false;
    owned.push(mesh);return mesh;};
  const dust=own(MeshBuilder.CreateTorus(prefix+"-impact-dust",
    {diameter:2.8,thickness:.26,tessellation:42},scene));
  dust.material=mat("dust","#b28a62",true);
  dust.position.y=.14;dust.visibility=0;
  const rubbleMat=mat("rubble","#6c625c");
  const hotRubble=mat("hot-rubble","#ae8470");
  const debris=Array.from({length:16},(_,i)=>{
    const shard=own(MeshBuilder.CreateSphere(prefix+"-debris-"+i,
      {diameter:.17+(i%4)*.075,segments:5},scene));
    shard.material=i%5===0?hotRubble:rubbleMat;
    shard.visibility=0;
    return shard;
  });
  const flash=new PointLight(prefix+"-impact-flash",
    new Vector3(0,1.2,0),scene);
  flash.diffuse=Color3.FromHexString("#edab75");
  flash.range=12;flash.intensity=0;
  const warningMat=mat("warning-red","#b82513",true);
  const warning=(label:string,slam:boolean)=>{
    const {reach,halfAngleRadians}=bossStrikeGeometry(slam);
    const positions=[0,.14,0],indices:number[]=[];
    const segments=32;
    for(let i=0;i<=segments;i++){
      const angle=-halfAngleRadians+2*halfAngleRadians*i/segments;
      positions.push(Math.sin(angle)*reach,.14,Math.cos(angle)*reach);
      if(i<segments)indices.push(0,i+1,i+2);
    }
    const normals:number[]=[];
    VertexData.ComputeNormals(positions,indices,normals);
    const data=new VertexData();
    data.positions=positions;data.indices=indices;data.normals=normals;
    const mesh=own(new Mesh(prefix+"-"+label,scene));
    data.applyToMesh(mesh);
    mesh.material=warningMat;mesh.visibility=0;
    return mesh;
  };
  const smashWarning=warning("smash-warning",false);
  const slamWarning=warning("slam-warning",true);

  return {
    paint(pose:TrollImpactPose):void{
      const fx=pose.attackType==="grab"
        ?sampleMaulerImpact(pose.phase==="windup"?"windup":"chase",
          pose.phaseAge,false)
        :sampleMaulerImpact(pose.phase,pose.phaseAge,pose.slam);
      const reach=pose.slam?3.45:2.75;
      const x=pose.x+Math.sin(pose.lockedHeading)*reach;
      const z=pose.z+Math.cos(pose.lockedHeading)*reach;
      dust.visibility=fx.impact;
      dust.scaling.setAll(fx.ringScale);
      dust.position.set(x,.14,z);
      for(let i=0;i<debris.length;i++){
        const shard=debris[i];
        const angle=i*2.399963229728653+(i%3)*.17;
        const radius=fx.debrisSpread*(.41+(i%5)*.15);
        shard.visibility=fx.impact>.02?Math.min(.95,fx.impact*1.65):0;
        shard.position.set(
          x+Math.cos(angle)*radius,
          .14+fx.debrisRise*(.52+(i%4)*.17),
          z+Math.sin(angle)*radius);
        shard.rotation.set(angle*.25,angle+fx.debrisSpread*.28,
          angle*.18+fx.debrisSpread*.35);
      }
      flash.position.set(x,1.1,z);
      flash.intensity=fx.flash;
      smashWarning.visibility=pose.slam?0:fx.telegraph;
      slamWarning.visibility=pose.slam?fx.telegraph:0;
      for(const sector of [smashWarning,slamWarning]){
        sector.position.set(pose.x,0,pose.z);
        sector.rotation.y=pose.lockedHeading;
      }
    },
    dispose():void{
      for(const mesh of owned)mesh.dispose();
      flash.dispose();
      for(const material of materials)material.dispose();
    },
  };
}
