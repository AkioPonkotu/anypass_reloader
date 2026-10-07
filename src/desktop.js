const fs = require('node:fs/promises');
const path = require('node:path');
const electron = require('electron');
const { app, BaseWindow, WebContentsView, ipcMain } = electron;
const { chromium } = require('playwright');
const { normalizeConfig } = require('./config');
const { run } = require('./index');
const { mergeConfig, sanitizeConfig } = require('./gui');

const RESALE_LIST_URL = 'https://store.anypass.jp/resale-list';
const DEBUG_PORT = 9412;
const LOG_LIMIT = 200;

// connectOverCDP() で Electron 内の WebContents を Playwright の Page として
// 扱うため、app が ready になる前に CDP を有効にする必要がある。
if (app?.commandLine) app.commandLine.appendSwitch('remote-debugging-port', String(DEBUG_PORT));

function parseDesktopArguments(argv) {
  const options = { configPath: 'config.json' };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--config') {
      options.configPath = argv[index + 1];
      if (!options.configPath) throw new Error('--config の後に設定ファイルのパスを指定してください。');
      index += 1;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else {
      throw new Error(`不明なオプションです: ${argument}`);
    }
  }
  return options;
}

function usage() {
  return '使い方: npm run gui -- [--config config.json]';
}

function timestamp() {
  return new Date().toLocaleTimeString('ja-JP', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    if (error instanceof SyntaxError) throw new Error(`設定ファイルが JSON として読めません: ${error.message}`);
    throw error;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, filePath);
}

function createDesktopController({ configPath, createWindow = createViews }) {
  const absoluteConfigPath = path.resolve(configPath);
  const state = { status: 'idle', logs: [], controller: null, error: null, automationBrowser: null };
  let views;

  const addLog = (message) => {
    state.logs = [...state.logs, { time: timestamp(), message }].slice(-LOG_LIMIT);
    console.log(`[Desktop ${timestamp()}] ${message}`);
  };
  const snapshot = () => ({
    status: state.status,
    error: state.error,
    logs: state.logs,
    configPath: absoluteConfigPath,
  });

  async function getEmbeddedPage(browserView) {
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
    const context = browser.contexts()[0];
    const embeddedUrl = browserView.webContents.getURL();
    const page = context.pages().find((candidate) => candidate.url() === embeddedUrl);
    if (!page) {
      await browser.close();
      throw new Error('埋め込みブラウザに接続できませんでした。アプリを再起動してください。');
    }
    // about:blank は埋め込み WebContents 専用に作成している。念のため対応する
    // Electron View が生きていることも確認する。
    if (browserView.webContents.isDestroyed()) {
      await browser.close();
      throw new Error('埋め込みブラウザが閉じられています。');
    }
    return { browser, context, page };
  }

  async function start() {
    if (state.status === 'running' || state.status === 'stopping') throw new Error('監視はすでに実行中です。');
    if (!views) throw new Error('画面の準備が完了していません。');

    state.status = 'running';
    state.error = null;
    state.logs = [];
    state.controller = new AbortController();
    addLog('GUI内のブラウザで監視を開始しました。');

    try {
      const automation = await getEmbeddedPage(views.browserView);
      state.automationBrowser = automation.browser;
      const matched = await run({
        configPath: absoluteConfigPath,
        signal: state.controller.signal,
        log: addLog,
        context: automation.context,
        page: automation.page,
      });
      if (state.controller.signal.aborted) {
        state.status = 'idle';
        addLog('監視を停止しました。画面はそのまま確認できます。');
      } else {
        state.status = matched ? 'matched' : 'idle';
        addLog(matched ? '一致するチケットを検出しました。' : '監視を終了しました。');
      }
    } catch (error) {
      state.status = 'error';
      state.error = error.message || String(error);
      addLog(`エラー: ${state.error}`);
    } finally {
      state.controller = null;
      await state.automationBrowser?.close().catch(() => {});
      state.automationBrowser = null;
    }
  }

  function stop() {
    if (state.controller && !state.controller.signal.aborted) {
      state.status = 'stopping';
      state.controller.abort();
    }
    return snapshot();
  }

  async function saveConfig(patch) {
    const merged = mergeConfig(await readJson(absoluteConfigPath), patch);
    normalizeConfig(merged, path.dirname(absoluteConfigPath));
    await writeJson(absoluteConfigPath, merged);
    return sanitizeConfig(merged);
  }

  function registerIpc() {
    ipcMain.handle('watcher:get-state', () => snapshot());
    ipcMain.handle('watcher:get-config', async () => sanitizeConfig(await readJson(absoluteConfigPath)));
    ipcMain.handle('watcher:save-config', (_, patch) => saveConfig(patch));
    ipcMain.handle('watcher:start', () => {
      void start();
      return snapshot();
    });
    ipcMain.handle('watcher:stop', () => stop());
    ipcMain.handle('watcher:show-resale-list', async () => {
      if (state.status === 'running' || state.status === 'stopping') throw new Error('監視中はブラウザを移動できません。');
      await views.browserView.webContents.loadURL(RESALE_LIST_URL);
      return snapshot();
    });
  }

  return {
    state,
    addLog,
    snapshot,
    create: async () => { views = await createWindow(); registerIpc(); return views; },
    start,
    stop,
    saveConfig,
  };
}

async function createViews() {
  const window = new BaseWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 650,
    title: 'AnyPASS Watcher',
    backgroundColor: '#f6f7f5',
  });
  const uiView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'desktop-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const browserView = new WebContentsView({
    webPreferences: {
      partition: 'persist:anypass-watcher',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.contentView.addChildView(uiView);
  window.contentView.addChildView(browserView);

  const layout = () => {
    const { width, height } = window.getContentBounds();
    const sidebarWidth = Math.min(460, Math.max(380, Math.round(width * 0.31)));
    uiView.setBounds({ x: 0, y: 0, width: sidebarWidth, height });
    browserView.setBounds({ x: sidebarWidth, y: 0, width: Math.max(1, width - sidebarWidth), height });
  };
  window.on('resize', layout);
  layout();

  browserView.webContents.setWindowOpenHandler(() => ({
    action: 'allow',
    overrideBrowserWindowOptions: { webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } },
  }));
  await uiView.webContents.loadFile(path.join(__dirname, '..', 'public', 'desktop.html'));
  await browserView.webContents.loadURL('about:blank');
  return { window, uiView, browserView };
}

async function main() {
  const options = parseDesktopArguments(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    app.quit();
    return;
  }
  await app.whenReady();
  const desktop = createDesktopController(options);
  await desktop.create();
  app.on('activate', async () => {
    if (BaseWindow.getAllWindows().length === 0) await desktop.create();
  });
  app.on('window-all-closed', () => app.quit());
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`GUI を起動できません: ${error.message}`);
    app.quit();
  });
}

module.exports = { createDesktopController, parseDesktopArguments };
