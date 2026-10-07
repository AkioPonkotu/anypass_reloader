const fs = require('node:fs/promises');
const path = require('node:path');
const electron = require('electron');
const { app, BaseWindow, WebContentsView, ipcMain } = electron;
const { chromium } = require('playwright');
const { isElectronMainProcess } = require('./electron-main');
const { normalizeConfig } = require('./config');
const { run, LOGIN_REQUIRED_CODE } = require('./index');
const { mergeConfig, sanitizeConfig } = require('./gui');
const { isLoginRequired, openLoginPageIfNeeded } = require('./purchase');

const RESALE_LIST_URL = 'https://store.anypass.jp/resale-list';
const DEBUG_PORT = 9412;
const LOG_LIMIT = 200;

function defaultConfigPath(electronApp = app) {
  // インストール先は通常ユーザーが書き込めない。配布版は Windows の userData
  // (通常 %APPDATA% 配下) に設定・プロファイル・スクリーンショットを保存する。
  if (electronApp?.isPackaged && typeof electronApp.getPath === 'function') {
    return path.join(electronApp.getPath('userData'), 'config.json');
  }
  return 'config.json';
}

function parseDesktopArguments(argv, defaultPath = defaultConfigPath()) {
  const options = { configPath: defaultPath };
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

function notifyAndFocus(window, shell = electron.shell) {
  if (window && !(typeof window.isDestroyed === 'function' && window.isDestroyed())) {
    if (typeof window.isMinimized === 'function' && window.isMinimized()) window.restore();
    window.show?.();
    window.focus?.();
  }
  shell?.beep?.();
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
  const state = {
    status: 'idle', authStatus: 'checking', logs: [], controller: null, error: null, automationBrowser: null,
  };
  let views;
  let uiWebContents;
  let authenticationCheck;
  let authenticationTimer;

  const addLog = (message) => {
    state.logs = [...state.logs, { time: timestamp(), message }].slice(-LOG_LIMIT);
    console.log(`[Desktop ${timestamp()}] ${message}`);
  };
  const notifyUser = (message) => {
    notifyAndFocus(views?.window);
    addLog(message);
  };
  const snapshot = () => ({
    status: state.status,
    authStatus: state.authStatus,
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

  function setLoginRequired() {
    const changed = state.authStatus !== 'required';
    state.authStatus = 'required';
    if (changed) notifyUser('AnyPASS への再ログインが必要です。右側の画面でログインしてください。');

    if (state.controller && !state.controller.signal.aborted) {
      state.status = 'stopping';
      state.controller.abort();
    } else if (state.status !== 'running' && state.status !== 'stopping') {
      state.status = 'login-required';
    }
  }

  async function refreshAuthenticationNow() {
    if (!views || views.browserView.webContents.isDestroyed()) return snapshot();
    if (!views.browserView.webContents.getURL().startsWith('https://store.anypass.jp/')) return snapshot();

    let automation;
    try {
      automation = await getEmbeddedPage(views.browserView);
      if (await isLoginRequired(automation.page)) {
        setLoginRequired();
        // 一覧のヘッダーにログインボタンが表示された場合も、すぐ入力画面へ遷移する。
        await openLoginPageIfNeeded(automation.page);
      } else {
        const changed = state.authStatus !== 'authenticated';
        state.authStatus = 'authenticated';
        if (state.status === 'login-required') state.status = 'idle';
        if (changed) addLog('AnyPASS のログイン状態を確認しました。');
      }
    } catch (error) {
      // 画面遷移の最中は CDP の Page 対応付けが一時的にできないことがあるため、次の
      // did-finish-load で再試行する。利用者に誤った認証エラーを表示しない。
      if (!/埋め込みブラウザに接続できませんでした/.test(error.message || '')) throw error;
    } finally {
      await automation?.browser.close().catch(() => {});
    }
    return snapshot();
  }

  function refreshAuthentication() {
    authenticationCheck ||= refreshAuthenticationNow().finally(() => { authenticationCheck = null; });
    return authenticationCheck;
  }

  function startAuthenticationMonitor() {
    clearInterval(authenticationTimer);
    authenticationTimer = setInterval(() => {
      void refreshAuthentication().catch((error) => addLog(`認証状態を確認できませんでした: ${error.message}`));
    }, 1_500);
  }

  function stopAuthenticationMonitor() {
    clearInterval(authenticationTimer);
    authenticationTimer = null;
  }

  async function start() {
    if (state.status === 'running' || state.status === 'stopping') throw new Error('監視はすでに実行中です。');
    if (!views) throw new Error('画面の準備が完了していません。');
    await refreshAuthentication();
    if (state.authStatus !== 'authenticated') {
      throw new Error('AnyPASS への再ログインが必要です。右側の画面でログインしてから開始してください。');
    }

    state.status = 'running';
    state.error = null;
    state.logs = [];
    state.controller = new AbortController();
    addLog('GUI内のブラウザで監視を開始しました。');
    // SPA のヘッダーだけが更新されてログインボタンに戻る場合にも、短い間隔で検知する。
    startAuthenticationMonitor();

    try {
      const automation = await getEmbeddedPage(views.browserView);
      state.automationBrowser = automation.browser;
      const matched = await run({
        configPath: absoluteConfigPath,
        signal: state.controller.signal,
        log: addLog,
        context: automation.context,
        page: automation.page,
        manualLogin: true,
        onThreeDSecure: () => notifyUser('3Dセキュアを表示しました。右側の画面で認証を完了してください。'),
      });
      if (state.controller.signal.aborted) {
        if (state.authStatus === 'required') {
          state.status = 'login-required';
          addLog('監視を停止しました。再ログイン後に開始できます。');
        } else {
          state.status = 'idle';
          addLog('監視を停止しました。画面はそのまま確認できます。');
        }
      } else {
        state.status = matched ? 'matched' : 'idle';
        addLog(matched ? '一致するチケットを検出しました。' : '監視を終了しました。');
      }
    } catch (error) {
      if (error.code === LOGIN_REQUIRED_CODE) {
        setLoginRequired();
      } else {
        state.status = 'error';
        state.error = error.message || String(error);
        addLog(`エラー: ${state.error}`);
      }
    } finally {
      stopAuthenticationMonitor();
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

  let ipcRegistered = false;
  function registerIpc() {
    if (ipcRegistered) return;
    ipcRegistered = true;
    const handle = (channel, listener) => ipcMain.handle(channel, (event, ...args) => {
      if (event.sender !== uiWebContents) {
        throw new Error('許可されていない画面からの操作です。');
      }
      return listener(...args);
    });
    handle('watcher:get-state', () => snapshot());
    handle('watcher:get-config', async () => sanitizeConfig(await readJson(absoluteConfigPath)));
    handle('watcher:save-config', (patch) => saveConfig(patch));
    handle('watcher:start', () => {
      void start();
      return snapshot();
    });
    handle('watcher:stop', () => stop());
    handle('watcher:show-resale-list', async () => {
      if (state.status === 'running' || state.status === 'stopping') throw new Error('監視中はブラウザを移動できません。');
      await views.browserView.webContents.loadURL(RESALE_LIST_URL);
      return snapshot();
    });
  }

  return {
    state,
    addLog,
    snapshot,
    create: async () => {
      views = await createWindow({
        onUiViewCreated: (uiView) => {
          uiWebContents = uiView.webContents;
          registerIpc();
        },
      });
      // テスト用の createWindow など、コールバックを実装しない生成関数にも対応する。
      uiWebContents ||= views.uiView.webContents;
      registerIpc();
      views.browserView.webContents.on('did-finish-load', () => {
        void refreshAuthentication().catch((error) => addLog(`認証状態を確認できませんでした: ${error.message}`));
      });
      await refreshAuthentication();
      return views;
    },
    start,
    stop,
    saveConfig,
  };
}

function isAllowedRemoteUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

async function createViews({ onUiViewCreated } = {}) {
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

  // ローカル UI と外部サイトを分離し、外部サイトには HTTPS 以外への遷移・
  // 権限要求・Node API を許可しない。3D セキュアの HTTPS ポップアップは維持する。
  uiView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  browserView.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  browserView.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isAllowedRemoteUrl(targetUrl)) event.preventDefault();
  });

  const layout = () => {
    const { width, height } = window.getContentBounds();
    const sidebarWidth = Math.min(460, Math.max(380, Math.round(width * 0.31)));
    uiView.setBounds({ x: 0, y: 0, width: sidebarWidth, height });
    browserView.setBounds({ x: sidebarWidth, y: 0, width: Math.max(1, width - sidebarWidth), height });
  };
  window.on('resize', layout);
  layout();

  browserView.webContents.setWindowOpenHandler(({ url }) => (
    isAllowedRemoteUrl(url)
      ? {
        action: 'allow',
        overrideBrowserWindowOptions: {
          webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
        },
      }
      : { action: 'deny' }
  ));
  // desktop-app.js の初期化時 IPC より先にハンドラを登録する。
  onUiViewCreated?.(uiView);
  await uiView.webContents.loadFile(path.join(__dirname, '..', 'public', 'desktop.html'));
  await browserView.webContents.loadURL(RESALE_LIST_URL);
  return { window, uiView, browserView };
}

async function main() {
  const options = parseDesktopArguments(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    app.quit();
    return;
  }
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  app.setAppUserModelId('com.github.akioponkotu.anypasswatcher');
  // connectOverCDP() で Electron 内の WebContents を Playwright の Page として
  // 扱うため、app が ready になる前に CDP を有効にする必要がある。
  app.commandLine.appendSwitch('remote-debugging-port', String(DEBUG_PORT));

  let desktop;
  app.on('second-instance', () => {
    const window = BaseWindow.getAllWindows()[0];
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });
  await app.whenReady();
  desktop = createDesktopController(options);
  await desktop.create();
  app.on('activate', async () => {
    if (BaseWindow.getAllWindows().length === 0) await desktop.create();
  });
  app.on('window-all-closed', () => app.quit());
}

// Electron CLI は CommonJS のエントリポイントを dynamic import するため、
// require.main === module では起動を判定できない。
if (isElectronMainProcess()) {
  // Squirrel はインストール・更新・削除時にアプリを一度起動する。通常の GUI を
  // 開かないよう、Forge の推奨ランタイム処理を main process の最初に行う。
  if (process.platform === 'win32' && require('electron-squirrel-startup')) {
    app.quit();
  } else {
    main().catch((error) => {
      console.error(`GUI を起動できません: ${error.message}`);
      app.quit();
    });
  }
}

module.exports = { createDesktopController, defaultConfigPath, notifyAndFocus, parseDesktopArguments };
