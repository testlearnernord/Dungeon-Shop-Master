import {sampleCinematicTrack,type CinematicFrame,
  type CinematicKeyframe} from "./combatCinematic.ts";
import type {CombatantSpec,GroupReplayFrame} from "./groupCombat.ts";

/** Premium opt-in group film. The first *saved* combat pose defines each
 * actor's placement. LIVE updates continue underneath the camera cutscene. */
export const GROUP_COMBAT_INTRO_SECONDS=8.5;
export interface GroupIntroTrack {
  readonly fightId:string;
  readonly duration:number;
  readonly keyframes:readonly CinematicKeyframe[];
  readonly heroIds:readonly string[];
  readonly monsterIds:readonly string[];
}
const pos=(actor:{x:number;z:number})=>
  ({x:actor.x,z:actor.z});
const fallback=(actors:readonly CombatantSpec[],team:"heroes"|"monsters")=>
  actors.find(a=>a.team===team)??actors[0];
const eye=(x:number,y:number,z:number):readonly [number,number,number]=>[x,y,z];
const center=(actors:readonly CombatantSpec[])=>({
  x:actors.reduce((sum,a)=>sum+a.x,0)/actors.length,
  z:actors.reduce((sum,a)=>sum+a.z,0)/actors.length,
});
export function createGroupCombatIntro(
  fightId:string,actors:readonly CombatantSpec[],
  committed:GroupReplayFrame,
):GroupIntroTrack {
  if(actors.length<2||!fightId)throw new RangeError("Combat cast required");
  const saved=new Map(committed.actors.map(a=>[a.id,a]));
  const at=(actor:CombatantSpec)=>{
    const p=saved.get(actor.id);
    return p?pos(p):pos(actor);
  };
  const heroes=actors.filter(a=>a.team==="heroes");
  const monsters=actors.filter(a=>a.team==="monsters");
  if(!heroes.length||!monsters.length)throw new RangeError("Both teams required");
  const leadHero=at(fallback(actors,"heroes"));
  const leadMonster=at(fallback(actors,"monsters"));
  const c=center(actors.map(a=>({...a,...at(a)})));
  const width=Math.max(16,...actors.map(a=>Math.abs(at(a).x-c.x)*2+10));
  const depth=Math.max(16,...actors.map(a=>Math.abs(at(a).z-c.z)*2+10));
  const big=monsters.some(a=>a.specialAbility==="grapple-throw");
  const monsterY=big?5.8:2.6;
  const heroY=2.6;
  const heroCaption=heroes.length===1?"ONE HERO ENTERS":
    heroes.length+" HEROES STAND TOGETHER";
  const monsterCaption=big?"THE CAVE TROLL":
    monsters.length===1?"THE GHOUL":"THE GHOUL PACK";
  const keyframes:readonly CinematicKeyframe[]=[
    {at:0,eye:eye(c.x-width*.52,Math.max(8,width*.36),
        c.z-depth*.92),look:eye(c.x,2,c.z),
      caption:"THE LIVING DUNGEON · ENGAGEMENT"},
    {at:1.7,eye:eye(leadMonster.x-4,monsterY+1.7,
        leadMonster.z-6),look:eye(leadMonster.x,monsterY,leadMonster.z),
      caption:monsterCaption},
    {at:3.55,eye:eye(leadHero.x+4,heroY+2,
        leadHero.z-7),look:eye(leadHero.x,heroY,leadHero.z),
      caption:heroCaption},
    {at:5.6,eye:eye(c.x+width*.48,Math.max(7,width*.30),
        c.z-depth*.8),look:eye(c.x,2.7,c.z),
      caption:monsters.length>1?"NO SAFE PASSAGE":"NO WAY BACK"},
    {at:7.4,eye:eye(c.x+width*.22,Math.max(6,width*.25),
        c.z-depth*.9),look:eye(c.x,2.3,c.z),
      caption:"PREPARE FOR BATTLE"},
    {at:GROUP_COMBAT_INTRO_SECONDS,eye:eye(c.x+width*.3,Math.max(7,width*.4),
        c.z-depth*1.12),look:eye(c.x,1.5,c.z),
      caption:"FIGHT"},
  ];
  return {fightId,duration:GROUP_COMBAT_INTRO_SECONDS,keyframes,
    heroIds:heroes.map(a=>a.id),monsterIds:monsters.map(a=>a.id)};
}
export function sampleGroupCombatIntro(
  track:GroupIntroTrack,seconds:number,
):CinematicFrame {
  return sampleCinematicTrack(track.keyframes,track.duration,seconds);
}
