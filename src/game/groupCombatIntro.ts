import {sampleCinematicTrack,type CinematicFrame,
  type CinematicKeyframe,type CinematicVec3} from "./combatCinematic.ts";
import type {CombatantSpec,GroupReplayFrame} from "./groupCombat.ts";
import {BOSS_INTRO_SECONDS} from "./bossCinematic.ts";

/** Two genuinely different, presentation-only film treatments.
 * Normal fights enter quickly; authored bosses are revealed deliberately.
 * Neither camera route steps combat or uses a renderer-owned position. */
export const GROUP_COMBAT_INTRO_SECONDS=5.2;
export type CombatIntroKind="normal"|"boss";
export interface GroupIntroTrack {
  readonly fightId:string;
  readonly kind:CombatIntroKind;
  readonly duration:number;
  readonly keyframes:readonly CinematicKeyframe[];
  readonly heroIds:readonly string[];
  readonly monsterIds:readonly string[];
}
type XZ={readonly x:number;readonly z:number};
const eye=(x:number,y:number,z:number):CinematicVec3=>[x,y,z];
const center=(points:readonly XZ[]):XZ=>({
  x:points.reduce((sum,p)=>sum+p.x,0)/points.length,
  z:points.reduce((sum,p)=>sum+p.z,0)/points.length,
});
const distance=(a:XZ,b:XZ)=>Math.hypot(a.x-b.x,a.z-b.z);

/**
 * Camera layout is based on BOTH actual committed teams. The forward axis
 * points from heroes toward monsters. Lateral shots remain well-defined even
 * when those centers overlap (rare but legal after party movement).
 */
function combatAxis(heroes:XZ,monsters:XZ):{
  forward:XZ;side:XZ;
}{
  const dx=monsters.x-heroes.x,dz=monsters.z-heroes.z;
  const length=Math.hypot(dx,dz);
  const forward=length>0.001?{x:dx/length,z:dz/length}:{x:0,z:1};
  return {forward,side:{x:-forward.z,z:forward.x}};
}
export function createGroupCombatIntro(
  fightId:string,actors:readonly CombatantSpec[],
  committed:GroupReplayFrame,
):GroupIntroTrack {
  if(actors.length<2||!fightId)throw new RangeError("Combat cast required");
  const saved=new Map(committed.actors.map(a=>[a.id,a]));
  const at=(a:CombatantSpec):XZ=>{
    const p=saved.get(a.id);
    return p?{x:p.x,z:p.z}:{x:a.x,z:a.z};
  };
  const heroCast=actors.filter(a=>a.team==="heroes");
  const monsterCast=actors.filter(a=>a.team==="monsters");
  if(!heroCast.length||!monsterCast.length)
    throw new RangeError("Both teams required");
  const heroes=center(heroCast.map(at));
  const monsters=center(monsterCast.map(at));
  const middle=center([heroes,monsters]);
  const boss=monsterCast.find(a=>a.specialAbility==="grapple-throw");
  const kind:CombatIntroKind=boss?"boss":"normal";
  const {forward,side}=combatAxis(heroes,monsters);
  // Wider casts get wider framing, not a fixed 1v1 orbit accidentally
  // cutting off the second/third fighter.
  const spread=Math.max(distance(heroes,monsters),
    ...actors.map(a=>distance(at(a),middle)));
  const wide=Math.min(14,Math.max(8,5+spread*.65));
  const shot=(target:XZ,along:number,lateral:number,height:number,
    lookHeight:number):Pick<CinematicKeyframe,"eye"|"look">=>({
    eye:eye(target.x+forward.x*along+side.x*lateral,height,
      target.z+forward.z*along+side.z*lateral),
    look:eye(target.x,lookHeight,target.z),
  });
  const heroCaption=heroCast.length===1?"ONE HERO ENTERS":
    heroCast.length+" HEROES STAND TOGETHER";
  const monsterCaption=monsterCast.length===1?"THE GHOUL":
    "THE GHOUL PACK";

  if(kind==="normal"){
    // Five seconds: overview → threat → party → opposing teams → fight.
    // No long boss-style beauty shots during every ordinary dungeon contact.
    const keyframes:readonly CinematicKeyframe[]=[
      {at:0,...shot(middle,-wide*.68,wide*.65,Math.max(7,wide*.8),1.6),
        caption:"THE LIVING DUNGEON · ENGAGEMENT"},
      {at:1.0,...shot(monsters,-5,3.6,3.8,2.0),
        caption:monsterCaption},
      {at:2.25,...shot(heroes,4,-4,3.6,1.8),
        caption:heroCaption},
      {at:3.7,...shot(middle,-wide*.60,-wide*.8,6.2,1.7),
        caption:"NO SAFE PASSAGE"},
      {at:GROUP_COMBAT_INTRO_SECONDS,
        ...shot(middle,-wide*.8,wide*.55,Math.max(7,wide*.7),1.6),
        caption:"FIGHT"},
    ];
    return {fightId,kind,duration:GROUP_COMBAT_INTRO_SECONDS,keyframes,
      heroIds:heroCast.map(a=>a.id),monsterIds:monsterCast.map(a=>a.id)};
  }

  // Boss: slow over-the-shoulder silhouette → intimidating low-angle
  // reveal → moving profile → real party response → faceoff → combat.
  // Works for a single hero OR a full party without creating fake actors.
  const bossPosition=boss?at(boss):monsters;
  const keyframes:readonly CinematicKeyframe[]=[
    {at:0,...shot(heroes,-6,2.8,4.6,2.8),
      look:eye(bossPosition.x,4.5,bossPosition.z),
      caption:"AN ANCIENT THREAT AWAKENS"},
    {at:2.3,...shot(bossPosition,-8,4.5,3.2,4.8),
      caption:"THE ASHEN TUNNEL"},
    {at:5.1,...shot(bossPosition,-3,-7.2,5.6,4.5),
      caption:"THE TUNNEL MAULER"},
    {at:7.8,...shot(heroes,4,-4.5,3.8,2.0),
      caption:heroCast.length===1?"ONE HERO. NO WAY BACK.":
        heroCast.length+" HEROES. ONE MONSTER."},
    {at:10.5,...shot(middle,-wide*.65,wide*.85,7.2,3.0),
      caption:"A DEBT PAID IN BLOOD"},
    {at:BOSS_INTRO_SECONDS,
      ...shot(middle,-wide,wide*.55,Math.max(7,wide*.75),2.3),
      caption:"FIGHT"},
  ];
  return {fightId,kind,duration:BOSS_INTRO_SECONDS,keyframes,
    heroIds:heroCast.map(a=>a.id),monsterIds:monsterCast.map(a=>a.id)};
}
export function sampleGroupCombatIntro(
  track:GroupIntroTrack,seconds:number,
):CinematicFrame {
  return sampleCinematicTrack(track.keyframes,track.duration,seconds);
}
