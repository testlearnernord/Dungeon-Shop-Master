import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const expected = [
  "barrel-torso", "bent-upper-back", "belly", "neck", "head", "nose",
  "upper-arm--1", "upper-arm-1", "forearm--1", "forearm-1",
  "thigh--1", "thigh-1", "shin--1", "shin-1",
  "boulder-foot--1", "boulder-foot-1", "maul-stone-core",
];

test("Cave Troll sculpt is a complete independent 17-part GLB with original vertex-painted surfaces", () => {
  const bytes = readFileSync(new URL(
    "../../public/assets/models/ashen-mauler-sculpt.glb", import.meta.url));
  assert.equal(bytes.toString("ascii", 0, 4), "glTF");
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonSize = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  const doc = JSON.parse(bytes.toString("utf8", 20, 20 + jsonSize));
  assert.equal(doc.asset.version, "2.0");
  assert.deepEqual(doc.meshes.map((m: { name: string }) => m.name),
    expected.map(name => "sculpt-" + name));
  assert.equal(doc.nodes.length, expected.length);
  assert.equal(doc.scenes[0].nodes.length, expected.length);
  for (const mesh of doc.meshes) {
    const primitive = mesh.primitives[0];
    assert.ok(doc.accessors[primitive.attributes.POSITION].count > 120,
      mesh.name + " has a volumetric anatomical surface");
    assert.ok(doc.accessors[primitive.indices].count > 250,
      mesh.name + " has actual triangles");
    for (const kind of ["NORMAL", "TEXCOORD_0", "COLOR_0"]) {
      assert.ok(Number.isInteger(primitive.attributes[kind]),
        mesh.name + " retains " + kind);
    }
  }
  const binaryHeader = 20 + jsonSize;
  assert.equal(bytes.readUInt32LE(binaryHeader + 4), 0x004e4942);
  assert.equal(bytes.readUInt32LE(binaryHeader) + binaryHeader + 8, bytes.length);
});
