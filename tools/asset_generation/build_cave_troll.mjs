// Generated GLB is committed; rerun with: node tools/asset_generation/build_cave_troll.mjs
// No external dependency, seed or source art is required. Each mesh is a
// unit-space anatomical sculpture grafted onto the existing deterministic rig.
import {writeFileSync} from "node:fs";
const buildCaveTrollGlb=function buildCaveTrollGlb(){
  // Deterministic 3D authoring: anatomical ring sections, triangular mesh
  // normals, original vertex paint, explicit glTF 2.0 buffer layout.
  const profiles={
    "barrel-torso":[[-.50,.15,.13,0,-.03],[-.40,.33,.31,0,.02],[-.22,.44,.44,0,.08],[.02,.49,.48,0,.06],[.22,.55,.41,0,-.02],[.39,.44,.33,0,-.12],[.50,.15,.17,0,-.14]],
    "bent-upper-back":[[-.5,.17,.16,0,.11],[-.38,.30,.32,0,.04],[-.15,.44,.44,0,-.03],[.10,.50,.50,0,-.09],[.28,.53,.45,0,-.11],[.43,.35,.32,0,-.12],[.5,.12,.12,0,-.08]],
    "belly":[[-.5,.14,.11,0,.11],[-.32,.36,.37,0,.12],[-.08,.48,.48,0,.16],[.13,.46,.48,0,.13],[.35,.33,.34,0,.01],[.50,.09,.10,0,-.09]],
    "neck":[[-.5,.29,.27,0,-.08],[-.33,.41,.41,0,.00],[-.07,.46,.47,0,.00],[.21,.38,.36,0,.07],[.43,.31,.29,0,.13],[.5,.20,.22,0,.13]],
    "head":[[-.50,.19,.17,0,.07],[-.40,.34,.36,0,.13],[-.27,.47,.53,0,.17],[-.06,.49,.52,0,.08],[.19,.52,.48,0,.01],[.38,.45,.36,0,-.05],[.50,.23,.20,0,-.06]],
    "nose":[[-.50,.19,.19,-.05,.03],[-.32,.40,.44,-.04,.05],[0,.51,.51,-.06,.12],[.32,.38,.33,-.03,.06],[.50,.15,.15,0,.01]],
    "upper-arm":[[-.50,.31,.32,0,0],[-.38,.40,.40,0,.02],[-.21,.50,.48,.02,0],[.08,.53,.50,0,-.01],[.32,.46,.44,-.01,-.02],[.50,.31,.33,0,-.01]],
    "forearm":[[-.50,.40,.39,0,.01],[-.36,.48,.46,0,.03],[-.10,.53,.49,.03,0],[.17,.49,.49,0,-.02],[.38,.38,.38,0,-.02],[.50,.28,.29,0,0]],
    "thigh":[[-.50,.29,.29,0,0],[-.34,.44,.43,.02,.02],[-.12,.52,.50,0,.01],[.19,.47,.48,0,-.01],[.39,.38,.37,0,-.02],[.50,.29,.28,0,0]],
    "shin":[[-.50,.29,.27,0,.01],[-.33,.43,.41,0,.03],[-.11,.48,.43,0,.01],[.15,.40,.36,0,0],[.38,.31,.30,0,-.01],[.50,.27,.25,0,-.01]],
    "boulder-foot":[[-.50,.27,.36,0,.09],[-.39,.44,.49,0,.11],[-.16,.49,.51,0,.12],[.07,.50,.49,0,.06],[.31,.41,.40,0,-.03],[.50,.20,.20,0,-.11]],
    "maul-stone-core":[[-.50,.38,.33,0,0],[-.36,.49,.45,0,.00],[-.12,.50,.49,0,.02],[.12,.47,.50,0,-.02],[.37,.49,.43,0,0],[.50,.37,.35,0,0]]
  };
  const assignments={
    "barrel-torso":"barrel-torso","bent-upper-back":"bent-upper-back","belly":"belly","neck":"neck","head":"head","nose":"nose",
    "upper-arm--1":"upper-arm","upper-arm-1":"upper-arm",
    "forearm--1":"forearm","forearm-1":"forearm",
    "thigh--1":"thigh","thigh-1":"thigh",
    "shin--1":"shin","shin-1":"shin",
    "boulder-foot--1":"boulder-foot","boulder-foot-1":"boulder-foot",
    "maul-stone-core":"maul-stone-core"
  };
  const surfaces=[];
  function buildSurface(name,profile,seed,hammer=false){
    const sides=hammer?12:28;
    const p=[],uv=[],color=[],indices=[];
    const detail=(t,a)=>{
      const faceted=hammer?Math.cos(a*6+seed*.14)*.028:0;
      const muscle=Math.sin(a*3+seed*.31+t*2.7)*.022;
      const tendon=Math.cos(a*7-seed*.12+t*5.9)*.012;
      return 1+faceted+muscle+tendon;
    };
    for(let i=0;i<profile.length;i++){
      const [h,rx,rz,cx,cz]=profile[i];
      for(let j=0;j<=sides;j++){
        const a=j/sides*Math.PI*2, wave=detail(i,a);
        const backBump=name==="bent-upper-back"&&Math.sin(a)<-.3?-.065*Math.sin(a):0;
        const snout=name==="head"&&Math.sin(a)>.15?(.08+.08*Math.max(0,1-Math.abs(h+.23)*3))*Math.sin(a)**4:0;
        const knuckle=name==="boulder-foot"&&Math.sin(a)>.5?Math.sin(a)*.075:0;
        const x=cx+Math.cos(a)*rx*wave;
        const z=cz+Math.sin(a)*rz*wave+backBump+snout+knuckle;
        const pos=hammer?[h,x,z]:[x,h,z];
        p.push(...pos);uv.push(j/sides,i/(profile.length-1));
        const contour=.88+.1*Math.max(0,Math.sin(a))+.06*Math.sin(h*9+a*3+seed);
        const scar=.93+.07*Math.sin(i*2.1+j*1.7+seed*1.3);
        const shade=Math.max(.61,Math.min(1.05,contour*scar));
        color.push(shade,shade*.95,shade*.90,1);
      }
    }
    const step=sides+1;
    for(let i=0;i<profile.length-1;i++)for(let j=0;j<sides;j++){
      const a=i*step+j,b=a+1,c=a+step,d=c+1;
      // Hammer oriented along X, side rings retain the same winding.
      if(hammer)indices.push(a,b,c,b,d,c);
      else indices.push(a,c,b,b,c,d);
    }
    // Close the two ends with physically modeled caps, not unsealed skins.
    for(const end of [0,profile.length-1]){
      const [h,, ,cx,cz]=profile[end],center=p.length/3;
      if(hammer)p.push(h,cx,cz);
      else p.push(cx,h,cz);
      uv.push(.5,end===0?0:1);color.push(.75,.72,.68,1);
      for(let j=0;j<sides;j++){
        const a=end*step+j,b=a+1;
        if(hammer){if(end===0)indices.push(center,b,a);else indices.push(center,a,b);}
        else {if(end===0)indices.push(center,a,b);else indices.push(center,b,a);}
      }
    }
    const normals=new Array(p.length).fill(0);
    for(let i=0;i<indices.length;i+=3){
      const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
      const ab=[p[b]-p[a],p[b+1]-p[a+1],p[b+2]-p[a+2]];
      const ac=[p[c]-p[a],p[c+1]-p[a+1],p[c+2]-p[a+2]];
      const n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
      for(const k of [a,b,c]){normals[k]+=n[0];normals[k+1]+=n[1];normals[k+2]+=n[2];}
    }
    for(let i=0;i<normals.length;i+=3){
      const len=Math.hypot(normals[i],normals[i+1],normals[i+2])||1;
      for(let j=0;j<3;j++)normals[i+j]/=len;
    }
    return {name,p,normals,uv,color,indices};
  }
  let serial=0;for(const [name,profileId] of Object.entries(assignments))
    surfaces.push(buildSurface(name,profiles[profileId],++serial,profileId==="maul-stone-core"));
  const buffer=[],bufferViews=[],accessors=[],meshes=[],nodes=[];
  const write=(data,componentType,type,target)=>{
    while(buffer.length%4)buffer.push(0);
    const offset=buffer.length,components=type==="SCALAR"?1:type==="VEC2"?2:type==="VEC3"?3:4;
    if(componentType===5126){
      const v=new DataView(new ArrayBuffer(4));
      for(const n of data){v.setFloat32(0,n,true);buffer.push(...new Uint8Array(v.buffer));}
    }else{
      for(const n of data)buffer.push(n&255,(n>>8)&255);
    }
    const length=buffer.length-offset;
    const bv=bufferViews.push({buffer:0,byteOffset:offset,byteLength:length,target})-1;
    const ac={bufferView:bv,componentType,count:data.length/components,type};
    if(type==="VEC3"&&target===34962){
      const minima=[Infinity,Infinity,Infinity],maxima=[-Infinity,-Infinity,-Infinity];
      for(let i=0;i<data.length;i+=3)for(let k=0;k<3;k++){
        minima[k]=Math.min(minima[k],data[i+k]);maxima[k]=Math.max(maxima[k],data[i+k]);
      }
      ac.min=minima;ac.max=maxima;
    }
    return accessors.push(ac)-1;
  };
  for(const m of surfaces){
    const pos=write(m.p,5126,"VEC3",34962);
    const normal=write(m.normals,5126,"VEC3",34962);
    const tex=write(m.uv,5126,"VEC2",34962);
    const color=write(m.color,5126,"VEC4",34962);
    const idx=write(m.indices,5123,"SCALAR",34963);
    meshes.push({name:"sculpt-"+m.name,primitives:[{attributes:{POSITION:pos,NORMAL:normal,TEXCOORD_0:tex,COLOR_0:color},indices:idx,material:0}]});
    nodes.push({name:"sculpt-"+m.name,mesh:meshes.length-1});
  }
  while(buffer.length%4)buffer.push(0);
  const asset={asset:{version:"2.0",generator:"Dungeon Shop Master anatomical sculpt authoring v1"},scene:0,scenes:[{nodes:nodes.map((_,i)=>i)}],nodes,meshes,
    materials:[{name:"sculpt-preview-ash",doubleSided:true,pbrMetallicRoughness:{baseColorFactor:[.70,.67,.63,1],metallicFactor:0,roughnessFactor:1}}],
    buffers:[{byteLength:buffer.length}],bufferViews,accessors};
  const json=JSON.stringify(asset),jsonBytes=[];
  for(let i=0;i<json.length;i++)jsonBytes.push(json.charCodeAt(i));
  while(jsonBytes.length%4)jsonBytes.push(32);
  const total=12+8+jsonBytes.length+8+buffer.length,out=new Uint8Array(total),dv=new DataView(out.buffer);
  dv.setUint32(0,0x46546c67,true);dv.setUint32(4,2,true);dv.setUint32(8,total,true);
  dv.setUint32(12,jsonBytes.length,true);dv.setUint32(16,0x4e4f534a,true);
  out.set(jsonBytes,20);
  const binHeader=20+jsonBytes.length;
  dv.setUint32(binHeader,buffer.length,true);dv.setUint32(binHeader+4,0x004e4942,true);
  out.set(buffer,binHeader+8);
  return out;
};
const bytes=buildCaveTrollGlb();
writeFileSync(new URL("../../public/assets/models/ashen-mauler-sculpt.glb",import.meta.url),bytes);
console.log("Wrote "+bytes.length+" bytes of original Level 6 sculpt geometry.");
