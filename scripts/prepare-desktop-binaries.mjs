import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const binDir = path.join(repoRoot, 'desktop', 'src-tauri', 'bin');

const isWindows = process.platform === 'win32';
const env = process.env;

const candidates = [
  {
    name: 'rqbit.exe',
    explicit: env.STREAMNYAA_RQBIT_PATH,
    fallbacks: [
      path.join(env.USERPROFILE || '', '.cargo', 'bin', 'rqbit.exe'),
      path.join(env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'rqbit.exe'),
    ],
    copyMode: 'file',
  },
  {
    name: 'mpv.exe',
    explicit: env.STREAMNYAA_MPV_PATH,
    fallbacks: [
      path.join(env.ProgramFiles || '', 'MPV Player', 'mpv.exe'),
      path.join(env.ProgramFiles || '', 'mpv', 'mpv.exe'),
      path.join(env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'mpv.exe'),
    ],
    copyMode: 'mpv',
  },
];

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function copyFileIfChanged(source, target) {
  if (fs.existsSync(target)) {
    const sourceStat = fs.statSync(source);
    const targetStat = fs.statSync(target);
    if (sourceStat.size === targetStat.size && sourceStat.mtimeMs === targetStat.mtimeMs) {
      return false;
    }
  }
  fs.copyFileSync(source, target);
  return true;
}

function copyFolderContent(sourceDir, targetDir) {
  let changed = false;
  ensureDir(targetDir);
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      changed = copyFolderContent(sourcePath, targetPath) || changed;
      continue;
    }
    changed = copyFileIfChanged(sourcePath, targetPath) || changed;
  }
  return changed;
}

function copyMpvPayload(sourceExe) {
  const sourceDir = path.dirname(sourceExe);
  copyFileIfChanged(sourceExe, path.join(binDir, 'mpv.exe'));

  const directFiles = ['mpv.com', 'd3dcompiler_43.dll', 'libmpv-2.dll'];
  for (const fileName of directFiles) {
    const sourcePath = path.join(sourceDir, fileName);
    if (fs.existsSync(sourcePath)) {
      copyFileIfChanged(sourcePath, path.join(binDir, fileName));
    }
  }

  const nestedDirs = ['mpv', 'portable_config'];
  for (const dirName of nestedDirs) {
    const sourcePath = path.join(sourceDir, dirName);
    if (fs.existsSync(sourcePath) && fs.statSync(sourcePath).isDirectory()) {
      copyFolderContent(sourcePath, path.join(binDir, dirName));
    }
  }
}

function requiredArtifactsFor(definition) {
  if (definition.name === 'mpv.exe') {
    return [
      path.join(binDir, 'mpv.exe'),
      path.join(binDir, 'd3dcompiler_43.dll'),
      path.join(binDir, 'mpv', 'fonts.conf'),
    ];
  }
  if (definition.name === 'rqbit.exe') {
    return [path.join(binDir, 'rqbit.exe')];
  }
  return [path.join(binDir, definition.name)];
}

function resolveSource(explicit, fallbacks) {
  for (const value of [explicit, ...fallbacks]) {
    if (value && fs.existsSync(value)) {
      return value;
    }
  }
  return null;
}

function stageBinary(definition) {
  const source = resolveSource(definition.explicit, definition.fallbacks);
  if (!source) {
    return {
      ok: false,
      name: definition.name,
      message: `Missing ${definition.name}. Set ${definition.name === 'rqbit.exe' ? 'STREAMNYAA_RQBIT_PATH' : 'STREAMNYAA_MPV_PATH'} to stage a release build.`,
    };
  }

  ensureDir(binDir);
  if (definition.copyMode === 'mpv') {
    copyMpvPayload(source);
  } else if (definition.copyMode === 'folder') {
    copyFolderContent(path.dirname(source), binDir);
  } else {
    copyFileIfChanged(source, path.join(binDir, definition.name));
  }

  return {
    ok: true,
    name: definition.name,
    source,
    artifacts: requiredArtifactsFor(definition),
  };
}

if (!isWindows) {
  console.log('Desktop binary staging is currently defined for Windows release builds.');
  process.exit(0);
}

const results = candidates.map(stageBinary);
const missing = results.filter((result) => !result.ok);
for (const result of results) {
  if (result.ok) {
    console.log(`Staged ${result.name} from ${result.source}`);
    for (const artifact of result.artifacts || []) {
      if (!fs.existsSync(artifact)) {
        console.warn(`Missing staged artifact for ${result.name}: ${artifact}`);
        if (env.STREAMNYAA_REQUIRE_BUNDLED_BINARIES === '1') {
          process.exitCode = 1;
        }
      }
    }
  } else {
    console.warn(result.message);
  }
}

if (missing.length && env.STREAMNYAA_REQUIRE_BUNDLED_BINARIES === '1') {
  process.exitCode = 1;
}
