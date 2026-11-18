import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync, mkdtempSync, rmSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {resolve} from "node:path";

type GLBJson = {
  asset?:{version?:string};
  meshes?:Array<{primitives:Array<{indices?:number;attributes:Record<string,number>}>}>;
  accessors?:Array<{count:number;type:string}>;
  skins?:Array<{joints:number[]}>;
  animations?:Array<{name?:string;samplers?:Array<{input:number;output:number}>}>;
};
function readGLB(path:string) {
  const bytes=readFileSync(resolve(path));
  assert.equal(bytes.toString("ascii",0,4),"glTF");
  assert.equal(bytes.readUInt32LE(4),2);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  assert.equal(bytes.readUInt32LE(16),0x4e4f534a);
  const jsonLength=bytes.readUInt32LE(12);
  const doc=JSON.parse(bytes.toString("utf8",20,20+jsonLength)) as GLBJson;
  assert.equal(doc.asset?.version,"2.0");
  assert(doc.meshes?.length);
  assert(doc.skins?.length);
  assert(doc.animations?.length);
  const triangleCount=doc.meshes.reduce((count,mesh)=>count+mesh.primitives.reduce((n,p)=>
    n+(p.indices === undefined ? 0 : (doc.accessors?.[p.indices]?.count??0)/3),0),0);
  return {bytes,doc,triangleCount,
    clips:doc.animations.map((x,index)=>({index,name:x.name??"",samplers:x.samplers?.length||0}))};
}

test("Ghoul source archives preserve actual authored animation exports",()=>{
  const original=readGLB("assets/tripo/source/tripo_convert_2f6b9c66-0c5e-4c3b-8410-2277a099e788.glb");
  const latest=readGLB("assets/tripo/source/tripo_convert_6edd4581-b0ef-49c3-9b0d-ebbee934e866.glb");
  assert.equal(original.bytes.length,8196428);
  assert.equal(original.clips.length,14);
  assert.equal(original.doc.skins?.[0]?.joints.length,65);
  assert.equal(original.triangleCount,19789);
  assert.equal(latest.bytes.length,7106304);
  assert.equal(latest.doc.skins?.[0]?.joints.length,65);
  console.log("[ghoul-export-audit] "+JSON.stringify({
    latestBytes:latest.bytes.length,
    sourceClipCount:original.clips.length,
    newClipCount:latest.clips.length,
    newTriangleCount:latest.triangleCount,
    originalNames:original.clips.map(c=>c.name),
    latestNames:latest.clips.map(c=>c.name),
    omittedOriginalNames:original.clips.filter(c=>!latest.clips.some(n=>n.name===c.name)).map(c=>c.name),
    addedNames:latest.clips.filter(c=>!original.clips.some(n=>n.name===c.name)).map(c=>c.name),
  }));
  assert(latest.clips.length>0);
});

test("Ghoul Idle is grafted into the original rig without dropping attack clips",()=>{
  const directory=mkdtempSync(join(tmpdir(),"dsm-ghoul-"));
  try{
    const output=join(directory,"ghoul-candidate.glb");
    execFileSync(process.execPath,[
      resolve("tools/asset_generation/consolidate_tripo_ghoul.mjs"),output,
    ]);
    const result=readGLB(output);
    const initial=readGLB("assets/tripo/source/tripo_convert_2f6b9c66-0c5e-4c3b-8410-2277a099e788.glb");
    assert.equal(result.clips.length,15);
    assert.deepEqual(result.clips.slice(0,14).map(x=>x.name),initial.clips.map(x=>x.name));
    assert.equal(result.clips[14].name,"idle_combat");
    assert.equal(result.doc.skins?.[0]?.joints.length,65);
    assert.equal(result.triangleCount,19789);
    assert.equal(result.clips[14].samplers,195);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
