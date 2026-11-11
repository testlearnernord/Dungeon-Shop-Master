/** Press M to release captured mouse and use the management HUD.
 * Click the 3D shop again to return to first-person mouse look. */
export function setupHudMouseMode(canvas: HTMLCanvasElement): void {
  window.addEventListener("keydown", (event) => {
    if (event.code !== "KeyM" || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
    if (document.pointerLockElement === canvas) {
      event.preventDefault();
      void document.exitPointerLock();
    } else if (!document.querySelector("dialog[open]")) {
      event.preventDefault();
      void canvas.requestPointerLock();
    }
  });
}
