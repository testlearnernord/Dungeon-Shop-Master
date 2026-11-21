import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync} from "node:child_process";
import {existsSync,readFileSync} from "node:fs";
import {createHash} from "node:crypto";
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

test("Troll grab and throw original source is byte-identical and lives under assets/tripo/source",()=>{
  const root=process.cwd();
  const source=resolve(root,"assets/tripo/source/tripo_convert_ad846d87-3b98-4c37-a128-20fc302b37c7.glb");
  assert.equal(existsSync(resolve(root,"tripo_convert_ad846d87-3b98-4c37-a128-20fc302b37c7.glb")),false,
    "Original Tripo export belongs in assets/tripo/source, not repository root");
  assert.ok(existsSync(source),"The original Grab/Throw GLB is required on clean checkouts");
  const original=info(source);
  assert.equal(original.bytes.length,11449256);
  const gitBlob=createHash("sha1")
    .update("blob "+original.bytes.length+"\0")
    .update(original.bytes).digest("hex");
  assert.equal(gitBlob,"d1f42cc107cc733d94874c7315871373e0071f75");
  const manifest=JSON.parse(readFileSync(resolve(root,
    "assets/tripo/ashen-tunnel-mauler.manifest.json"),"utf8"));
  assert.equal(manifest.combatBuild.sourceFile,
    "assets/tripo/source/tripo_convert_ad846d87-3b98-4c37-a128-20fc302b37c7.glb");
  assert.equal(manifest.combatBuild.sourceBytes,11449256);
  assert.equal(manifest.combatBuild.sourceGitBlobSha,
    "d1f42cc107cc733d94874c7315871373e0071f75");
  assert.equal(original.json.skins[0].joints.length,65);
  assert.deepEqual(original.json.animations.map((animation:{name:string})=>animation.name),[
    "Big Cave Troll who grabs and holds the enemy hero with one hand",
    "Big Cave Troll who throws the grabbed Hero.001",
  ]);
});
