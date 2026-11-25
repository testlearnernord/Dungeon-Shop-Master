/**
 * The authoritative per-frame encounter driver. Ordinary dungeon fights
 * and special boss encounters register their actors and encounter-specific
 * behavior here rather than maintaining independent top-level tick loops.
 *
 * Actor order, projectile resolution, final result and replay capture all
 * happen in one deterministic pipeline, independent of Babylon/UI.
 */
export const COMBAT_STEP_SECONDS = 1 / 60;
/** Temporary live encounter limit; shared by the boss scheduler and save boundary. */
export const PARTY_BOSS_MAX_SECONDS = 90;

export interface EncounterFrame<Cue> {
  readonly cues: Cue[];
}

export type EncounterStage<State,Cue> =
  (state:State,dt:number,frame:EncounterFrame<Cue>)=>void;

export interface EncounterPipeline<State,Actor,Cue> {
  /** Physical environment / tactical decisions before individual actors. */
  readonly beforeActors?:EncounterStage<State,Cue>;
  /** Order is encounter-owned: canonical ID ordering for ordinary groups;
   * authored hero -> boss ordering for the unique cinematic duel. */
  readonly actors:(state:State)=>readonly Actor[];
  readonly updateActor:(state:State,actor:Actor,dt:number,frame:EncounterFrame<Cue>)=>void;
  readonly projectiles?:EncounterStage<State,Cue>;
  readonly finish?:EncounterStage<State,Cue>;
  /** Persist committed encounter cues, never recalculate them in a viewer. */
  readonly commit?:(state:State,frame:EncounterFrame<Cue>)=>void;
}

export function stepCombatEncounter<
  State extends {time:number;outcome:string},Actor,Cue,
>(
  state:State,dt:number,pipeline:EncounterPipeline<State,Actor,Cue>,
):readonly Cue[] {
  if(!Number.isFinite(dt)||dt<=0||dt>0.1)
    throw new RangeError("Combat step must be within (0, 0.1] seconds");
  if(state.outcome!=="fighting")return [];
  if(!Number.isFinite(state.time)||state.time<0)
    throw new RangeError("Invalid encounter time");

  // Exactly one clock advance per actual gameplay tick. No stage is called
  // during reading of an old saved recording.
  state.time+=dt;
  const frame:EncounterFrame<Cue>={cues:[]};
  pipeline.beforeActors?.(state,dt,frame);
  for(const actor of pipeline.actors(state))
    pipeline.updateActor(state,actor,dt,frame);
  pipeline.projectiles?.(state,dt,frame);
  pipeline.finish?.(state,dt,frame);
  pipeline.commit?.(state,frame);
  return frame.cues;
}

export interface EncounterLife {
  readonly team:"heroes"|"monsters";
  readonly hp:number;
}

/** The same team-liveness rule works for any number of fighters or one boss. */
export function encounterTeamOutcome(
  actors:readonly EncounterLife[],
):"fighting"|"heroes"|"monsters"|"draw" {
  if(!actors.length)throw new RangeError("Combat requires team members");
  const heroes=actors.some(actor=>actor.team==="heroes"&&actor.hp>0);
  const monsters=actors.some(actor=>actor.team==="monsters"&&actor.hp>0);
  return heroes&&monsters?"fighting":heroes?"heroes":monsters?"monsters":"draw";
}

export interface EncounterRecorder<State,Frame,Cue> {
  readonly state:State;
  readonly capture:(state:State,pending:readonly Cue[])=>Frame;
  readonly step:(state:State,dt:number)=>readonly Cue[];
  readonly captureEvery:number;
  readonly maxSeconds:number;
  readonly isFighting:(state:State)=>boolean;
}

/** Both replay formats use the same bounded 60Hz capture loop, but retain
 * their original saved frame schema and existing sample frequency.
 * Boss recordings store pending cues in each captured frame; group combat
 * stores them in the separate cue list. No save migration or reroll. */
export function recordCombatEncounter<State,Frame,Cue>(
  recorder:EncounterRecorder<State,Frame,Cue>,
):{readonly frames:Frame[];readonly state:State} {
  const {state,capture,step,captureEvery,maxSeconds,isFighting}=recorder;
  if(!Number.isSafeInteger(maxSeconds)||maxSeconds<1||maxSeconds>90 ||
    !Number.isSafeInteger(captureEvery)||captureEvery<1||captureEvery>600)
    throw new RangeError("Invalid combat recording bounds");

  const frames:Frame[]=[capture(state,[])];
  let pending:Cue[]=[];
  const totalTicks=maxSeconds*60;
  for(let i=1;i<=totalTicks&&isFighting(state);i++){
    pending.push(...step(state,COMBAT_STEP_SECONDS));
    if(i%captureEvery===0||!isFighting(state)||i===totalTicks){
      frames.push(capture(state,pending));
      pending=[];
    }
  }
  return {frames,state};
}
