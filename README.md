# Dungeon Shop Master

A small browser-based first-person prototype set in Galvik's mineshaft shop on Dungeon Level 5. The scene uses original placeholder geometry and materials; it has no backend or paid assets.

## Controls

- **WASD** to move and **mouse** to look (click the scene to capture the pointer).
- **Esc** releases the pointer.
- **Mouse wheel** selects an item from your starter inventory.
- **Left-click / hold** a shelf slot to stock it; **right-click / hold** to return one item at a time.
- **E** interacts with Galvik's checkout register when nearby.

Each of the two shelves has five numbered slots. A slot can hold up to five of one item type. The HUD shows selected inventory and total bag capacity. Level 4 and Level 6 corridors are signed and blocked; checkout transactions are not implemented in this prototype.

## Architecture

- `src/game/firstPersonController.ts` configures first-person movement and collision.
- `src/game/inventory.ts` defines typed items, stacks, slots, interactables, and safe inventory capacity rules.
- `src/game/shop.ts` manages shelf slots and stocking/removal.
- `src/game/interactionSystem.ts` handles pointer lock, mouse interactions, repeat actions, wheel selection, and E interactions.
- `src/game/world.ts` builds the mineshaft, corridors, lighting, and checkout.
- `src/main.ts` connects the scene, game systems, and HUD.

## Local setup

Requires Node.js 22 or newer.

```sh
npm install
npm run dev
```

For a production build and local preview:

```sh
npm run build
npm run preview
```

## GitHub Pages

The `Deploy to GitHub Pages` workflow builds and deploys pushes to `main`. In the repository, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**. The Vite base path is `/Dungeon-Shop-Master/`.

## Test walkthrough

1. Start the dev server, open the local URL, and click the scene to capture the pointer.
2. Use WASD and mouse look to walk around; verify the floor, shop walls, counter, and shelves block movement.
3. Find the two signed blocked corridors, checkout counter, and both five-slot shelves.
4. Aim at a slot, left-click to stock, and hold to stock repeatedly; verify the inventory count and bag total decrease.
5. Right-click and hold to return goods; verify counts rise, and try switching to an incompatible item for an occupied slot.
6. Use the wheel to change the selected item, press E near the register, then press Esc to release the pointer.
