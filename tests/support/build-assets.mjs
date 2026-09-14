import { readFile, readdir } from 'node:fs/promises';
import { buildRoot } from './paths.mjs';

// Serve the current module graph, including dependencies added by later features.
export async function addBuildAssets(assets, prefix = '') {
  for (const entry of await readdir(`${buildRoot}/src`, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.m?js$/.test(entry.name)) continue;
    const path = `${entry.parentPath}/${entry.name}`;
    assets.set(prefix + path.slice(buildRoot.length), await readFile(path));
  }
}
