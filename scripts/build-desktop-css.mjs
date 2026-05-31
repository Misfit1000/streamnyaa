import { existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, optimize } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const assetsDir = path.join(repoRoot, 'dist', 'assets');
const inputCss = path.join(repoRoot, 'src', 'index.css');
const outputCss = path.join(assetsDir, 'desktop-style.css');

if (!existsSync(assetsDir)) {
  throw new Error(`Desktop assets folder not found: ${assetsDir}`);
}

const sourceCss = await readFile(inputCss, 'utf8');
const compiler = await compile(sourceCss, {
  base: repoRoot,
  from: inputCss,
  onDependency() {},
});

const scanner = new Scanner({
  sources: [
    {
      base: path.join(repoRoot, 'src'),
      pattern: '**/*.{ts,tsx,js,jsx}',
      negated: false,
    },
  ],
});

const candidates = scanner.scan();
const generatedCss = compiler.build(candidates);
const minifiedCss = optimize(generatedCss, { minify: true, file: outputCss }).code;

for (const entry of ['desktop-entry-', 'index-']) {
  for (const file of readdirSync(assetsDir)) {
    if (file.startsWith(entry) && file.endsWith('.css')) {
      rmSync(path.join(assetsDir, file), { force: true });
    }
  }
}

writeFileSync(outputCss, minifiedCss, 'utf8');
console.log(`Compiled desktop CSS: ${outputCss}`);
console.log(`  Candidates: ${candidates.length}`);
console.log(`  Size: ${minifiedCss.length} bytes`);
