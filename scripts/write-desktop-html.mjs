import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const distDir = path.join(repoRoot, 'dist');
const assetsDir = path.join(distDir, 'assets');
const indexFile = path.join(distDir, 'index.html');

if (!existsSync(assetsDir)) {
  throw new Error(`Desktop assets folder not found: ${assetsDir}`);
}

const assets = readdirSync(assetsDir)
  .map((name) => {
    const fullPath = path.join(assetsDir, name);
    return { name, fullPath, mtimeMs: statSync(fullPath).mtimeMs };
  })
  .filter((item) => item.name.endsWith('.js') || item.name.endsWith('.css'));

const entry = assets
  .filter((item) => /^desktop-entry-.+\.js$/.test(item.name) || /^index-.+\.js$/.test(item.name))
  .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];

if (!entry) {
  throw new Error('Desktop frontend build did not produce a JavaScript entry bundle.');
}

const styles = assets
  .filter((item) => item.name.endsWith('.css'))
  .sort((a, b) => a.name.localeCompare(b.name));

const inlineStyles = styles
  .map((item) => readFileSync(item.fullPath, 'utf8'))
  .join('\n');

const criticalStyle = 'html,body,#root{min-height:100%;margin:0;background:#050507;color:#fff}body{overflow:hidden}';

const html = `<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex, nofollow" />
    <title>StreamNyaa Desktop</title>
    <style>${criticalStyle}${inlineStyles ? `\n${inlineStyles}` : ''}</style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/${entry.name}"></script>
  </body>
</html>
`;

writeFileSync(indexFile, html, 'utf8');
console.log(`Wrote clean desktop HTML shell: ${indexFile}`);
console.log(`  Entry JS: ${entry.name}`);
if (styles.length) console.log(`  CSS: ${styles.map((item) => item.name).join(', ')}`);
