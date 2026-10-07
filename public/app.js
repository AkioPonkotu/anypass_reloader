const form = document.querySelector('#settings-form');
const saveButton = document.querySelector('#save-button');
const startButton = document.querySelector('#start-button');
const stopButton = document.querySelector('#stop-button');
const message = document.querySelector('#form-message');
const stateElement = document.querySelector('#watch-state');
const stateLabel = document.querySelector('#watch-state-label');
const logList = document.querySelector('#log-list');
const configPath = document.querySelector('#config-path');
const stateLabels = { idle: '準備完了', running: '監視中', stopping: '停止しています', matched: 'チケットを検出', error: 'エラー' };

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '処理に失敗しました。');
  return data;
}
function input(name) { return form.elements.namedItem(name); }
function value(name) { return input(name).value.trim(); }
function setMessage(text, isError = false) { message.textContent = text; message.classList.toggle('error', isError); }

function renderConfig(config) {
  for (const name of ['free_word', 'p_date', 'p_date_from', 'p_date_to', 'num_of_ticket', 'max_price_per_ticket', 'reload_time']) input(name).value = config[name] ?? '';
  for (const name of ['headless', 'open_match_page', 'auto_purchase']) input(name).checked = Boolean(config[name]);
  for (const name of ['number', 'expiration_month', 'expiration_year', 'cvv']) input(`credit_card.${name}`).value = config.credit_card?.[name] ?? '';
  syncAutoPurchaseOptions();
}
function syncAutoPurchaseOptions(active = false) {
  const openMatchPage = input('open_match_page');
  const autoPurchase = input('auto_purchase');
  if (autoPurchase.checked) openMatchPage.checked = true;
  openMatchPage.disabled = active || autoPurchase.checked;
}
function configFromForm() {
  return {
    free_word: value('free_word'), p_date: value('p_date'), p_date_from: value('p_date_from'), p_date_to: value('p_date_to'),
    num_of_ticket: value('num_of_ticket'), max_price_per_ticket: value('max_price_per_ticket'), reload_time: value('reload_time'),
    headless: input('headless').checked, open_match_page: input('open_match_page').checked, auto_purchase: input('auto_purchase').checked,
    credit_card: {
      number: input('credit_card.number').value, expiration_month: input('credit_card.expiration_month').value,
      expiration_year: input('credit_card.expiration_year').value, cvv: input('credit_card.cvv').value,
    },
  };
}
function renderStatus(status) {
  const currentState = status.status || 'idle';
  stateElement.className = `watch-state ${currentState}`;
  stateLabel.textContent = stateLabels[currentState] || currentState;
  configPath.textContent = status.configPath || '';
  const active = currentState === 'running' || currentState === 'stopping';
  startButton.disabled = active; saveButton.disabled = active; stopButton.hidden = !active;
  for (const element of form.querySelectorAll('input')) element.disabled = active;
  syncAutoPurchaseOptions(active);
  if (!status.logs?.length) { logList.innerHTML = '<li class="empty-log">監視を開始すると、ここに状況が表示されます。</li>'; return; }
  logList.replaceChildren(...status.logs.map((entry) => {
    const item = document.createElement('li');
    if (entry.message.startsWith('エラー:')) item.classList.add('log-error');
    const time = document.createElement('time'); time.textContent = entry.time;
    const text = document.createElement('span'); text.textContent = entry.message;
    item.append(time, text); return item;
  }));
}
async function saveConfig() {
  const response = await request('/api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(configFromForm()) });
  renderConfig(response.config);
  setMessage('設定を保存しました。');
}
saveButton.addEventListener('click', async () => { try { await saveConfig(); } catch (error) { setMessage(error.message, true); } });
input('auto_purchase').addEventListener('change', () => {
  syncAutoPurchaseOptions();
  if (input('auto_purchase').checked) setMessage('自動購入では詳細ページを開く設定を自動的に有効にしました。');
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  try { await saveConfig(); await request('/api/start', { method: 'POST' }); setMessage('監視を開始しました。'); await refreshStatus(); } catch (error) { setMessage(error.message, true); }
});
stopButton.addEventListener('click', async () => { try { await request('/api/stop', { method: 'POST' }); setMessage('停止要求を送信しました。'); await refreshStatus(); } catch (error) { setMessage(error.message, true); } });
async function refreshStatus() { try { renderStatus(await request('/api/status')); } catch (error) { setMessage(error.message, true); } }
async function initialize() {
  try { const { config } = await request('/api/config'); renderConfig(config); await refreshStatus(); } catch (error) { setMessage(error.message, true); }
  window.setInterval(refreshStatus, 1000);
}
initialize();
