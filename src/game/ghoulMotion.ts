import type {GroupPhase} from "./groupCombat.ts";

/** 14 authored animation clips plus the separate combat idle, losslessly
 * consolidated by predev/prebuild. Source archives are never overwritten. */
export const GHOUL_MODEL="assets/models/dungeon-ghoul-tripo.glb";
export const GHOUL_CLIP_INDICES={
  attack_leap:1,hit_stagger:3,attack_claw_right:7,
  attack_claw_left:8,death_fall:9,run_aggressive:11,
  attack_charge:12,walk_feral:13,idle_combat:14,
} as const;
export type GhoulClip=keyof typeof GHOUL_CLIP_INDICES;
export interface GhoulMotion {readonly clip:GhoulClip;readonly loop:boolean;readonly length:number}

/** Rendering choice only. Real hit windows/HP are recorded by groupCombat. */
export function ghoulMotionForPhase(phase:GroupPhase):GhoulMotion {
  switch(phase){
    case "move":return {clip:"walk_feral",loop:true,length:4.958};
    case "windup":return {clip:"attack_leap",loop:false,length:3.958};
    case "strike":return {clip:"attack_claw_right",loop:false,length:1.958};
    case "hurt":case "thrown":return {clip:"hit_stagger",loop:false,length:1.958};
    case "dead":return {clip:"death_fall",loop:false,length:3.958};
    case "roll":return {clip:"run_aggressive",loop:true,length:1.958};
    case "grab":return {clip:"attack_charge",loop:false,length:1.958};
    default:return {clip:"idle_combat",loop:true,length:1.958};
  }
}

export function ghoulClipProgress(time:number,motion:GhoulMotion):number {
  if(!Number.isFinite(time)||time<=0)return 0;
  return motion.loop?(time/motion.length)%1:Math.min(1,time/motion.length);
}
