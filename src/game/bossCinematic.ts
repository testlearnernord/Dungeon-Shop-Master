/**
 * Level 6 encounter introduction. All camera coordinates are presentation only.
 * The saved encounter's first frame stays untouched until the music hits 13.5s.
 * One hero currently fights this boss: do not conjure a fake party for the film.
 */
export const BOSS_INTRO_SECONDS=13.5;

import {sampleCinematicTrack,type CinematicFrame,
  type CinematicKeyframe} from "./combatCinematic.ts";
/** Reusable authored Level-6 film; group combat repositions it to the
 * real boss's saved position without adding camera-owned combat logic. */
export const BOSS_INTRO_KEYFRAMES:readonly CinematicKeyframe[]=[
  {at:0,eye:[-14.5,7.8,-16],look:[0,3.8,0],caption:"FLOOR VI · THE ASHEN TUNNEL"},
  {at:3.2,eye:[-7.4,6.5,-9.4],look:[0,5.5,2],caption:"SOMETHING STIRS IN THE DARK"},
  {at:5.7,eye:[-4.4,4.8,-5.4],look:[0,5.3,2],caption:"THE TUNNEL MAULER"},
  {at:8.6,eye:[2.5,3.6,-15.5],look:[0,2.1,-9],caption:"ONE HERO. NO WAY BACK."},
  {at:11.6,eye:[4.7,5.7,-6.5],look:[0,5.3,2],caption:"A DEBT PAID IN BLOOD"},
  {at:BOSS_INTRO_SECONDS,eye:[4,5,-17],look:[0,3,-3],caption:"FIGHT"},
];
/** The historic authored Cave Troll camera is kept pixel-for-pixel.
 * The exact same sampler also drives group opening cinematics. */
export type BossIntroFrame=CinematicFrame;
export function sampleBossIntro(seconds:number):BossIntroFrame {
  return sampleCinematicTrack(BOSS_INTRO_KEYFRAMES,BOSS_INTRO_SECONDS,seconds);
}
