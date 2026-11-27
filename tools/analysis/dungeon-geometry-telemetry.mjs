// Offline measurements only. The canonical layout and committed positions
// remain the sole authorities. No new pathfinding or game mutations.
import {dungeonNeighbors,dungeonDownStair,dungeonShortestPath,tileAt} from "../../src/game/dungeonLayout.ts";

const index=(layout,p)=>p.z*layout.width+p.x;
const point=(layout,i)=>({x:i%layout.width,z:Math.floor(i/layout.width)});
const inRoom=(room,p)=>Math.abs(p.x-room.x)<room.width/2&&Math.abs(p.z-room.z)<room.height/2;

export function describeDungeonGeometry(layout){
  const walkable=layout.tiles.flatMap((tile,i)=>tile==="wall"?[]:[i]);
  const stair=dungeonDownStair(layout);
  const stairIndex=index(layout,stair),entranceIndex=index(layout,layout.entrance);
  const features=new Set(layout.features.map(f=>index(layout,f)));
  let degreeSum=0;
  const deadEnds=[],emptyDeadEnds=[];
  for(const i of walkable){
    const degree=dungeonNeighbors(layout,point(layout,i)).length;
    degreeSum+=degree;
    if(degree===1){
      deadEnds.push(i);
      if(i!==entranceIndex&&i!==stairIndex&&!features.has(i))emptyDeadEnds.push(i);
    }
  }
  const seen=new Set([entranceIndex]),queue=[entranceIndex];
  for(let n=0;n<queue.length;n++){
    for(const p of dungeonNeighbors(layout,point(layout,queue[n]))){
      const i=index(layout,p);
      if(!seen.has(i)){seen.add(i);queue.push(i);}
    }
  }
  const unreachable=walkable.filter(i=>!seen.has(i));
  if(unreachable.length)throw Error("Disconnected dungeon floor "+layout.floor);
  return {floor:layout.floor,seed:layout.seed,width:layout.width,height:layout.height,
    entrance:layout.entrance,downStair:stair,walkableTiles:walkable.length,
    corridorTiles:layout.tiles.filter(t=>t==="corridor").length,
    roomTiles:layout.tiles.filter(t=>t==="room").length,
    roomCount:layout.rooms.length,roomSizes:layout.rooms.map(r=>({id:r.id,width:r.width,height:r.height})),
    gridCycleRank:degreeSum/2-walkable.length+1,
    deadEndTiles:deadEnds.length,emptyDeadEndTiles:emptyDeadEnds.length,
    emptyDeadEndIndices:emptyDeadEnds,
    stairDistance:dungeonShortestPath(layout,layout.entrance,stair).length-1,
    features:Object.fromEntries(["monster","treasure","trap"].map(kind=>[kind,layout.features.filter(f=>f.kind===kind).length]))};
}

export function createDungeonGeometryTelemetry(layouts){
  const floors=new Map([...layouts].map(([floor,layout])=>[floor,{
    layout,geometry:describeDungeonGeometry(layout),heat:new Uint32Array(layout.tiles.length),
    rooms:layout.rooms.map(room=>({room,samples:0})),heroSamples:0,stationarySamples:0
  }]));
  let lastTick=null,previous=new Map(),sampleCount=0;
  function sample(state){
    const tick=state.worldClock.tick;
    if(tick===lastTick)return;
    if(lastTick!==null&&tick<lastTick)throw Error("Dungeon geometry sample clock reversed");
    lastTick=tick;sampleCount++;
    const current=new Map();
    const heroes=new Map(state.adventurers.map(h=>[h.id,h]));
    for(const entry of state.dungeonWorlds){
      const f=floors.get(entry.floor);
      if(!f)continue;
      for(const p of entry.world.heroes){
        const hero=heroes.get(p.heroId);
        // Persisted exploration memories survive travel and death. Only
        // count a hero whose committed current place is this numbered floor.
        if(!hero||hero.status==="dead"||hero.floor!==entry.floor)continue;
        if(!Number.isInteger(p.x)||!Number.isInteger(p.z)||tileAt(f.layout,p.x,p.z)==="wall")
          throw Error("Invalid committed dungeon position: "+p.heroId+" floor "+entry.floor);
        const i=index(f.layout,p),key=entry.floor+":"+i;
        f.heat[i]++;f.heroSamples++;
        if(previous.get(p.heroId)===key)f.stationarySamples++;
        current.set(p.heroId,key);
        for(const row of f.rooms)if(inRoom(row.room,p))row.samples++;
      }
    }
    previous=current;
  }
  function report(){
    return {sampleCount,method:"Distinct clock-tick snapshots; occupancy, not exact movement or dwell. Stationary samples include legitimate combat/waiting and are not stuck-hero counts. Grid cycles include room interiors, not just alternate inter-room routes.",
      floors:[...floors.values()].map(f=>{
        const occupiedTiles=f.heat.reduce((n,v)=>n+Number(v>0),0);
        return {...f.geometry,heroSamples:f.heroSamples,stationarySamples:f.stationarySamples,
          occupiedTiles,coverage:occupiedTiles/Math.max(1,f.geometry.walkableTiles),
          roomSamples:f.rooms.map(row=>({id:row.room.id,samples:row.samples})),
          heatmap:Array.from(f.heat)};
      })};
  }
  return {sample,report};
}
