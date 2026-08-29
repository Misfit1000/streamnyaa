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

const criticalStyle = `
html,body,#root{min-height:100%;margin:0;background:#070709;color:#f7f7f8}
body{overflow:hidden;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.sn-boot{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:radial-gradient(circle at 50% 42%,rgba(177,18,42,.16),transparent 34%),#070709;transition:opacity 180ms ease,visibility 180ms ease}
.sn-boot--leaving{opacity:0;visibility:hidden;pointer-events:none}
.sn-boot__content{display:flex;flex-direction:column;align-items:center;gap:18px;transform:translateY(-2vh)}
.sn-boot__mark{width:74px;height:74px;color:#f32645;filter:drop-shadow(0 8px 8px rgba(243,38,69,.18));animation:sn-boot-enter 460ms cubic-bezier(.2,.8,.2,1) both}
.sn-boot__name{font-size:28px;font-weight:700;letter-spacing:-.04em}.sn-boot__name span{color:#f32645}
.sn-boot__status{font-size:13px;color:rgba(247,247,248,.48)}
.sn-boot__track{width:184px;height:2px;overflow:hidden;background:rgba(255,255,255,.08)}
.sn-boot__bar{height:100%;width:46%;background:#f32645;animation:sn-boot-progress 1.15s ease-in-out infinite}
@keyframes sn-boot-enter{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}
@keyframes sn-boot-progress{0%{transform:translateX(-120%)}100%{transform:translateX(290%)}}
@media(prefers-reduced-motion:reduce){.sn-boot__mark,.sn-boot__bar{animation:none}.sn-boot__bar{width:100%;opacity:.72}}
`;

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
    <div id="streamnyaa-desktop-boot" class="sn-boot" role="status" aria-live="polite" aria-label="Starting StreamNyaa Desktop">
      <div class="sn-boot__content">
        <svg class="sn-boot__mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3-9-7.56c0-1.25.5-2.4 1-3.44 0 0-1.89-6.42-.5-7 1.39-.58 4.72.23 6.5 2.23A9.04 9.04 0 0 1 12 5Z"/>
          <path d="M8 14v.5M16 14v.5M11.25 16.25h1.5L12 17l-.75-.75Z"/>
        </svg>
        <div class="sn-boot__name">Stream<span>Nyaa</span></div>
        <div class="sn-boot__track" aria-hidden="true"><div class="sn-boot__bar"></div></div>
        <div class="sn-boot__status">Restoring your desktop session</div>
      </div>
    </div>
    <div id="root"></div>
    <script type="module" src="/assets/${entry.name}"></script>
  </body>
</html>
`;

writeFileSync(indexFile, html, 'utf8');
console.log(`Wrote clean desktop HTML shell: ${indexFile}`);
console.log(`  Entry JS: ${entry.name}`);
if (styles.length) console.log(`  CSS: ${styles.map((item) => item.name).join(', ')}`);
