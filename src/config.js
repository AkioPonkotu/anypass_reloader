const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_RELOAD_SECONDS = 10;
const MINIMUM_RELOAD_SECONDS = 0.1;

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
  const dateFrom = parseDateBoundary(config.p_date_from, 'p_date_from');
  const dateTo = parseDateBoundary(config.p_date_to, 'p_date_to');
  const ticketCount = parseTicketCount(config.num_of_ticket);
  const budget = parseBudget(config.max_price_per_ticket ?? config.budget);

  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new Error('p_date_from は p_date_to 以前の日付にしてください。');
  }
  if (date && (dateFrom || dateTo)) {
    throw new Error('p_date と p_date_from / p_date_to は同時に指定できません。');
  }

  if (!freeWord && !date && !dateFrom && !dateTo && !ticketCount && !budget) {
    throw new Error(
      'free_word、p_date、p_date_from、p_date_to、num_of_ticket、max_price_per_ticket のいずれかを設定してください。' +
        ' 条件なしで最初のチケットを検出しないための制約です。'
    );
  }

  const reloadSeconds = parseReloadSeconds(config.reload_time);
  const autoPurchase = parseBoolean(config.auto_purchase, 'auto_purchase', false);
  const auth = parseAuth(config.auth ?? config.account, autoPurchase);
  const creditCard = parseCreditCard(config.credit_card, autoPurchase);
  if (autoPurchase && !ticketCount) {
    throw new Error('auto_purchase を有効にするには num_of_ticket を指定してください。');
  }
  if (autoPurchase && config.open_match_page === false) {
    throw new Error('auto_purchase を有効にするには open_match_page を true にしてください。');
  }

  return {
    freeWord,
    date,
    dateFrom,
    dateTo,
    ticketCount,
    budget,
    reloadSeconds,
    autoPurchase,
    auth,
    creditCard,
    headless: config.headless !== false,
    openMatchPage: config.open_match_page !== false,
    userDataDir: resolveConfigPath(config.user_data_dir || '.anypass-profile', configDirectory),
    screenshotDir: resolveConfigPath(config.screenshot_dir || 'output/playwright', configDirectory),
  };
}

function parseBoolean(value, fieldName, defaultValue) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value !== 'boolean') {
    throw new Error(`${fieldName} は true または false で指定してください。`);
  }
  return value;
}

function parseAuth(value, required) {
  if (value === undefined || value === null) {
    if (required) throw new Error('auto_purchase を有効にするには auth.email と auth.password が必要です。');
    return null;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('auth は email と password を含むオブジェクトで指定してください。');
  }

  const email = stringValue(value.email);
  // パスワードの前後空白も値として扱うため、stringValue() は使わない。
  const password = value.password === undefined || value.password === null ? '' : String(value.password);
  if (!email || !password) {
    if (required) throw new Error('auto_purchase を有効にするには auth.email と auth.password が必要です。');
    return null;
  }
  return { email, password };
}

function parseCreditCard(value, required) {
  if (value === undefined || value === null) {
    if (required) throw new Error('auto_purchase を有効にするには credit_card の情報が必要です。');
    return null;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('credit_card は number、expiration_month、expiration_year、cvv を含むオブジェクトで指定してください。');
  }

  const number = digitsOnly(value.number);
  const month = digitsOnly(value.expiration_month);
  const year = digitsOnly(value.expiration_year);
  const cvv = digitsOnly(value.cvv);
  const invalid =
    !/^\d{13,19}$/u.test(number) ||
    !/^\d{1,2}$/u.test(month) ||
    Number(month) < 1 ||
    Number(month) > 12 ||
    !/^(?:\d{2}|\d{4})$/u.test(year) ||
    !/^\d{3}$/u.test(cvv);
  if (invalid) {
    if (required) {
      throw new Error('credit_card の値を確認してください（番号 13〜19 桁、有効期限の月 01〜12、年 2 または 4 桁、CVV 3 桁）。');
    }
    return null;
  }

  return {
    number,
    expirationMonth: month.padStart(2, '0'),
    // 決済画面は下 2 桁の年を受け取る。
    expirationYear: year.slice(-2),
    cvv,
  };
}

function digitsOnly(value) {
  return value === undefined || value === null ? '' : String(value).replace(/\D/g, '');
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

function parseDateBoundary(value, fieldName) {
  const raw = stringValue(value);
  if (!raw) return null;

  const match = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/u);
  if (!match) {
    throw new Error(`${fieldName} は YYYY/MM/DD 形式で指定してください。`);
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new Error(`${fieldName} には実在する日付を指定してください。`);
  }

  return `${yearText}-${monthText.padStart(2, '0')}-${dayText.padStart(2, '0')}`;
}

function parseBudget(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error('max_price_per_ticket は 1 円以上の整数にしてください。');
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
  parseAuth,
  parseCreditCard,
  parseDateBoundary,
  parseBudget,
  readConfig,
};
