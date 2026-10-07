const fs = require('node:fs/promises');
const path = require('node:path');

const CARD_FILE_NAME = 'payment-card.bin';

function digitsOnly(value) {
  return value === undefined || value === null ? '' : String(value).replace(/\D/g, '');
}

function parseStoredCard(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('カード番号と有効期限を入力してください。');
  }
  const number = digitsOnly(value.number);
  const month = digitsOnly(value.expiration_month ?? value.expirationMonth);
  const year = digitsOnly(value.expiration_year ?? value.expirationYear);
  if (
    !/^\d{13,19}$/u.test(number) ||
    !/^\d{1,2}$/u.test(month) || Number(month) < 1 || Number(month) > 12 ||
    !/^(?:\d{2}|\d{4})$/u.test(year)
  ) {
    throw new Error('カード番号と有効期限を確認してください。');
  }
  return {
    number,
    expirationMonth: month.padStart(2, '0'),
    expirationYear: year.slice(-2),
  };
}

function parseCvv(value) {
  const cvv = digitsOnly(value);
  if (!/^\d{3,4}$/u.test(cvv)) {
    throw new Error('セキュリティコードを入力してください。');
  }
  return cvv;
}

function secureCardPath(userDataPath) {
  return path.join(userDataPath, CARD_FILE_NAME);
}

function cardStatus(card) {
  return card
    ? { saved: true, last4: card.number.slice(-4) }
    : { saved: false, last4: null };
}

async function writeSecureCard(filePath, input, safeStorage) {
  if (!safeStorage?.isEncryptionAvailable?.()) {
    throw new Error('この Windows ユーザーの暗号化領域を利用できません。');
  }
  const card = parseStoredCard(input);
  const encrypted = safeStorage.encryptString(JSON.stringify(card));
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(temporaryPath, encrypted.toString('base64'), { encoding: 'utf8', mode: 0o600 });
  await fs.rename(temporaryPath, filePath);
  return cardStatus(card);
}

async function readSecureCard(filePath, safeStorage) {
  let encrypted;
  try {
    encrypted = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (!safeStorage?.isEncryptionAvailable?.()) {
    throw new Error('この Windows ユーザーの暗号化領域を利用できません。');
  }
  try {
    return parseStoredCard(JSON.parse(safeStorage.decryptString(Buffer.from(encrypted, 'base64'))));
  } catch (error) {
    throw new Error(`保存済みカード情報を復号できません: ${error.message}`);
  }
}

async function readSecureCardStatus(filePath, safeStorage) {
  return cardStatus(await readSecureCard(filePath, safeStorage));
}

module.exports = {
  CARD_FILE_NAME,
  cardStatus,
  parseCvv,
  parseStoredCard,
  readSecureCard,
  readSecureCardStatus,
  secureCardPath,
  writeSecureCard,
};
