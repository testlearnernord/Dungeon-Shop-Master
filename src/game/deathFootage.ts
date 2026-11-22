import type {GameState,WorldEvent} from "./gameState.ts";

/** A critical magical loss signal deliberately discloses NO cause.
 * Only a player click may resolve its actual committed battle/expedition
 * footage; no viewer ever manufactures, rerolls or guesses a death. */
export type DeathFootage=
  |{kind:"active-combat";fightId:string}
  |{kind:"party-boss-recording";eventId:string}
  |{kind:"expedition-recording";eventId:string}
  |{kind:"none"};

export function findCommittedDeathFootage(
  state:GameState,heroId:string,signalId:string,
):DeathFootage{
  const signal=state.events.find(event=>
    event.id===signalId&&event.type==="hero-death-signal"&&
    event.adventurerId===heroId);
  if(!signal)return {kind:"none"};
  const active=state.liveDungeon.combats.find(fight=>
    fight.heroIds.includes(heroId)&&fight.state.actors.some(actor=>
      actor.id===heroId&&actor.hp<=0));
  if(active)return {kind:"active-combat",fightId:active.id};
  const partyBoss=state.liveDungeon.partyBossCombat;
  if(partyBoss?.heroIds.includes(heroId)&&
     partyBoss.state.actors.some(a=>a.id===heroId&&a.hp<=0))
    return {kind:"active-combat",fightId:partyBoss.id};
  const recorded=[...state.events].reverse().filter((event:WorldEvent)=>
    event.day===signal.day&&event.adventurerId===heroId);
  const partyBossTape=[...state.events].reverse().find(event=>
    event.day===signal.day&&
    event.partyBossReplay?.actors.some(actor=>actor.id===heroId)&&
    event.partyBossReplay.frames.some(frame=>
      frame.actors.some(actor=>actor.id===heroId&&actor.hp<=0)));
  if(partyBossTape)
    return {kind:"party-boss-recording",eventId:partyBossTape.id};
  const dungeon=recorded.find(event=>{
    const tape=event.dungeonReplay??event.level7Replay;
    return tape&&(tape.outcome==="death"||
      tape.steps.some(step=>step.hp<=0&&
        (step.action==="trap"||step.action==="death"||
         step.action==="combat"))||
      tape.encounters.some(encounter=>
        encounter.combat.frames.some(frame=>
          frame.actors.some(actor=>actor.id===heroId&&actor.hp<=0))));
  });
  return dungeon?{kind:"expedition-recording",eventId:dungeon.id}:
    {kind:"none"};
}
