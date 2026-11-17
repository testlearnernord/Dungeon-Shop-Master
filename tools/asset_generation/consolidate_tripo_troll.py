#!/usr/bin/env python3
"""Build a compact, curated GLB from the owner's original Tripo export.

Usage:
    python tools/asset_generation/consolidate_tripo_troll.py INPUT.glb OUTPUT.glb --resize-color

Python 3; optional Pillow for --resize-color: pip install Pillow.
Never invents animations. Selects existing clips and leaves the source intact.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import io
import json
import struct
from pathlib import Path

# Stable semantic names for the usable/candidate clips. Other source clips
# remain in the owner's archival export. Several failed text-to-motion "walk"
# requests are intentionally omitted because their feet hardly move.
CURATION: dict[str, str] = {
    "idle_combat": "Wütende Idle Position Troll.001",
    "walk_heavy": "walk.001",
    "walk_aggressive": "walking aggresivly, ready for combat, Arms and Hands down b.001",
    "run_charge": "run.001",  # never substitute for normal boss walk
    "attack_2h_swing": "Hält einen riesigen 2H Hammer in der Hand und schlägt volle K",
    "attack_slam": "Schlägt mit dem Riesigen 2 Hand hammer auf den Boden, eine gew",
    "ready_2h_weapon": "Hält einen riesiegen 2 H Hammer in der Hand und aimt auf den S",
    "hit_light": "hit_to_body_01.001",
    "hit_heavy": "hit_to_body_02.001",
    "stagger": "Staggered by a Hit.001",
    "roar": "angry_03.001",
    "death_fall": "fall.001",
}

GLB_JSON = 0x4E4F534A
GLB_BIN = 0x004E4942


def unpack_glb(data: bytes) -> tuple[dict, bytes]:
    if len(data) < 20 or data[:4] != b"glTF":
        raise ValueError("Not a glTF binary (.glb)")
    _, version, length = struct.unpack_from("<4sII", data)
    if version != 2 or length != len(data):
        raise ValueError("Invalid GLB header")
    offset = 12
    doc = None
    binary = None
    while offset < len(data):
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk = data[offset:offset + chunk_length]
        if len(chunk) != chunk_length:
            raise ValueError("Truncated GLB chunk")
        if chunk_type == GLB_JSON:
            doc = json.loads(chunk.decode("utf-8"))
        elif chunk_type == GLB_BIN:
            binary = chunk
        offset += chunk_length
    if doc is None or binary is None:
        raise ValueError("GLB must have JSON and BIN chunks")
    return doc, binary


def write_glb(doc: dict, binary: bytes, path: Path) -> None:
    doc["buffers"] = [{"byteLength": len(binary)}]
    json_chunk = json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    json_chunk += b" " * (-len(json_chunk) % 4)
    binary += b"\0" * (-len(binary) % 4)
    total = 12 + 8 + len(json_chunk) + 8 + len(binary)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as stream:
        stream.write(struct.pack("<4sII", b"glTF", 2, total))
        stream.write(struct.pack("<II", len(json_chunk), GLB_JSON))
        stream.write(json_chunk)
        stream.write(struct.pack("<II", len(binary), GLB_BIN))
        stream.write(binary)


def curate(source: Path, destination: Path, resize_color: bool = False) -> dict:
    input_bytes = source.read_bytes()
    doc, data = unpack_glb(input_bytes)
    animations = doc.get("animations", [])
    by_name = {clip["name"]: clip for clip in animations}
    missing = [name for name in CURATION.values() if name not in by_name]
    if missing:
        raise ValueError("Missing source animations: " + ", ".join(missing))
    if len(animations) < len(CURATION) or len(doc.get("skins", [])) != 1:
        raise ValueError("Expected a skinned, animated Tripo export")

    doc["animations"] = []
    for readable_name, source_name in CURATION.items():
        clip = copy.deepcopy(by_name[source_name])
        clip["name"] = readable_name
        doc["animations"].append(clip)

    old_accessors = doc["accessors"]
    needed_accessors: set[int] = set()
    for mesh in doc.get("meshes", []):
        for primitive in mesh["primitives"]:
            needed_accessors.update(primitive["attributes"].values())
            if "indices" in primitive:
                needed_accessors.add(primitive["indices"])
            for target in primitive.get("targets", []):
                needed_accessors.update(target.values())
    for skin in doc.get("skins", []):
        if "inverseBindMatrices" in skin:
            needed_accessors.add(skin["inverseBindMatrices"])
    for clip in doc["animations"]:
        for sampler in clip["samplers"]:
            needed_accessors.add(sampler["input"])
            needed_accessors.add(sampler["output"])

    sorted_accessors = sorted(needed_accessors)
    accessor_map = {old: new for new, old in enumerate(sorted_accessors)}
    doc["accessors"] = [copy.deepcopy(old_accessors[i]) for i in sorted_accessors]

    for mesh in doc.get("meshes", []):
        for primitive in mesh["primitives"]:
            primitive["attributes"] = {
                key: accessor_map[val]
                for key, val in primitive["attributes"].items()
            }
            if "indices" in primitive:
                primitive["indices"] = accessor_map[primitive["indices"]]
            for target in primitive.get("targets", []):
                for key, val in list(target.items()):
                    target[key] = accessor_map[val]
    for skin in doc["skins"]:
        if "inverseBindMatrices" in skin:
            skin["inverseBindMatrices"] = accessor_map[skin["inverseBindMatrices"]]
    for clip in doc["animations"]:
        for sampler in clip["samplers"]:
            sampler["input"] = accessor_map[sampler["input"]]
            sampler["output"] = accessor_map[sampler["output"]]

    old_views = doc["bufferViews"]
    needed_views = {
        accessor["bufferView"]
        for accessor in doc["accessors"]
        if "bufferView" in accessor
    }
    for image in doc.get("images", []):
        if "bufferView" in image:
            needed_views.add(image["bufferView"])
    if any("sparse" in accessor for accessor in doc["accessors"]):
        raise ValueError("Sparse accessors not supported by this focused tool")
    view_list = sorted(needed_views)
    view_map = {old: new for new, old in enumerate(view_list)}

    image_bytes: dict[int, bytes] = {}
    if resize_color:
        try:
            from PIL import Image
        except ImportError as exc:
            raise RuntimeError("Install Pillow to use --resize-color") from exc
        for image in doc.get("images", []):
            if ("bufferView" not in image
                    or image.get("mimeType") != "image/jpeg"
                    or "BaseColor" not in image.get("name", "")):
                continue
            view = old_views[image["bufferView"]]
            block = data[view.get("byteOffset", 0):
                         view.get("byteOffset", 0) + view["byteLength"]]
            with Image.open(io.BytesIO(block)) as picture:
                if max(picture.size) <= 2048:
                    continue
                scaled = picture.copy()
                scaled.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
                buffer = io.BytesIO()
                scaled.save(buffer, format="JPEG", quality=89, subsampling=0, optimize=True)
                image_bytes[image["bufferView"]] = buffer.getvalue()

    binary = bytearray()
    new_views = []
    for old_index in view_list:
        original = old_views[old_index]
        block = image_bytes.get(old_index)
        if block is None:
            start = original.get("byteOffset", 0)
            block = data[start:start + original["byteLength"]]
        binary.extend(b"\0" * (-len(binary) % 4))
        view = copy.deepcopy(original)
        view["byteOffset"] = len(binary)
        view["byteLength"] = len(block)
        binary.extend(block)
        new_views.append(view)
    doc["bufferViews"] = new_views
    for accessor in doc["accessors"]:
        if "bufferView" in accessor:
            accessor["bufferView"] = view_map[accessor["bufferView"]]
    for image in doc.get("images", []):
        if "bufferView" in image:
            image["bufferView"] = view_map[image["bufferView"]]

    doc.setdefault("asset", {}).setdefault("extras", {})["DSM_Curation"] = {
        "sourceSha256": hashlib.sha256(input_bytes).hexdigest(),
        "qualityStatus": "candidate; inspect all clips in game before assigning combat phases",
        "policy": "No unverified walking prompts; root motion not used for boss navigation",
    }
    write_glb(doc, bytes(binary), destination)
    output_bytes = destination.read_bytes()
    check, bin_out = unpack_glb(output_bytes)
    assert len(check["animations"]) == len(CURATION)
    assert len(check["skins"][0]["joints"]) == len(doc["skins"][0]["joints"])
    assert max(view.get("byteOffset", 0) + view["byteLength"]
               for view in check["bufferViews"]) <= len(bin_out)
    assert all(
        0 <= accessor["bufferView"] < len(check["bufferViews"])
        for accessor in check["accessors"]
        if "bufferView" in accessor
    )
    return {
        "sourceSha256": hashlib.sha256(input_bytes).hexdigest(),
        "outputSha256": hashlib.sha256(output_bytes).hexdigest(),
        "sourceBytes": len(input_bytes),
        "outputBytes": len(output_bytes),
        "sourceClips": len(animations),
        "curatedClips": len(check["animations"]),
        "skinningJoints": len(check["skins"][0]["joints"]),
        "animationMap": CURATION,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--resize-color", action="store_true")
    args = parser.parse_args()
    print(json.dumps(curate(args.source, args.destination, args.resize_color),
                     indent=2, ensure_ascii=False))
