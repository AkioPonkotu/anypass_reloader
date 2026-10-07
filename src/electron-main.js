function isElectronMainProcess({ electronVersion = process.versions.electron, processType = process.type } = {}) {
  return Boolean(electronVersion) && processType !== 'renderer';
}

module.exports = { isElectronMainProcess };
