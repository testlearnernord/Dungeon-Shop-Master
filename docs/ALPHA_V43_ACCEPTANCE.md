# Alpha v43 — observed threat memory and LIVE room surfaces

Fresh campaign required; no v42 migration. The v42 movement and combat timing contract remains unchanged.

## Owner-reported defects

- The full LIVE viewer showed black room tiles where Galvik's Table showed flagstone. Correct the room material's texture ownership: room tint shares the original painted flagstone canvas with corridor material. No new overlay/foundation or change to physical geometry.
- Solo explorers repeatedly oscillated between strategic progress and breaking LOS. The tactical response now stores one actual seen pack position and tick on the existing individual plan. The same route graph excludes the remembered danger zone, seeks a safe frontier or upper stair, or waits for a bounded re-evaluation. Capable co-located parties can reassess; real pursuit, combat and shop return authority are unchanged.

## Verification scope

- Known-route regression with a dangerous branch and safe frontier; no dependence on the unseen pack's actual position; expiry and capable-party reassessment.
- Actual world scheduler records an evasive observation; strict save/reload remains deterministic. Reject malformed memory.
- Browser observer smoke checks live room instances and actual shared ready flagstone texture binding. Manual screenshot/transition and prolonged play remain open.
- Keep the 24-minute day, 50/100-tick movement cadence and 60 Hz combat. No new blanket economy matrix.

See [v42 pacing evidence](ALPHA_V42_ACCEPTANCE.md) and [#294](https://github.com/testlearnernord/Dungeon-Shop-Master/issues/294). Current CI verdict must be checked before merge.
