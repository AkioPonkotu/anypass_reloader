const path = require('node:path');

// Electron Forge is the packaging tool recommended by Electron's distribution
// documentation. Keep the configuration in code so signing can be added by CI
// without putting certificate credentials in this repository.
const ignoredRoots = new Set(['.git', '.anypass-profile', '.playwright-cli', 'output', 'out', 'test']);

function shouldIgnoreFromPackage(filePath) {
  // electron-packager calls this with both absolute paths and slash-prefixed
  // project-relative paths, depending on the copy phase.
  const relativePath = filePath.startsWith('/')
    ? filePath.slice(1)
    : path.relative(__dirname, filePath).split(path.sep).join('/');
  const root = relativePath.split('/', 1)[0];
  return (
    ignoredRoots.has(root) ||
    root.startsWith('.') ||
    ['config.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'].includes(relativePath) ||
    relativePath.startsWith('node_modules/.bin/') ||
    /\.o(?:bj)?$/u.test(relativePath)
  );
}

module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'AnyPASSWatcher',
    prune: true,
    // Packager passes project-relative paths without a leading slash in some
    // Windows code paths. A function keeps private local files out reliably.
    ignore: shouldIgnoreFromPackage,
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: 'AnyPASSWatcher',
        authors: 'AnyPASS Watcher contributors',
        description: 'AnyPASS resale-list watcher with an embedded Electron browser',
        setupExe: 'AnyPASSWatcherSetup.exe',
        noMsi: true,
      },
    },
  ],
};
