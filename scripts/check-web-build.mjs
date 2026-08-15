import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const distDir = path.resolve('dist');
const indexPath = path.join(distDir, 'index.html');
const assetsDir = path.join(distDir, 'assets');

if (!existsSync(indexPath) || !existsSync(assetsDir)) {
  throw new Error('Web build is incomplete: dist/index.html or dist/assets is missing.');
}

const html = readFileSync(indexPath, 'utf8');
const referencedAssets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)]
  .map((match) => match[1]);

if (!referencedAssets.length) {
  throw new Error('Web build has no referenced JavaScript or stylesheet assets.');
}

for (const asset of referencedAssets) {
  const assetPath = path.join(distDir, asset.replace(/^\//, ''));
  if (!existsSync(assetPath)) {
    throw new Error(`Web build references a missing asset: ${asset}`);
  }
}

const javascriptFiles = readdirSync(assetsDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => ({ name, bytes: statSync(path.join(assetsDir, name)).size }));
const largestJavascript = javascriptFiles.sort((left, right) => right.bytes - left.bytes)[0];
const maximumChunkBytes = 450 * 1024;

if (!largestJavascript || largestJavascript.bytes > maximumChunkBytes) {
  const detail = largestJavascript
    ? `${largestJavascript.name} is ${largestJavascript.bytes} bytes`
    : 'no JavaScript chunks were emitted';
  throw new Error(`Web bundle budget exceeded: ${detail}.`);
}

console.log(`Verified ${referencedAssets.length} entry assets; largest JavaScript chunk is ${largestJavascript.bytes} bytes.`);
