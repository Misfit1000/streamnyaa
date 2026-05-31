import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const esbuildBinaryPath = path.join(repoRoot, 'node_modules', '@esbuild', 'win32-x64', 'esbuild.exe');

process.env.VITE_STREAMNYAA_APP_TARGET = 'desktop';
process.env.ESBUILD_BINARY_PATH = esbuildBinaryPath;

const configModule = await import(pathToFileURL(path.join(repoRoot, 'vite.config.mjs')).href);
try {
  await build({
    ...configModule.default,
    configFile: false,
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Desktop frontend build failed: ${message}`);
  process.exit(1);
}
