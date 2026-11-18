import {PointLight} from "@babylonjs/core/Lights/pointLight";
import {Color3} from "@babylonjs/core/Maths/math.color";
import {Vector3} from "@babylonjs/core/Maths/math.vector";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import {Scene} from "@babylonjs/core/scene";
import type {DungeonRoom} from "./dungeonLayout.ts";
import {
  CRYPT_STONE,CRYPT_EMBER,cryptRelicPositions,
} from "./ghoulCryptPlan.ts";
import type {DungeonRoomDecoration} from "./dungeonReplayScene.ts";

/** Distinct burial crypt styling for the normal monster dungeon, not the
 * Cave Troll's magma boss arena. Entire art cluster is fogged with its tile. */
export function createGhoulCryptRoom(
  scene:Scene,room:DungeonRoom,world:Vector3,index:number,
):DungeonRoomDecoration{
  const stone=new StandardMaterial("crypt-pillar-stone-"+index,scene);
  stone.diffuseColor=Color3.FromHexString(CRYPT_STONE);
  stone.specularColor=new Color3(.03,.035,.025);
  const rune=new StandardMaterial("crypt-rune-glow-"+index,scene);
  rune.diffuseColor=Color3.FromHexString(CRYPT_EMBER);
  rune.emissiveColor=new Color3(.18,.28,.14);
  const base=MeshBuilder.CreateBox("dungeon-crypt-room-"+index,{
    width:1.18,height:.21,depth:1.75,
  },scene);
  const relic=cryptRelicPositions(room)[index%4];
  base.position.set(world.x+relic.x,.18,world.z+relic.z);
  base.material=stone;
  base.isPickable=false;base.checkCollisions=false;
  const lid=MeshBuilder.CreateBox("dungeon-crypt-lid-"+index,{
    width:1.27,height:.18,depth:1.89,
  },scene);
  lid.parent=base;lid.position.y=.24;
  lid.rotation.z=index%2===0?-.06:.08;
  lid.material=stone;
  lid.isPickable=false;lid.checkCollisions=false;

  // Weathered square pillars frame the chamber, not the actual combat
  // collision arena. Their bases sit near outer edges of room tiles.
  for(const [j,pos] of cryptRelicPositions(room).entries()){
    if(j===index%4)continue;
    const broken=j%2===0;
    const pillar=MeshBuilder.CreateCylinder("dungeon-crypt-pillar-"+index+"-"+j,{
      diameterTop:broken?.47:.61,diameterBottom:.65,
      height:broken?1.45:2.55,tessellation:6,
    },scene);
    pillar.parent=base;
    pillar.position.set(pos.x-relic.x,
      (broken?1.45:2.55)/2-.08,pos.z-relic.z);
    pillar.material=stone;pillar.isPickable=false;pillar.checkCollisions=false;
  }
  const candle=MeshBuilder.CreateCylinder("dungeon-crypt-lamp-"+index,{
    diameter:.36,height:.55,tessellation:8,
  },scene);
  candle.parent=base;
  candle.position.set(.12,.55,-.48);
  candle.material=rune;candle.isPickable=false;candle.checkCollisions=false;
  const flame=MeshBuilder.CreateSphere("dungeon-crypt-ghostflame-"+index,{
    diameter:.26,segments:8,
  },scene);
  flame.parent=base;
  flame.position.set(.12,.96,-.48);
  flame.material=rune;flame.isPickable=false;flame.checkCollisions=false;

  const light=new PointLight("dungeon-torchlight-"+index,
    new Vector3(base.position.x+.12,2.2,base.position.z-.48),scene);
  light.diffuse=new Color3(.64,.83,.48);
  light.intensity=1.6;light.range=12;
  return {x:room.x,z:room.z,mesh:base,light};
}
