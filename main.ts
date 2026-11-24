// Bayu Heat — hand-in program for the make.fun "Make GTA 6" bounty (gta6-01).
//
// What this program does, in order:
//   1. Empties the output directory (MAKEFUN_OUTPUT_DIR, default /output)
//      of any stale contents, without removing the directory itself.
//   2. Copies this repository's game/ and screenshots/ folders into it.
//   3. Asks the vendored make.fun library to describe that exact copied tree
//      as a dossier, under the bounty's caps, and writes dossier.json.
//
// The dossier is built from the copied tree, never from the repository
// itself, so the graded artifact is byte-for-byte what was handed in and the
// program is deterministic: two runs over the same commit agree exactly.

import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

// The repository root is the directory this file lives in.
const repoRoot = dirname(fileURLToPath(import.meta.url));

// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output.
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

// The bounty's caps, mirrored from the competition rules so the dossier this
// program writes is the dossier the gate rebuilds.
const DOSSIER_CAPS = {
  text_max_bytes: 163_840,
  screenshots: { max: 4, max_bytes: 262_144 },
  game_max_files: 993,
  game_max_bytes: 48 * 1024 * 1024,
} as const;

// Start from an empty output directory so stale files can never leak into
// the entry from an earlier run. The directory itself is created if missing
// and then emptied entry by entry; it is never removed.
//
// Why never remove the directory itself: on the grader, /output is a
// bind-mounted volume, and removing a mount point fails with EBUSY, which
// killed the hand-in run with exit code 1. Emptying the contents works the
// same on a plain directory and on a mounted one.
mkdirSync(outputDir, { recursive: true });
for (const entry of readdirSync(outputDir)) {
  rmSync(join(outputDir, entry), { recursive: true, force: true });
}

// Copy the two payload folders verbatim.
for (const folder of ["game", "screenshots"]) {
  cpSync(join(repoRoot, folder), join(outputDir, folder), { recursive: true });
}

// Describe the copied tree and write the dossier beside it. buildDossier
// returns the canonical dossier bytes (makefun/dossier/v1) as a Uint8Array;
// write them through untouched so the file matches the gate's rebuild.
const dossierBytes: Uint8Array = buildDossier(outputDir, DOSSIER_CAPS);
writeFileSync(join(outputDir, "dossier.json"), dossierBytes);

console.log(
  `Bayu Heat handed in: game/ + screenshots/ copied to ${outputDir}, ` +
    `dossier.json written (${dossierBytes.byteLength} bytes).`,
);
