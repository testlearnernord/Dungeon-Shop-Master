import type {GameState} from "./gameState.ts";
import type {FurnitureDraft} from "./furnitureBlueprint.ts";
import {isBedroomFurnitureId,replaceBedroomFurniture,
  type BedroomFurniturePlacement} from "./bedroomFurniture.ts";
import {replaceRosterBoard,rosterBoardProblem} from "./rosterBoardPlacement.ts";
import {replaceCounterPlacement,replaceShelfPlacement,
  type ShelfPlacement} from "./shopLayout.ts";
import {shopServiceReachabilityProblem} from "./shopServiceReachability.ts";
import {createEmptyShelfSlots} from "./economy.ts";
import {wallPortraitProblem} from "./wallPortraitPlacement.ts";
import {cellarChestProblem} from "./cellarRoom.ts";

export type FurniturePlacementResult={
  readonly state:GameState;
  readonly problem:string|null;
  readonly message:string;
};

/** The one authoritative placement transaction for every existing object.
 * A preview calls the SAME pure function as click/commit. No ghost changes
 * the save. State fields are persisted without an alternative shelf editor.
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
  if(draft.id==="galvik-portrait")return unchanged("The portrait is a fixed secret passage.", "The portrait is a fixed secret passage.");
  if(draft.id==="cellar-chest"){
    const problem=cellarChestProblem(draft,state.cellarRoom);
    if(problem)return unchanged(problem,problem);
    const old=state.cellarChest;
    if(old.x===draft.x&&old.z===draft.z&&old.rotation===draft.rotation)
      return {state,problem:null,message:"Cellar chest placed."};
    return {state:{...state,cellarChest:{...draft}},problem:null,message:"Cellar chest placed."};
  }
  if(draft.id==="adventurer-board"){
    const result=replaceRosterBoard(state.rosterBoard,draft,
      state.shopLayout,state.level5Room);
    if(result.message!=="Adventurer board placed.")
      return unchanged(result.message,result.message);
    if(state.wallPortrait){
      const blocked=wallPortraitProblem(state.wallPortrait,state.shopLayout,
        state.level5Room,result.placement!);
      if(blocked)return unchanged(blocked,blocked);
    }
    return {state:result.placement===state.rosterBoard?state:
      {...state,rosterBoard:result.placement},problem:null,
      message:result.message};
  }
  if(isBedroomFurnitureId(draft.id)){
    const result=replaceBedroomFurniture(state.bedroomFurniture,
      draft as BedroomFurniturePlacement);
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
  const result=replaceShelfPlacement(state.shopLayout,draft as ShelfPlacement,
    state.level5Room);
  if(result.message!=="Shelf placement saved.")
    return unchanged(result.message,result.message);
  // A new shelf may cover the board even if it leaves the cashier reachable.
  const boardProblem=rosterBoardProblem(
    state.rosterBoard,result.layout,state.level5Room);
  if(boardProblem)return unchanged(boardProblem,boardProblem);
  if(state.wallPortrait){
    const blocked=wallPortraitProblem(state.wallPortrait,result.layout,
      state.level5Room,state.rosterBoard);
    if(blocked)return unchanged(blocked,blocked);
  }
  const problem=shopServiceReachabilityProblem(result.layout,state.level5Room);
  if(problem)return unchanged(problem,problem);
  const isNew=!state.shopLayout.shelves.some(shelf=>shelf.id===draft.id);
  const economy=isNew?{...state.shopEconomy,
    slots:[...state.shopEconomy.slots,...createEmptyShelfSlots(draft.id)]}
    :state.shopEconomy;
  return {state:result.layout===state.shopLayout?state:
    {...state,shopLayout:result.layout,shopEconomy:economy},
    problem:null,message:result.message};
}
