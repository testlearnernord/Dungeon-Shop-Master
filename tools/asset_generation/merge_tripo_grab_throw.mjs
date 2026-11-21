/**
 * Build-time GLB animation graft. Keeps the curated 12-clip mesh/material/rig,
 * adds only the animation binary views from the owner's 2-clip Tripo export.
 * The original exported .glb remains byte-for-byte under assets/tripo/source/.
 *
 * No external tool, blender conversion or full second mesh download at runtime.
 * The generated, untracked combat GLB is served by Vite and GitHub Pages.
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const curated = resolve(root, "public/assets/models/ashen-tunnel-mauler-tripo.glb");
const additions = resolve(root, "assets/tripo/source/tripo_convert_ad846d87-3b98-4c37-a128-20fc302b37c7.glb");
const output = resolve(root, "public/assets/models/ashen-tunnel-mauler-tripo-combat.glb");
const CLIPS = new Map([
  ["Big Cave Troll who grabs and holds the enemy hero with one hand", "grab_hero"],
  ["Big Cave Troll who throws the grabbed Hero.001", "throw_hero"],
]);

function glb(path) {
  const bytes = readFileSync(path);
  if (bytes.toString("ascii", 0, 4) !== "glTF" ||
      bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length)
    throw Error("Invalid GLB: " + path);
  let offset = 12, json, bin;
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (offset + 8 + length > bytes.length) throw Error("Truncated GLB: " + path);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString("utf8"));
    if (type === 0x004e4942) bin = data;
    offset += 8 + length;
  }
  if (!json || !bin || json.buffers?.length !== 1)
    throw Error("Expected an embedded single-buffer GLB: " + path);
  return { json, bin };
}
const base = glb(curated);
const source = glb(additions);
if (base.json.skins?.[0]?.joints?.length !== 65 ||
    source.json.skins?.[0]?.joints?.length !== 65)
  throw Error("Grab/Throw source must match the curated 65-bone skeleton");
const destinationNodes = new Map();
for (let i = 0; i < base.json.nodes.length; i++) {
  const name = base.json.nodes[i].name;
  if (destinationNodes.has(name)) throw Error("Duplicate curated node: " + name);
  destinationNodes.set(name, i);
}
const canonicalJoints = base.json.skins[0].joints.map(i => base.json.nodes[i].name);
const addedJoints = source.json.skins[0].joints.map(i => source.json.nodes[i].name);
if (canonicalJoints.length !== addedJoints.length ||
    canonicalJoints.some(n => !addedJoints.includes(n)))
  throw Error("Tripo source joints do not match curated bones");
if (source.json.animations?.length !== CLIPS.size ||
    source.json.animations.some(a => !CLIPS.has(a.name)))
  throw Error("Expected exactly the named Grab and Throw source clips");
if (base.json.animations.some(a => CLIPS.has(a.name) ||
    [...CLIPS.values()].includes(a.name)))
  throw Error("Refusing to graft duplicate animation clips");
const json = structuredClone(base.json);
const parts = [base.bin];
let cursor = base.bin.length;
const viewMap = new Map(), accessorMap = new Map();
function align() {
  const pad = (4 - (cursor % 4)) % 4;
  if (pad) { parts.push(Buffer.alloc(pad)); cursor += pad; }
}
function graftAccessor(index) {
  if (accessorMap.has(index)) return accessorMap.get(index);
  const accessor = source.json.accessors[index];
  if (!accessor || accessor.sparse || accessor.bufferView === undefined)
    throw Error("Unsupported animation accessor: " + index);
  let view = viewMap.get(accessor.bufferView);
  if (view === undefined) {
    const original = source.json.bufferViews[accessor.bufferView];
    if (!original || original.buffer !== 0) throw Error("Invalid source buffer view");
    const begin = original.byteOffset ?? 0;
    const end = begin + original.byteLength;
    if (end > source.bin.length) throw Error("Out-of-bounds animation samples");
    align();
    view = json.bufferViews.length;
    json.bufferViews.push({ ...original, buffer: 0, byteOffset: cursor });
    parts.push(source.bin.subarray(begin, end));
    cursor += original.byteLength;
    viewMap.set(accessor.bufferView, view);
  }
  const next = json.accessors.length;
  json.accessors.push({ ...accessor, bufferView: view });
  accessorMap.set(index, next);
  return next;
}
for (const sourceAnimation of source.json.animations) {
  const samplers = sourceAnimation.samplers.map(s => ({
    ...s, input: graftAccessor(s.input), output: graftAccessor(s.output),
  }));
  const channels = sourceAnimation.channels.map(channel => {
    const name = source.json.nodes[channel.target.node]?.name;
    const target = destinationNodes.get(name);
    if (target === undefined || !canonicalJoints.includes(name))
      throw Error("Animation drives a bone absent from curated rig: " + name);
    return { ...channel, target: { ...channel.target, node: target } };
  });
  json.animations.push({ name: CLIPS.get(sourceAnimation.name), samplers, channels });
}
align();
json.buffers[0].byteLength = cursor;
const bin = Buffer.concat(parts);
const jsonBytes = Buffer.from(JSON.stringify(json));
const jsonPad = (4 - jsonBytes.length % 4) % 4;
const jsonChunk = Buffer.concat([jsonBytes, Buffer.alloc(jsonPad, 0x20)]);
const header = Buffer.alloc(12), chunkHeaders = [Buffer.alloc(8), Buffer.alloc(8)];
header.write("glTF", 0); header.writeUInt32LE(2,4);
header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + bin.length,8);
chunkHeaders[0].writeUInt32LE(jsonChunk.length,0);
chunkHeaders[0].writeUInt32LE(0x4e4f534a,4);
chunkHeaders[1].writeUInt32LE(bin.length,0);
chunkHeaders[1].writeUInt32LE(0x004e4942,4);
const built = Buffer.concat([header,chunkHeaders[0],jsonChunk,chunkHeaders[1],bin]);
if (!existsSync(output) || !readFileSync(output).equals(built)) {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output,built);
}
console.log("Tripo model prepared: " + json.animations.length +
  " clips (" + canonicalJoints.length + " matched joints), " +
  built.length + " bytes");
