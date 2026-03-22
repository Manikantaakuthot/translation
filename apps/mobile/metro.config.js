const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Include root workspace in watch folders
config.watchFolders = [workspaceRoot];

// Resolve modules: check mobile's own node_modules first, then root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Force ALL imports of react to the mobile-local copy (single instance).
// This prevents "Invalid hook call" from multiple React copies in a monorepo.
const mobileModules = path.resolve(projectRoot, 'node_modules');
const FORCE_SINGLE_INSTANCE = {
  react: require.resolve('react', { paths: [mobileModules] }),
  'react/jsx-runtime': require.resolve('react/jsx-runtime', { paths: [mobileModules] }),
  'react/jsx-dev-runtime': require.resolve('react/jsx-dev-runtime', { paths: [mobileModules] }),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (FORCE_SINGLE_INSTANCE[moduleName]) {
    return {
      filePath: FORCE_SINGLE_INSTANCE[moduleName],
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
