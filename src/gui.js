const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { normalizeConfig } = require('./config');
const { run } = require('./index');

const PUBLIC_DIRECTORY = path.join(__dirname, '..', 'public');
const MAX_REQUEST_BYTES = 1024 * 1024;
const LOG_LIMIT = 200;

function parseGuiArguments(argv) {
  const options = { configPath: 'config.json', port: 4317, open: true };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--config') {
      options.configPath = argv[index + 1];
      if (!options.configPath) throw new Error('--config の後に設定ファイルのパスを指定してください。');
      index += 1;
    } else if (argument === '--port') {
      options.port = Number(argv[index + 1]);
      if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
        throw new Error('--port は 1〜65535 の整数で指定してください。');
      }
      index += 1;
    } else if (argument === '--no-open') {
      options.open = false;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else {
      throw new Error(`不明なオプションです: ${argument}`);
    }
  }
  return options;
}

function usage() {
  return [
    '使い方: npm run gui -- [--config config.json] [--port 4317] [--no-open]',
    '',
    '  --config <path>  設定 JSON（既定: config.json）',
    '  --port <number> GUI のポート（既定: 4317）',
    '  --no-open        ブラウザを自動で開かない',
  ].join('\n');
}

function timestamp() {
  return new Date().toLocaleTimeString('ja-JP', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function maskCardNumber(value) {
  const number = value === undefined || value === null ? '' : String(value);
  return number ? `${'*'.repeat(Math.max(0, number.length - 4))}${number.slice(-4)}` : '';
}

function isMaskedCardNumber(value) {
  return /^\*+\d{4}$/u.test(String(value));
}

function sanitizeConfig(config) {
  const raw = plainObject(config);
  const card = plainObject(raw.credit_card);
  return {
    free_word: raw.free_word ?? '', p_date: raw.p_date ?? '', p_date_from: raw.p_date_from ?? '', p_date_to: raw.p_date_to ?? '',
    num_of_ticket: raw.num_of_ticket ?? '', max_price_per_ticket: raw.max_price_per_ticket ?? raw.budget ?? '', reload_time: raw.reload_time ?? 10,
    headless: raw.headless !== false, open_match_page: raw.open_match_page !== false, auto_purchase: raw.auto_purchase === true,
    credit_card: {
      number: maskCardNumber(card.number),
      expiration_month: card.expiration_month ?? '',
      expiration_year: card.expiration_year ?? '',
      cvv: card.cvv ?? '',
    },
    user_data_dir: raw.user_data_dir ?? '.anypass-profile', screenshot_dir: raw.screenshot_dir ?? 'output/playwright',
  };
}

function mergeConfig(existing, patch) {
  const current = plainObject(existing);
  const input = plainObject(patch);
  const merged = { ...current };
  const fields = [
    'free_word', 'p_date', 'p_date_from', 'p_date_to', 'num_of_ticket', 'max_price_per_ticket', 'reload_time',
    'headless', 'open_match_page', 'auto_purchase', 'user_data_dir', 'screenshot_dir',
  ];
  for (const field of fields) if (Object.hasOwn(input, field)) merged[field] = input[field];
  // 自動購入は一致した出品の詳細画面で続行するため、詳細ページを開く設定が必須。
  // GUI では依存する設定を自動で有効にし、保存時の分かりにくい検証エラーを防ぐ。
  if (merged.auto_purchase === true) merged.open_match_page = true;
  delete merged.budget;
  // 旧版で保存された認証情報は、GUI で保存し直したタイミングで安全に削除する。
  delete merged.auth;
  delete merged.account;

  const inputCard = plainObject(input.credit_card);
  const existingCard = plainObject(current.credit_card);
  const cardFields = ['number', 'expiration_month', 'expiration_year', 'cvv'];
  if (cardFields.some((field) => inputCard[field])) {
    merged.credit_card = { ...existingCard };
    for (const field of cardFields) {
      if (inputCard[field] && !(field === 'number' && isMaskedCardNumber(inputCard[field]))) {
        merged.credit_card[field] = inputCard[field];
      }
    }
  }
  return merged;
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

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_REQUEST_BYTES) {
        reject(new Error('リクエストが大きすぎます。'));
        request.destroy();
        return;
      }
      body += chunk;
    });
    request.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('JSON の形式が正しくありません。')); }
    });
    request.on('error', reject);
  });
}

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

function openBrowser(url) {
  const command = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  const child = spawn(command[0], command[1], { detached: true, stdio: 'ignore' });
  child.unref();
}

function createGuiServer({ configPath }) {
  const absoluteConfigPath = path.resolve(configPath);
  const state = { status: 'idle', logs: [], controller: null, error: null };
  const addLog = (message) => {
    state.logs.push({ time: timestamp(), message });
    state.logs = state.logs.slice(-LOG_LIMIT);
    console.log(`[GUI ${timestamp()}] ${message}`);
  };
  const status = () => ({ status: state.status, error: state.error, logs: state.logs, configPath: absoluteConfigPath });
  const startWatcher = async () => {
    if (state.status === 'running' || state.status === 'stopping') throw new Error('監視はすでに実行中です。');
    state.status = 'running'; state.error = null; state.logs = []; state.controller = new AbortController();
    addLog('監視を開始しました。');
    try {
      const matched = await run({ configPath: absoluteConfigPath, signal: state.controller.signal, log: addLog });
      if (state.controller.signal.aborted) {
        state.status = 'idle'; addLog('監視を停止しました。');
      } else {
        state.status = matched ? 'matched' : 'idle'; addLog(matched ? '一致するチケットを検出しました。' : '監視を終了しました。');
      }
    } catch (error) {
      state.status = 'error'; state.error = error.message || String(error); addLog(`エラー: ${state.error}`);
    } finally {
      state.controller = null;
    }
  };
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/api/config') return sendJson(response, 200, { config: sanitizeConfig(await readJson(absoluteConfigPath)) });
      if (request.method === 'PUT' && url.pathname === '/api/config') {
        const merged = mergeConfig(await readJson(absoluteConfigPath), await readRequestBody(request));
        normalizeConfig(merged, path.dirname(absoluteConfigPath));
        await writeJson(absoluteConfigPath, merged);
        return sendJson(response, 200, { config: sanitizeConfig(merged) });
      }
      if (request.method === 'GET' && url.pathname === '/api/status') return sendJson(response, 200, status());
      if (request.method === 'POST' && url.pathname === '/api/start') {
        void startWatcher().catch((error) => {
          state.status = 'error';
          state.error = error.message || String(error);
          addLog(`エラー: ${state.error}`);
        });
        return sendJson(response, 202, status());
      }
      if (request.method === 'POST' && url.pathname === '/api/stop') {
        if (state.controller && !state.controller.signal.aborted) { state.status = 'stopping'; state.controller.abort(); }
        return sendJson(response, 200, status());
      }
      if (request.method === 'GET' && url.pathname === '/') {
        const html = await fs.readFile(path.join(PUBLIC_DIRECTORY, 'index.html'));
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return response.end(html);
      }
      if (request.method === 'GET' && url.pathname === '/favicon.ico') {
        response.writeHead(204);
        return response.end();
      }
      if (request.method === 'GET' && (url.pathname === '/app.js' || url.pathname === '/app.css')) {
        const fileName = url.pathname.slice(1);
        const file = await fs.readFile(path.join(PUBLIC_DIRECTORY, fileName));
        response.writeHead(200, { 'Content-Type': fileName.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        return response.end(file);
      }
      response.writeHead(404).end();
    } catch (error) {
      sendJson(response, 400, { error: error.message || String(error) });
    }
  });
  return { server, openBrowser, state };
}

async function main() {
  const options = parseGuiArguments(process.argv.slice(2));
  if (options.help) return console.log(usage());
  const gui = createGuiServer(options);
  await new Promise((resolve) => gui.server.listen(options.port, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${options.port}`;
  console.log(`AnyPASS Watcher GUI: ${url}`);
  if (options.open) openBrowser(url);
}

if (require.main === module) {
  main().catch((error) => { console.error(`GUI を起動できません: ${error.message}`); process.exitCode = 1; });
}

module.exports = { createGuiServer, mergeConfig, parseGuiArguments, sanitizeConfig };
