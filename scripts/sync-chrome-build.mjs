import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const build = path.join(root, '.output/chrome-mv3');
const inventoryPath = path.join(root, 'scripts/chrome-build-files.json');
// These root paths are reserved for the installable Chrome build. WXT still
// builds in .output first; never point WXT's cleanable outputDir at the repo.
const allowed = new Set([
  'manifest.json', 'background.js', 'calibration.js', 'popup.html',
  'assets', 'chunks', 'content-scripts', 'icon', '_locales',
]);
const exists = async file => stat(file).then(() => true, error => {
  if (error.code === 'ENOENT') return false;
  throw error;
});
const entries = (await readdir(build)).sort();
const manifest = JSON.parse(await readFile(path.join(build, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3 || manifest.name !== 'Frog') throw new Error('Expected the production Frog Chrome build.');
for (const name of entries) {
  if (!allowed.has(name)) throw new Error(`Add the new runtime path to sync-chrome-build.mjs before exporting: ${name}`);
}

let previous = [];
if (await exists(inventoryPath)) previous = JSON.parse(await readFile(inventoryPath, 'utf8'));
if (!Array.isArray(previous) || previous.some(name => !allowed.has(name))) throw new Error('Invalid Chrome build inventory.');

// Avoid overwriting unrelated files on the first export.
for (const name of entries) {
  if (await exists(path.join(root, name)) && !previous.includes(name)) {
    throw new Error(`Refusing to overwrite an unowned root path: ${name}`);
  }
}
for (const name of new Set([...previous, ...entries])) {
  await rm(path.join(root, name), { recursive: true, force: true });
  if (entries.includes(name)) await cp(path.join(build, name), path.join(root, name), { recursive: true });
}
await mkdir(path.dirname(inventoryPath), { recursive: true });
await writeFile(inventoryPath, `${JSON.stringify(entries, null, 2)}\n`);
console.log('Updated the installable Chrome extension at the repository root.');
