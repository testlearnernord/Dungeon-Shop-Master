import type { Page } from "@playwright/test";

/** Simulation-only e2e helper. The test server opts in with VITE_E2E=1;
 * production builds never expose this method. A separate browser test covers
 * the real hold-E, fade and Ledger -> Begin Next Day experience.
 */
export async function advanceTestDay(page:Page):Promise<void>{
  await page.evaluate(()=>{
    const advance=(window as Window & {__shopTestAdvanceDay?:()=>void}).__shopTestAdvanceDay;
    if(!advance)throw Error("No E2E day test hook: verify the Playwright webServer env");
    advance();
  });
}
