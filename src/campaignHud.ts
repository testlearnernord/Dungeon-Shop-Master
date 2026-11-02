import { CampaignStorage, createSave, parseSave } from "./game/campaignSave";
import { createGameState, type GameState } from "./game/gameState";
import { GameStore } from "./game/gameStore";

export async function loadCampaign() {
  const storage = new CampaignStorage();
  try {
    const state = await storage.loadGame();
    return { storage, state: state ?? createGameState(), continued: state !== null, error: "" };
  } catch (error) {
    return { storage, state: createGameState(), continued: false, error: describe(error) };
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function setupCampaignHud(
  store: GameStore,
  campaign: Awaited<ReturnType<typeof loadCampaign>>,
  resetScene: () => void,
): void {
  const status = document.querySelector<HTMLElement>("#save-status")!;
  const file = document.querySelector<HTMLInputElement>("#save-file")!;
  const recover = document.querySelector<HTMLButtonElement>("#recover-save")!;
  let enabled = !campaign.error;
  let revision = 0;
  let savedState: GameState | null = campaign.continued ? store.state : null;
  let pending: Promise<void> = Promise.resolve();

  const reportError = (message: string): void => {
    status.textContent = `Save error: ${message} Existing browser data is preserved. Play in memory, export to keep progress, or explicitly choose New Game / Import save.`;
  };
  const save = (): void => {
    if (!enabled) return;
    const state = store.state;
    const currentRevision = ++revision;
    status.textContent = `Saving Day ${state.day}…`;
    pending = campaign.storage.saveGame(state).then(() => {
      if (revision !== currentRevision) return;
      savedState = state;
      status.textContent = `Saved Day ${state.day}.`;
    }).catch((error: unknown) => {
      if (revision === currentRevision) reportError(describe(error));
    });
  };
  store.subscribe(save);
  if (campaign.error) {
    reportError(campaign.error);
    recover.hidden = false;
  } else if (campaign.continued) {
    status.textContent = `Continued saved Day ${store.state.day}.`;
  } else {
    save();
  }

  const releasePointer = (): void => {
    document.exitPointerLock();
  };
  const replace = (state: GameState): void => {
    enabled = true;
    recover.hidden = true;
    resetScene();
    store.restore(state);
    document.querySelector<HTMLCanvasElement>("#renderCanvas")!.focus();
  };
  document.querySelector("#new-game")!.addEventListener("click", () => {
    releasePointer();
    if (!window.confirm("Start a new campaign at Day 1? This replaces your current campaign. Export first to keep it.")) return;
    replace(createGameState());
  });
  document.querySelector("#export-save")!.addEventListener("click", () => {
    releasePointer();
    const blob = new Blob([JSON.stringify(createSave(store.state))], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dungeon-shop-day-${store.state.day}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  document.querySelector("#import-save")!.addEventListener("click", () => {
    releasePointer();
    file.click();
  });
  file.addEventListener("change", async () => {
    const selected = file.files?.[0];
    file.value = "";
    if (!selected) return;
    try {
      const state = parseSave(await selected.text());
      if (window.confirm(`Import saved Day ${state.day}? This replaces your current campaign. Export first to keep it.`)) {
        replace(state);
      }
    } catch (error) {
      status.textContent = `Import rejected: ${describe(error)} Your campaign is unchanged.`;
    }
  });
  recover.addEventListener("click", async () => {
    try {
      const state = await campaign.storage.loadBackup();
      if (!state) {
        status.textContent = "No valid previous save is available. Import an exported save or explicitly choose New Game.";
      } else if (window.confirm(`Recover previous saved Day ${state.day}? This replaces the current campaign.`)) {
        replace(state);
      }
    } catch (error) {
      reportError(describe(error));
    }
  });

  const flush = (): void => {
    // Commits are queued immediately; retry a failed last snapshot on lifecycle events.
    void pending.then(() => {
      if (enabled && savedState !== store.state) save();
    });
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
}
