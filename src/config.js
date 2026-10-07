const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_RELOAD_SECONDS = 10;
const MINIMUM_RELOAD_SECONDS = 3;

function readConfig(configPath) {
  const absolutePath = path.resolve(configPath);
  let raw;

  try {
    raw = fs.readFileSync(absolutePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(
        `設定ファイルがありません: ${absolutePath}\n` +
          'config.example.json を config.json としてコピーして条件を設定してください。'
      );
    }
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`設定ファイルが JSON として読めません: ${error.message}`);
  }

  return normalizeConfig(parsed, path.dirname(absolutePath));
}

function normalizeConfig(config, configDirectory) {
  const freeWord = stringValue(config.free_word);
  const date = stringValue(config.p_date);
  const ticketCount = parseTicketCount(config.num_of_ticket);

  if (!freeWord && !date && !ticketCount) {
    throw new Error(
      'free_word、p_date、num_of_ticket のいずれかを設定してください。' +
        ' 条件なしで最初のチケットを検出しないための制約です。'
    );
  }

  const reloadSeconds = parseReloadSeconds(config.reload_time);

  return {
    freeWord,
    date,
    ticketCount,
    reloadSeconds,
    headless: config.headless !== false,
    openMatchPage: config.open_match_page !== false,
    userDataDir: resolveConfigPath(config.user_data_dir || '.anypass-profile', configDirectory),
    screenshotDir: resolveConfigPath(config.screenshot_dir || 'output/playwright', configDirectory),
  };
}

function stringValue(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function parseTicketCount(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error('num_of_ticket は 1 以上の整数にしてください。');
  }
  return parsed;
}

function parseReloadSeconds(value) {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_RELOAD_SECONDS;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < MINIMUM_RELOAD_SECONDS) {
    throw new Error(`reload_time は ${MINIMUM_RELOAD_SECONDS} 秒以上にしてください。`);
  }
  return parsed;
}

function resolveConfigPath(value, configDirectory) {
  return path.resolve(configDirectory, String(value));
}

module.exports = {
  DEFAULT_RELOAD_SECONDS,
  MINIMUM_RELOAD_SECONDS,
  normalizeConfig,
  readConfig,
};
