import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));

test('the repository root is a complete, directly loadable Chrome extension', async () => {
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, 'Frog');
  assert.equal(manifest.version, pkg.version);
  const resources = [
    ...Object.values(manifest.icons),
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...manifest.content_scripts.flatMap(script => [...(script.js ?? []), ...(script.css ?? [])]),
    // These are injected on demand by the background worker.
    'calibration.js',
  ];
  const popup = await readFile(path.join(root, manifest.action.default_popup), 'utf8');
  for (const match of popup.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (!/^(?:https?:|data:|#)/.test(match[1])) resources.push(match[1]);
  }
  for (const resource of resources) {
    const relative = resource.replace(/^\//, '');
    assert.ok(!relative.split('/').includes('..'), `Invalid runtime path: ${resource}`);
    assert.ok((await stat(path.join(root, relative))).isFile(), `Missing runtime resource: ${resource}`);
  }
});
