import test from "node:test";
import assert from "node:assert/strict";
import {generateExpeditionLayout} from "../../src/game/dungeonLayout.ts";
import {advanceDungeonMonsterWorld}
  from "../../src/game/dungeonMonsterWorld.ts";
import {emptySpatialDungeonWorld}
  from "../../src/game/spatialDungeonExploration.ts";
import {liveFloorFeatureIdentity,dungeonSiteDisplay,dungeonSiteMapColor}
  from "../../src/game/liveFloorFeatureIdentity.ts";

test("Galvik's Table detects first-live-pack initialization even if no site was resolved",()=>{
  const layout=generateExpeditionLayout(7351,1);
  const initial={resolved:[] as string[],monsters:[]};
  const first=advanceDungeonMonsterWorld(emptySpatialDungeonWorld(),layout,1,0);
  assert(first.monsters?.length);
  assert.notEqual(liveFloorFeatureIdentity(initial),
    liveFloorFeatureIdentity({resolved:[],monsters:first.monsters}));
});

test("a moving Ghoul reuses its existing mesh rather than rebuilding it per cell",()=>{
  const layout=generateExpeditionLayout(7351,1);
  const original=advanceDungeonMonsterWorld(emptySpatialDungeonWorld(),layout,1,0);
  const monster=original.monsters![0];
  const changed={...monster,x:monster.x+1,mode:"CHASING" as const,
    target:{x:monster.x+2,z:monster.z},lastMoveTick:400};
  const moved={resolved:[],monsters:[changed,...original.monsters!.slice(1)]};
  assert.equal(liveFloorFeatureIdentity({
      resolved:original.resolvedFeatureIds,monsters:original.monsters,
    }),
    liveFloorFeatureIdentity(moved));
});

test("spawn generation, death and renewal rebuild only the correct feature entities",()=>{
  const layout=generateExpeditionLayout(7351,1);
  const original=advanceDungeonMonsterWorld(emptySpatialDungeonWorld(),layout,1,0);
  const monster=original.monsters![0];
  const killed={resolved:[monster.id],
    monsters:original.monsters!.filter(m=>m.id!==monster.id)};
  assert.notEqual(liveFloorFeatureIdentity({
      resolved:original.resolvedFeatureIds,monsters:original.monsters,
    }),
    liveFloorFeatureIdentity(killed));
  const reborn={resolved:[],monsters:original.monsters!.map(m=>
    m.id===monster.id?{...m,siteCycle:m.siteCycle+1}:m)};
  assert.notEqual(liveFloorFeatureIdentity({
      resolved:original.resolvedFeatureIds,monsters:original.monsters,
    }),
    liveFloorFeatureIdentity(reborn));
  const shuffled={resolved:[],monsters:[...original.monsters!].reverse()};
  assert.equal(liveFloorFeatureIdentity({
      resolved:original.resolvedFeatureIds,monsters:original.monsters,
    }),
    liveFloorFeatureIdentity(shuffled));
});

test("site visuals retain spent chests and traps without retaining defeated actors",()=>{
  for(const kind of ["treasure","trap"]){
    assert.equal(dungeonSiteDisplay(kind,false),"active");
    assert.equal(dungeonSiteDisplay(kind,true),"spent");
    assert.notEqual(dungeonSiteMapColor(kind,false),dungeonSiteMapColor(kind,true));
    assert(dungeonSiteMapColor(kind,true));
    // A regenerated or rewound site is active again from its own snapshot.
    assert.equal(dungeonSiteDisplay(kind,false),"active");
  }
  assert.equal(dungeonSiteDisplay("monster",true),"hidden");
  assert.equal(dungeonSiteMapColor("monster",true),null);
  assert.equal(dungeonSiteMapColor("stair-descend",false),"#e7bf75");
});
