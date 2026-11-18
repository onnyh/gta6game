// Bayu Heat — hand-in program for the gta6-01 bounty.
//
// What it does, in order:
//   1. wipes the output directory (MAKEFUN_OUTPUT_DIR, default /output),
//   2. copies this repo's game/ and screenshots/ folders into it verbatim,
//   3. asks the vendored make.fun library to describe that exact tree as a
//      dossier, enforcing the bounty's caps, and writes dossier.json.
//
// The dossier is built from the copied tree, never from the repo itself, so
// what is graded is byte-for-byte what was handed in.

import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const folder of ['game', 'screenshots']) {
  cpSync(join(here, folder), join(outDir, folder), { recursive: true });
}

const dossier = buildDossier(outDir, {
  text_max_bytes: 163_840,
  screenshots: { max: 4, max_bytes: 262_144 },
  game_max_files: 993,
  game_max_bytes: 50_331_648,
  game_path_max_bytes: 1000,
});

writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`bayu-heat: dossier written to ${join(outDir, 'dossier.json')} (${dossier.length} bytes)`);
