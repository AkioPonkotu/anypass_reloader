const form = document.querySelector('#settings-form');
const saveButton = document.querySelector('#save-button');
const startButton = document.querySelector('#start-button');
const stopButton = document.querySelector('#stop-button');
const showResaleButton = document.querySelector('#show-resale-button');
const message = document.querySelector('#form-message');
const stateElement = document.querySelector('#watch-state');
const stateLabel = document.querySelector('#watch-state-label');
const authStateElement = document.querySelector('#auth-state');
const logList = document.querySelector('#log-list');
const stateLabels = { idle: '準備完了', running: '監視中', stopping: '停止しています', matched: 'チケットを検出', error: 'エラー', 'login-required': '再ログインが必要' };

function input(name) { return form.elements.namedItem(name); }
function value(name) { return input(name).value.trim(); }
function setMessage(text, isError = false) { message.textContent = text; message.classList.toggle('error', isError); }

function renderConfig(config) {
  for (const name of ['free_word', 'p_date', 'p_date_from', 'p_date_to', 'num_of_ticket', 'max_price_per_ticket', 'reload_time']) input(name).value = config[name] ?? '';
  for (const name of ['open_match_page', 'auto_purchase']) input(name).checked = Boolean(config[name]);
  input('auth.email').value = config.auth?.email ?? '';
}

function configFromForm() {
  return {
    free_word: value('free_word'), p_date: value('p_date'), p_date_from: value('p_date_from'), p_date_to: value('p_date_to'),
    num_of_ticket: value('num_of_ticket'), max_price_per_ticket: value('max_price_per_ticket'), reload_time: value('reload_time'),
    headless: false, open_match_page: input('open_match_page').checked, auto_purchase: input('auto_purchase').checked,
    auth: { email: value('auth.email'), password: input('auth.password').value },
    credit_card: {
      number: input('credit_card.number').value, expiration_month: input('credit_card.expiration_month').value,
      expiration_year: input('credit_card.expiration_year').value, cvv: input('credit_card.cvv').value,
    },
  };
}

function renderStatus(status) {
  const current = status.status || 'idle';
  stateElement.className = `watch-state ${current}`;
  stateLabel.textContent = stateLabels[current] || current;
  const active = current === 'running' || current === 'stopping';
  const authenticationPending = status.authStatus !== 'authenticated';
  startButton.disabled = active || authenticationPending; saveButton.disabled = active; stopButton.hidden = !active; showResaleButton.disabled = active;
  authStateElement.hidden = !authenticationPending;
  authStateElement.textContent = status.authStatus === 'required'
    ? 'AnyPASS への再ログインが必要です。右側の画面でログインすると監視を開始できます。'
    : 'AnyPASS のログイン状態を確認しています。';
  for (const element of form.querySelectorAll('input')) element.disabled = active;
  if (!status.logs?.length) {
    logList.innerHTML = '<li class="empty">監視を開始すると、ここに状況が表示されます。</li>';
    return;
  }
  logList.replaceChildren(...status.logs.map((entry) => {
    const item = document.createElement('li');
    if (entry.message.startsWith('エラー:')) item.className = 'error-log';
    const time = document.createElement('time'); time.textContent = entry.time;
    const text = document.createElement('span'); text.textContent = entry.message;
    item.append(time, text);
    return item;
  }));
}

async function saveConfig() {
  const config = await window.watcher.saveConfig(configFromForm());
  renderConfig(config);
  for (const element of form.querySelectorAll('input[type="password"]')) element.value = '';
  setMessage('設定を保存しました。');
}

saveButton.addEventListener('click', async () => {
  try { await saveConfig(); } catch (error) { setMessage(error.message, true); }
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    if (input('auto_purchase').checked && !window.confirm('決済情報の入力と確認ボタンまで自動化します。3Dセキュアと購入確定は右側の画面でご自身で行います。続けますか？')) return;
    await saveConfig();
    renderStatus(await window.watcher.start());
    setMessage('GUI内のブラウザで監視を開始しました。');
  } catch (error) { setMessage(error.message, true); }
});
stopButton.addEventListener('click', async () => {
  try { renderStatus(await window.watcher.stop()); setMessage('停止要求を送信しました。'); } catch (error) { setMessage(error.message, true); }
});
showResaleButton.addEventListener('click', async () => {
  try { await window.watcher.showResaleList(); setMessage('リセール一覧を右側に表示しました。'); } catch (error) { setMessage(error.message, true); }
});
async function refresh() {
  try { renderStatus(await window.watcher.getState()); } catch (error) { setMessage(error.message, true); }
}
async function initialize() {
  try { renderConfig(await window.watcher.getConfig()); await refresh(); } catch (error) { setMessage(error.message, true); }
  window.setInterval(refresh, 1000);
}
initialize();
