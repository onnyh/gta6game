# Coral Bay Heat

[![gta6-01 bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/onnyh/gta6game/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/onnyh/gta6game/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game that plays in a desktop browser from static files — no build step, no network, no assets. Everything is drawn and sounded by code: the city, the traffic, the police, the story.

You are **Dani Reyes**, a wheelman working off a debt to **Rosa Delgado** of Rosa's Garage in **Coral Bay**, a sun-soaked coastal city of pastel towers, palm-lined avenues and one long beach. Run her jobs — a dockside pickup, a stolen coupe, a passenger the whole CBPD is hunting, and the Coral Bay Trust score — or just steal something fast and see how many stars you can survive.

## How to play

Serve the `game/` folder with any static file server (or run `node serve.ts` in this repository) and open `game/index.html` in a desktop browser. Click the page once so sound can start.

| Control | Action |
| --- | --- |
| WASD / arrow keys | Move on foot, drive in a car |
| Shift | Run |
| F | Enter / exit a car — any car, including cruisers |
| Space | Punch on foot · handbrake in a car |
| Mouse | Aim · click to shoot with the pistol |
| 1 / 2 | Fists / pistol |
| E | Talk, advance dialogue |
| P or Esc | Pause |
| M | Sound on / off |

Follow the gold marker. Crimes raise your **wanted stars**: more stars bring more cruisers, officers who bail out and chase on foot, and gunfire at three stars and up. An officer who keeps hold of you makes an arrest. Break line of sight and hide — the heat cools, the stars fall, and the city forgets.

## What's in the city

- **A full city on foot and by car** — a 7×7 grid of districts (Downtown, the Old Port, Palm Row, the Marina District…), named landmarks, parks, parking lots, a boardwalk, a beach and the sea.
- **Traffic AI** — cars follow the road grid lane by lane, brake for obstacles and honk at jaywalkers; pedestrians stroll the sidewalks and flee from trouble.
- **Car stealing** — walk up to anything with wheels and press F. Drivers bail out. Cruisers count too.
- **Wanted system and police AI** — five stars of heat with witnesses, cruisers that route through the grid and ram, officers on foot, arrests, and a cool-down when you hide.
- **A four-mission story** with briefings and dialogue, scripted police beats, cash rewards, and a finale — plus a free-roam life afterwards.
- **Combat** — fists and an earned pistol, with health, knockdowns, a WASTED screen (hospital respawn) and a BUSTED screen (a fine).
- **HUD and minimap** — health, money, wanted stars, weapon and car status, objective panel with distance, and a live minimap with police, objective and stash blips.
- **Title screen, pause, and a save game** in `localStorage`: money, story progress, position, health and looted stashes persist between visits.
- **Procedural sound** — WebAudio engine, siren, gunfire, impacts and a synthwave pad loop. No audio files.
- **Ten hidden cash stashes** and health pickups for the exploring criminal.

## Layout

- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the vendored library.
- `vendor/makefun-game.ts` — make.fun's dossier library, unchanged.
- `game/index.html` — the page. `game/src/` holds the game, one job per file:
  - `config.js` tuning and palette · `rng.js` seeded randomness · `city.js` the generated city and collision
  - `vehicles.js` cars and driving physics · `traffic.js` traffic and pedestrians · `police.js` wanted level and police AI
  - `combat.js` fists, bullets and collisions · `missions.js` the story · `audio.js` procedural sound
  - `save.js` the save game · `render.js` the drawing, HUD and minimap · `input.js` keyboard and mouse
  - `shots.js` the staged scenes behind the screenshots · `main.js` the loop that wires it all together
- `screenshots/` — four real renders of the game running (staged with `shots.js`, captured in a browser, never edited).

## License

MIT — see `LICENSE`.
