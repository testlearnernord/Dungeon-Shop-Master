import type {GameState} from "./gameState.ts";
import type {FurnitureDraft} from "./furnitureBlueprint.ts";
import {isBedroomFurnitureId,replaceBedroomFurniture} from "./bedroomFurniture.ts";
import {replaceRosterBoard,rosterBoardProblem,DEFAULT_ROSTER_BOARD} from "./rosterBoardPlacement.ts";
import {replaceCounterPlacement,replaceShelfPlacement} from "./shopLayout.ts";
import {shopServiceReachabilityProblem} from "./shopServiceReachability.ts";

export type FurniturePlacementResult={
  readonly state:GameState;
  readonly problem:string|null;
  readonly message:string;
};

/** The one authoritative placement transaction for every existing object.
 * A preview calls the SAME pure function as click/commit. No ghost changes
 * the save. The current save fields are adapters for historical campaigns.
 *
 * Mounting policies differ, but the transaction, geometry and validation
 * lifecycle do not: floor support, physical overlap, all required service
 * routes and interactions must succeed before any state is mutated.
 */
export function resolveFurniturePlacement(
  state:GameState,draft:FurnitureDraft,
):FurniturePlacementResult{
  const unchanged=(problem:string,message:string):FurniturePlacementResult=>({
    state,problem,message,
  });
  if(draft.id==="adventurer-board"){
    const result=replaceRosterBoard(state.rosterBoard,draft,
      state.shopLayout,state.level5Room);
    if(result.message!=="Adventurer board placed.")
      return unchanged(result.message,result.message);
    return {state:result.placement===state.rosterBoard?state:
      {...state,rosterBoard:result.placement},problem:null,
      message:result.message};
  }
  if(isBedroomFurnitureId(draft.id)){
    const result=replaceBedroomFurniture(state.bedroomFurniture,draft);
    if(result.message!=="Bedroom furniture placed.")
      return unchanged(result.message,result.message);
    return {state:result.layout===state.bedroomFurniture?state:
      {...state,bedroomFurniture:result.layout},problem:null,
      message:result.message};
  }
  if(draft.id==="counter"){
    const result=replaceCounterPlacement(state.shopLayout,draft,
      state.level5Room);
    if(result.message!=="Counter placement saved.")
      return unchanged(result.message,result.message);
    const problem=shopServiceReachabilityProblem(result.layout,state.level5Room);
    if(problem)return unchanged(problem,problem);
    return {state:result.layout===state.shopLayout?state:
      {...state,shopLayout:result.layout},problem:null,
      message:result.message};
  }
  const result=replaceShelfPlacement(state.shopLayout,draft,
    state.level5Room);
  if(result.message!=="Shelf placement saved.")
    return unchanged(result.message,result.message);
  // A new shelf may cover the board even if it leaves the cashier reachable.
  const boardProblem=rosterBoardProblem(
    state.rosterBoard??DEFAULT_ROSTER_BOARD,result.layout,state.level5Room);
  if(boardProblem)return unchanged(boardProblem,boardProblem);
  const problem=shopServiceReachabilityProblem(result.layout,state.level5Room);
  if(problem)return unchanged(problem,problem);
  return {state:result.layout===state.shopLayout?state:
    {...state,shopLayout:result.layout},problem:null,
    message:result.message};
}
