import type { GameSfxCue } from "./sfxCatalog.ts";

/** Player-reviewed Suno one-shots, separated by creature. Unrecorded cues retain provisional synthesis. */
export const SFX_SAMPLE_DIR = "audio/sfx/";
export interface SfxSample {
  readonly file: string;
  readonly gain: number;
  /** Maximum in-game duration, softened with an ending fade. */
  readonly maxSeconds: number;
}
export const SFX_SAMPLES: Partial<Record<GameSfxCue, readonly SfxSample[]>> = {
  "ghoul-aggro": [{file:"ghoul/ghoul_aggro_shriek.wav",gain:.44,maxSeconds:1.70}],
  "ghoul-attack": [{file:"ghoul/ghoul_attack_grunt.wav",gain:.39,maxSeconds:.65}],
  "ghoul-growl": [
    {file:"ghoul/ghoul_threat_growl_short.wav",gain:.26,maxSeconds:1.46},
    {file:"ghoul/ghoul_threat_growl.wav",gain:.24,maxSeconds:2.60},
  ],
  "ghoul-hurt": [
    {file:"ghoul/ghoul_hurt_01_short.wav",gain:.44,maxSeconds:.65},
    {file:"ghoul/ghoul_hurt_02_raspy.wav",gain:.43,maxSeconds:.97},
    {file:"ghoul/ghoul_hurt_03_heavy.wav",gain:.42,maxSeconds:1.27},
  ],
  "ghoul-stagger": [{file:"ghoul/ghoul_stagger_01_long.wav",gain:.42,maxSeconds:1.63}],
  "ghoul-death": [
    {file:"ghoul/ghoul_death_01_shriek.wav",gain:.45,maxSeconds:3.65},
    {file:"ghoul/ghoul_death_02_final_agony.wav",gain:.41,maxSeconds:6.19},
    {file:"ghoul/ghoul_death_03_last_rattle.wav",gain:.43,maxSeconds:2.72},
  ],
  "ghoul-claw-whiff": [
    {file:"ghoul/ghoul_claw_whiff_01_fast.wav",gain:.43,maxSeconds:.57},
    {file:"ghoul/ghoul_claw_whiff_02_raking.wav",gain:.42,maxSeconds:.80},
    {file:"ghoul/ghoul_claw_whiff_03_heavy.wav",gain:.40,maxSeconds:1.03},
  ],
  "ghoul-claw-hit": [
    {file:"ghoul/ghoul_claw_hit_01_fast.wav",gain:.50,maxSeconds:.69},
    {file:"ghoul/ghoul_claw_hit_02_raking.wav",gain:.48,maxSeconds:.83},
    {file:"ghoul/ghoul_claw_hit_03_heavy.wav",gain:.47,maxSeconds:1.03},
  ],
  "ghoul-leap-takeoff": [{file:"ghoul/ghoul_leap_takeoff_01.wav",gain:.30,maxSeconds:1.27}],
  "ghoul-leap-air": [{file:"ghoul/ghoul_leap_air_rush_01.wav",gain:.22,maxSeconds:1.76}],
  "ghoul-leap-land": [
    {file:"ghoul/ghoul_leap_landing_01.wav",gain:.36,maxSeconds:1.14},
    {file:"ghoul/ghoul_leap_landing_02.wav",gain:.34,maxSeconds:1.36},
  ],
  "troll-roar": [{file:"cave-troll/cave-troll-intro-roar-v1.mp3",gain:.72,maxSeconds:3.4}],
  "troll-grunt": [
    {file:"cave-troll/cave-troll-windup-grunt-a.mp3",gain:.49,maxSeconds:.72},
    {file:"cave-troll/cave-troll-windup-grunt-b.mp3",gain:.49,maxSeconds:.69},
  ],
  "troll-step": [{file:"cave-troll/cave-troll-heavy-footstep-v1.mp3",gain:.44,maxSeconds:.52}],
  "troll-swing": [{file:"cave-troll/cave-troll-fist-whoosh-tight-v1.mp3",gain:.48,maxSeconds:.26}],
  "troll-impact": [{file:"cave-troll/cave-troll-fist-impact-short-v1.mp3",gain:.56,maxSeconds:1.15}],
  "boss-hurt": [
    {file:"cave-troll/cave-troll-hurt-a-short.mp3",gain:.43,maxSeconds:.70},
    {file:"cave-troll/cave-troll-hurt-b-rough.mp3",gain:.40,maxSeconds:.75},
    {file:"cave-troll/cave-troll-hurt-c-heavy.mp3",gain:.44,maxSeconds:.75},
  ],
};
export const SFX_HEAVY_SAMPLES: Partial<Record<GameSfxCue,SfxSample>> = {
  "troll-swing": {file:"cave-troll/cave-troll-fist-whoosh-v1.mp3",gain:.51,maxSeconds:.32},
  "troll-impact": {file:"cave-troll/cave-troll-fist-impact-heavy-v1.mp3",gain:.56,maxSeconds:1.9},
};
export function hasRecordedSfx(cue:GameSfxCue):boolean {
  return (SFX_SAMPLES[cue]?.length??0)>0;
}
export function selectSfxSample(cue:GameSfxCue,sequence:number,heavy=false):SfxSample|null {
  if(heavy && SFX_HEAVY_SAMPLES[cue])return SFX_HEAVY_SAMPLES[cue]!;
  const variants=SFX_SAMPLES[cue];
  return variants?.[sequence%variants.length]??null;
}
export const SFX_SAMPLE_FILES = [...new Set([
  ...Object.values(SFX_SAMPLES).flatMap(variants=>variants?.map(spec=>spec.file)??[]),
  ...Object.values(SFX_HEAVY_SAMPLES).map(spec=>spec.file),
])];
