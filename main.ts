// Neon Bay — make.fun gta6-01 entry program (program/v1, Node 22).
// Copies the playable game and its screenshots into the output directory
// and writes the dossier the judges read, using the kit's library.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

function copyFresh(srcDir, destDir) {
  if (existsSync(destDir)) rmSync(destDir, { recursive: true, force: true });
  mkdirSync(destDir, { recursive: true });
  cpSync(srcDir, destDir, { recursive: true });
}

mkdirSync(outDir, { recursive: true });
copyFresh(join(repoRoot, 'game'), join(outDir, 'game'));
copyFresh(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'));

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`Neon Bay: wrote ${outDir}/dossier.json (${dossier.length} bytes)`);
