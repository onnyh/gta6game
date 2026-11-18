// Coral Bay Heat — the hand-in program for the gta6-01 bounty (Node 22, standard library only).
//
// The game itself is the static site under game/ (open game/index.html in a desktop browser and
// it plays offline). This program's one job is to deliver it: copy game/ and screenshots/ from
// this repository into the output directory and write dossier.json there with the vendored
// make.fun library, so the scorer can rebuild the same dossier from the same files and compare.
//
// Run it locally the way the rules describe:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// In the grader MAKEFUN_OUTPUT_DIR is unset and the output directory is /output.

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Start from an empty output directory so a stale file from an earlier run can never leak
// into the entry the scorer sees.
rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

cpSync(join(repoDir, 'game'), join(outputDir, 'game'), { recursive: true });

const shotsDir = join(repoDir, 'screenshots');
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });
} else {
  mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
}

// The caps are the gate's own (reference/gate.json): the text cap shapes the dossier's bytes,
// the rest make this program refuse anything the scorer would refuse anyway — too many or too
// large screenshots, too many files under game/, an over-long path.
const dossierBytes = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossierBytes);
console.log(`Coral Bay Heat handed in: dossier.json is ${dossierBytes.length} bytes in ${outputDir}`);
