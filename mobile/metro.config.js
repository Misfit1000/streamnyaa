const path = require('path');
const fs = require('fs');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');
const configuredWorkspaceRoot = process.env.STREAMNYAA_WORKSPACE_ROOT;
const realWorkspaceRoot = configuredWorkspaceRoot
  ? path.resolve(configuredWorkspaceRoot)
  : fs.realpathSync(workspaceRoot);
const config = getDefaultConfig(projectRoot);

// Include both spellings. Windows release builds may use a short SUBST path to
// avoid Ninja's 260-character object-file limit, while Metro canonicalizes
// imported shared files back to their physical workspace path.
config.watchFolders = [...new Set([workspaceRoot, realWorkspaceRoot])];
config.resolver.nodeModulesPaths = [...new Set([
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
  path.resolve(realWorkspaceRoot, 'mobile', 'node_modules'),
  path.resolve(realWorkspaceRoot, 'node_modules'),
])];

// Metro can treat a Windows SUBST drive and its physical path as separate
// roots. Resolve the small shared runtime package explicitly so release builds
// still consume the same account/source/preference logic as desktop and web.
const sharedRoot = path.resolve(realWorkspaceRoot, 'shared');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const sharedPrefix = '../../../shared/';

  if (moduleName.startsWith(sharedPrefix)) {
    const sharedModule = moduleName.slice(sharedPrefix.length);
    const candidate = path.resolve(sharedRoot, `${sharedModule}.ts`);
    const isInsideSharedRoot = candidate.startsWith(`${sharedRoot}${path.sep}`);

    if (isInsideSharedRoot && fs.existsSync(candidate)) {
      return { type: 'sourceFile', filePath: candidate };
    }
  }

  return context.resolveRequest(context, moduleName, platform);
};
config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true,
  },
});

module.exports = config;
