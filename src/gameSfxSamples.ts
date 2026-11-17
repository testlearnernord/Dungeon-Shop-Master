import type { GameSfxCue } from "./sfxCatalog.ts";

/** Player-reviewed Suno one-shots. Unrecorded cues retain provisional synthesis. */
export const SFX_SAMPLE_DIR = "audio/sfx/cave-troll/";
export interface SfxSample {
  readonly file: string;
  readonly gain: number;
  /** Maximum in-game duration, softened with an ending fade. */
  readonly maxSeconds: number;
}
export const SFX_SAMPLES: Partial<Record<GameSfxCue, readonly SfxSample[]>> = {
  "troll-roar": [{file:"cave-troll-intro-roar-v1.mp3",gain:.72,maxSeconds:3.4}],
  "troll-grunt": [
    {file:"cave-troll-windup-grunt-a.mp3",gain:.49,maxSeconds:.72},
    {file:"cave-troll-windup-grunt-b.mp3",gain:.49,maxSeconds:.69},
  ],
  "troll-step": [{file:"cave-troll-heavy-footstep-v1.mp3",gain:.44,maxSeconds:.52}],
  "troll-swing": [{file:"cave-troll-fist-whoosh-tight-v1.mp3",gain:.48,maxSeconds:.26}],
  "troll-impact": [{file:"cave-troll-fist-impact-short-v1.mp3",gain:.56,maxSeconds:1.15}],
  "boss-hurt": [
    {file:"cave-troll-hurt-a-short.mp3",gain:.43,maxSeconds:.70},
    {file:"cave-troll-hurt-b-rough.mp3",gain:.40,maxSeconds:.75},
    {file:"cave-troll-hurt-c-heavy.mp3",gain:.44,maxSeconds:.75},
  ],
};
export const SFX_HEAVY_SAMPLES: Partial<Record<GameSfxCue,SfxSample>> = {
  "troll-swing": {file:"cave-troll-fist-whoosh-v1.mp3",gain:.51,maxSeconds:.32},
  "troll-impact": {file:"cave-troll-fist-impact-heavy-v1.mp3",gain:.56,maxSeconds:1.9},
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
