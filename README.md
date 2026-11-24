# Bayu Heat

[![Make GTA 6 bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/onnyh/gta6game/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/onnyh/gta6game/reward.svg)](https://make.fun/bounty/gta6-01)

An original 3D open-world crime game set in **Teluk Bayu**, a fictional
Indonesian coastal city watched over by the climbable **Gunung Bayu**.
Explore on foot or steal a car, run from the Teluk Bayu police as your
wanted stars rise, and work through a three-mission story: deliver a package
to the harbour, plant your feet on the summit flag, then shake a three-star
pursuit. Your cash is saved between visits.

Everything is original — the city, the names, the cars, the story — and the
game is plain static files: no build step, no network, just `game/` and a
browser.

## Play

Serve the `game/` folder with any static file server (for example
`node serve.ts`, then open http://localhost:8137/) and click **MULAI**
("start"). Click the game to lock the mouse.

| Action | Keys |
| --- | --- |
| Move | W A S D |
| Look | Mouse |
| Sprint | Shift |
| Jump | Space |
| Enter / exit car | E |
| Brake / reverse | S (in car) |
| Handbrake | Space (in car) |
| Pause | P or Esc |

Touch controls (virtual joystick, look-drag, and buttons) appear
automatically on touch devices.

## The story so far

You are **Raka**, a harbour courier who owes money all over Teluk Bayu.
Pak Haji Darma, who runs the fish market by the pier, offers three jobs
that will clear the debt: a package that has to reach the harbour before
the tide turns, a flag to raise on the summit of Gunung Bayu so the whole
town can see it, and one last run with the police already watching. Finish
all three and the debt is gone — and the chain can be run again for a
bigger purse.

## Layout

- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to the
  output directory and writes `dossier.json` with the vendored library.
- `serve.ts` — a tiny static server for local play and screenshots.
- `vendor/makefun-game.ts` — the make.fun dossier library, unchanged.
- `game/` — the game itself (three.js vendored under `game/vendor/`):
  - `src/world.js` — the procedural city, beach, sea and Gunung Bayu.
  - `src/vehicles.js` — car factory, parked cars, driving, traffic.
  - `src/people.js` — blocky pedestrians and the player character.
  - `src/police.js` — wanted stars, police spawns, chase and bust logic.
  - `src/missions.js` — the three-mission story chain.
  - `src/hud.js` — minimap, stars, cash, speedometer, objective banner.
  - `src/audio.js` — synthesized engine, siren and wave sounds.
  - `src/input.js` — keyboard, mouse and touch input.
  - `src/main.js` — the game loop, camera, physics and glue.
- `screenshots/` — real renders of the game, taken by its maker.

## License

MIT — see `LICENSE`.
