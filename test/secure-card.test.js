const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseCvv,
  readSecureCard,
  readSecureCardStatus,
  writeSecureCard,
} = require('../src/secure-card');

const fakeSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`encrypted:${value}`, 'utf8'),
  decryptString: (value) => value.toString('utf8').replace(/^encrypted:/u, ''),
};

test('secure card storage encrypts the number and only exposes status separately', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'anypass-card-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'payment-card.bin');

  const status = await writeSecureCard(filePath, {
    number: '4111-1111 1111-1111', expiration_month: '7', expiration_year: '2028',
  }, fakeSafeStorage);

  assert.deepEqual(status, { saved: true, last4: '1111' });
  assert.doesNotMatch(await fs.readFile(filePath, 'utf8'), /4111111111111111/u);
  assert.deepEqual(await readSecureCardStatus(filePath, fakeSafeStorage), { saved: true, last4: '1111' });
  assert.deepEqual(await readSecureCard(filePath, fakeSafeStorage), {
    number: '4111111111111111', expirationMonth: '07', expirationYear: '28',
  });
});

test('security codes are validated but are not accepted as persistent card data', () => {
  assert.equal(parseCvv('123'), '123');
  assert.equal(parseCvv('1234'), '1234');
  assert.throws(() => parseCvv('12'), /セキュリティコード/);
});
