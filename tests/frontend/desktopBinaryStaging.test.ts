// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import path from 'node:path';
import { expect, it } from 'vitest';

it('visits every payload entry even after earlier files changed', () => {
  const source = readFileSync('scripts/prepare-desktop-binaries.mjs', 'utf8')
    .replace(/^import .*;\r?\n/gm, '').split('if (!isWindows)')[0];
  const copied: string[] = [];
  const fs = {
    mkdirSync: () => {}, existsSync: () => false,
    readdirSync: (dir: string) => (dir === 'payload' ? ['a.dll', 'fonts', 'z.dll'] : ['one.ttf', 'two.ttf'])
      .map(name => ({ name, isDirectory: () => name === 'fonts' })),
    copyFileSync: (from: string) => copied.push(path.basename(from)),
  };
  runInNewContext(source + '\ncopyFolderContent("payload", "staged");', { fs, path, process: { cwd: () => '.', env: {}, platform: 'win32' } });
  expect(copied).toEqual(['a.dll', 'one.ttf', 'two.ttf', 'z.dll']);
});
