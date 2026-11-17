import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

function info(path:string) {
  const bytes=readFileSync(path);
  assert.equal(bytes.toString("ascii",0,4),"glTF");
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  const jsonLength=bytes.readUInt32LE(12);
  const json=JSON.parse(bytes.toString("utf8",20,20+jsonLength));
  const binaryStart=20+jsonLength;
  assert.equal(bytes.readUInt32LE(binaryStart+4),0x004e4942);
  assert.equal(bytes.readUInt32LE(binaryStart),json.buffers[0].byteLength);
  return {bytes,json};
}
test("curated 65-bone troll keeps original clips and gains both authored tracks",()=>{
  const root=process.cwd();
  execFileSync(process.execPath,[
    resolve(root,"tools/asset_generation/merge_tripo_grab_throw.mjs"),
  ],{cwd:root});
  const original=info(resolve(root,"public/assets/models/ashen-tunnel-mauler-tripo.glb"));
  const output=info(resolve(root,"public/assets/models/ashen-tunnel-mauler-tripo-combat.glb"));
  assert.equal(original.json.animations.length,12);
  assert.equal(output.json.animations.length,14);
  const originalNames=original.json.animations.map((a:{name:string})=>a.name);
  const outputNames=output.json.animations.map((a:{name:string})=>a.name);
  assert.deepEqual(outputNames.slice(0,12),originalNames);
  assert.deepEqual(outputNames.slice(-2),["grab_hero","throw_hero"]);
  assert.equal(output.json.skins[0].joints.length,65);
  assert.equal(output.json.meshes.length,original.json.meshes.length);
  assert.deepEqual(output.json.materials,original.json.materials);
  assert(output.bytes.length<original.bytes.length+500000,
    "only animation samples, not another 11MB character, should be appended");
  for(const animation of output.json.animations.slice(-2)){
    assert.equal(animation.channels.length,195);
    for(const channel of animation.channels){
      assert(output.json.nodes[channel.target.node]?.name?.startsWith("mixamorig:"));
    }
  }
});
