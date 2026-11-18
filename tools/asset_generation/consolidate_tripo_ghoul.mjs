/**
 * Reproducibly graft the owner's single new Combat Idle animation onto the
 * original 14-clip Ghoul Tripo GLB. This is a preview candidate, NOT shipped.
 * Usage: node tools/asset_generation/consolidate_tripo_ghoul.mjs OUTPUT.glb
 * Never alters either archived source. Does not touch gameplay or public/.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

const root=resolve(import.meta.dirname,"../..");
const original=resolve(root,"assets/tripo/source/tripo_convert_2f6b9c66-0c5e-4c3b-8410-2277a099e788.glb");
const idle=resolve(root,"assets/tripo/source/tripo_convert_6edd4581-b0ef-49c3-9b0d-ebbee934e866.glb");
const target=process.argv[2];
if(!target) throw Error("Usage: node consolidate_tripo_ghoul.mjs OUTPUT.glb");
const destination=resolve(target);
if([original,idle].includes(destination))throw Error("Never overwrite archived Tripo sources");

function parseGLB(path) {
  const bytes=readFileSync(path);
  if(bytes.toString("ascii",0,4)!=="glTF" ||
     bytes.readUInt32LE(4)!==2 || bytes.readUInt32LE(8)!==bytes.length)
     throw Error("Invalid GLB header: "+path);
  let offset=12, json,bin;
  while(offset<bytes.length){
    const length=bytes.readUInt32LE(offset);
    const type=bytes.readUInt32LE(offset+4);
    if(offset+8+length>bytes.length)throw Error("Truncated chunk: "+path);
    const chunk=bytes.subarray(offset+8,offset+8+length);
    if(type===0x4e4f534a)json=JSON.parse(chunk.toString("utf8"));
    else if(type===0x004e4942)bin=chunk;
    offset+=8+length;
  }
  if(!json||!bin||json.buffers?.length!==1||!Array.isArray(json.animations))
    throw Error("Expected one-buffer animated GLB: "+path);
  return {json,bin};
}
const base=parseGLB(original), added=parseGLB(idle);
if(base.json.skins?.[0]?.joints?.length!==65 ||
   added.json.skins?.[0]?.joints?.length!==65 ||
   base.json.meshes?.length!==1 || added.json.meshes?.length!==1)
   throw Error("Unexpected Ghoul rig or mesh topology");
if(base.json.animations.length!==14 || added.json.animations.length!==1)
   throw Error("Expected 14 original clips and one separate Idle clip");
if(!added.json.animations[0].name?.startsWith("A feral undead ghoul stands in a low, hunched combat stance"))
   throw Error("The newer GLB is not the expected Combat Idle export");
const targetNames=new Map(base.json.nodes.map((node,index)=>[node.name,index]));
if(targetNames.size!==base.json.nodes.length)throw Error("Duplicate original node names");
const originalJoints=base.json.skins[0].joints.map(n=>base.json.nodes[n].name);
const newerJoints=added.json.skins[0].joints.map(n=>added.json.nodes[n].name);
if(originalJoints.some(name=>!newerJoints.includes(name)))
  throw Error("Idle export has incompatible skeleton names");
for(const [i,name] of originalJoints.entries()){
  const baseNode=base.json.nodes[base.json.skins[0].joints[i]];
  const newNode=added.json.nodes[added.json.skins[0].joints[newerJoints.indexOf(name)]];
  for(const key of ["translation","rotation","scale"]){
    const a=baseNode[key],b=newNode[key];
    if((!a)!==(!b) || (a&&b&&(a.length!==b.length || a.some((x,j)=>Math.abs(x-b[j])>1e-3))))
      throw Error("Incompatible rest pose at "+name+"."+key);
  }
}
const doc=structuredClone(base.json);
const parts=[base.bin], viewRemap=new Map(),accessorRemap=new Map();
let cursor=base.bin.length;
function align(){
  const padding=(-cursor)&3;
  if(padding){parts.push(Buffer.alloc(padding));cursor+=padding;}
}
function copyAccessor(index){
  if(accessorRemap.has(index))return accessorRemap.get(index);
  const acc=added.json.accessors?.[index];
  if(!acc||acc.bufferView===undefined||acc.sparse)
    throw Error("Unsupported idle animation accessor "+index);
  let mapped=viewRemap.get(acc.bufferView);
  if(mapped===undefined){
    const view=added.json.bufferViews?.[acc.bufferView];
    if(!view||view.buffer!==0)throw Error("Invalid idle bufferView");
    const begin=view.byteOffset??0,end=begin+view.byteLength;
    if(end>added.bin.length)throw Error("Idle buffer view out of bounds");
    align();
    mapped=doc.bufferViews.length;
    doc.bufferViews.push({...view,buffer:0,byteOffset:cursor});
    parts.push(added.bin.subarray(begin,end));
    cursor+=view.byteLength;
    viewRemap.set(acc.bufferView,mapped);
  }
  const next=doc.accessors.length;
  doc.accessors.push({...acc,bufferView:mapped});
  accessorRemap.set(index,next);
  return next;
}
const sourceClip=added.json.animations[0];
const samplers=sourceClip.samplers.map(s=>({
  ...s,input:copyAccessor(s.input),output:copyAccessor(s.output),
}));
const jointNames=new Set(originalJoints);
const channels=sourceClip.channels.map(channel=>{
  const name=added.json.nodes[channel.target.node]?.name;
  const node=targetNames.get(name);
  if(node===undefined||!jointNames.has(name))throw Error("Idle targets unrecognized joint "+name);
  return {...channel,target:{...channel.target,node}};
});
doc.animations.push({...sourceClip,name:"idle_combat",samplers,channels});
align();
doc.buffers[0].byteLength=cursor;
const bin=Buffer.concat(parts);
const jsonBuffer=Buffer.from(JSON.stringify(doc));
const jsonPadded=Buffer.concat([jsonBuffer,Buffer.alloc((-jsonBuffer.length)&3,0x20)]);
const header=Buffer.alloc(12),jHeader=Buffer.alloc(8),bHeader=Buffer.alloc(8);
header.write("glTF",0);header.writeUInt32LE(2,4);
header.writeUInt32LE(12+8+jsonPadded.length+8+bin.length,8);
jHeader.writeUInt32LE(jsonPadded.length,0);jHeader.writeUInt32LE(0x4e4f534a,4);
bHeader.writeUInt32LE(bin.length,0);bHeader.writeUInt32LE(0x004e4942,4);
mkdirSync(dirname(destination),{recursive:true});
writeFileSync(destination,Buffer.concat([header,jHeader,jsonPadded,bHeader,bin]));
console.log("Ghoul candidate GLB: 14 original clips + idle_combat, "+
  channels.length+" idle channels, "+cursor+" binary bytes; output "+destination);
