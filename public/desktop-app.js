const form = document.querySelector('#settings-form');
const saveButton = document.querySelector('#save-button');
const startButton = document.querySelector('#start-button');
const stopButton = document.querySelector('#stop-button');
const showResaleButton = document.querySelector('#show-resale-button');
const refreshSearchOptionsButton = document.querySelector('#refresh-search-options');
const message = document.querySelector('#form-message');
const stateElement = document.querySelector('#watch-state');
const stateLabel = document.querySelector('#watch-state-label');
const authStateElement = document.querySelector('#auth-state');
const savedCardStatus = document.querySelector('#saved-card-status');
const logList = document.querySelector('#log-list');
const stateLabels = { idle: '準備完了', running: '監視中', stopping: '停止しています', matched: 'チケットを検出', error: 'エラー', 'login-required': '再ログインが必要' };

function input(name) { return form.elements.namedItem(name); }
function value(name) { return input(name).value.trim(); }
function setMessage(text, isError = false) { message.textContent = text; message.classList.toggle('error', isError); }

function renderConfig(config) {
  for (const name of ['free_word', 'search_artist', 'search_event', 'search_tour', 'p_date', 'p_date_from', 'p_date_to', 'num_of_ticket', 'max_price_per_ticket', 'reload_time']) {
    if (input(name).tagName === 'SELECT') continue;
    input(name).value = config[name] ?? '';
  }
  for (const name of ['open_match_page', 'auto_purchase']) input(name).checked = Boolean(config[name]);
  for (const name of ['number', 'expiration_month', 'expiration_year', 'cvv']) input(`payment_card.${name}`).value = '';
  savedCardStatus.textContent = config.payment_card?.saved
    ? `保存済みカード: **** **** **** ${config.payment_card.last4}`
    : '保存済みカードはありません。';
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
    free_word: value('free_word'), search_artist: value('search_artist'), search_event: value('search_event'), search_tour: value('search_tour'),
    p_date: value('p_date'), p_date_from: value('p_date_from'), p_date_to: value('p_date_to'),
    num_of_ticket: value('num_of_ticket'), max_price_per_ticket: value('max_price_per_ticket'), reload_time: value('reload_time'),
    headless: false, open_match_page: input('open_match_page').checked, auto_purchase: input('auto_purchase').checked,
    payment_card: {
      number: input('payment_card.number').value, expiration_month: input('payment_card.expiration_month').value,
      expiration_year: input('payment_card.expiration_year').value,
    },
  };
}

function renderStatus(status) {
  const current = status.status || 'idle';
  stateElement.className = `watch-state ${current}`;
  stateLabel.textContent = stateLabels[current] || current;
  const active = current === 'running' || current === 'stopping';
  const authenticationPending = status.authStatus !== 'authenticated';
  startButton.disabled = active || authenticationPending; saveButton.disabled = active; stopButton.hidden = !active; showResaleButton.disabled = active; refreshSearchOptionsButton.disabled = active;
  authStateElement.hidden = !authenticationPending;
  authStateElement.textContent = status.authStatus === 'required'
    ? 'AnyPASS への再ログインが必要です。右側の画面でログインすると監視を開始できます。'
    : 'AnyPASS のログイン状態を確認しています。';
  for (const element of form.querySelectorAll('input, select')) element.disabled = active;
  syncAutoPurchaseOptions(active);
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

function selectedValue(config, name) {
  return config?.[name] ?? input(name).value ?? '';
}

function renderSearchOptions(options, config) {
  const choicesLoaded = Boolean(options);
  for (const name of ['search_artist', 'search_event', 'search_tour']) {
    const select = input(name);
    const selected = selectedValue(config, name);
    const choices = options?.[name] || [];
    select.replaceChildren(new Option(choicesLoaded ? '指定なし' : '候補を取得中…', ''));
    if (selected && !choices.some((choice) => choice.value === selected)) {
      const label = choicesLoaded
        ? `現在候補にない保存済みの値 (${selected})`
        : `保存済みの値を確認中 (${selected})`;
      select.add(new Option(label, selected));
    }
    for (const choice of choices) select.add(new Option(choice.label, choice.value));
    select.value = selected;
  }
}

async function refreshSearchOptions() {
  refreshSearchOptionsButton.disabled = true;
  try {
    const options = await window.watcher.refreshSearchOptions();
    renderSearchOptions(options);
    setMessage('AnyPASS からアーティスト・イベント・ツアーの候補を更新しました。');
  } catch (error) {
    setMessage(`候補を取得できませんでした: ${error.message}`, true);
  } finally {
    refreshSearchOptionsButton.disabled = false;
  }
}

async function saveConfig() {
  const config = await window.watcher.saveConfig(configFromForm());
  renderConfig(config);
  setMessage('設定を保存しました。');
}

saveButton.addEventListener('click', async () => {
  try { await saveConfig(); } catch (error) { setMessage(error.message, true); }
});
input('auto_purchase').addEventListener('change', () => {
  syncAutoPurchaseOptions();
  if (input('auto_purchase').checked) setMessage('自動購入では詳細ページを開く設定を自動的に有効にしました。');
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    if (input('auto_purchase').checked && !window.confirm('決済情報の入力、購入確定、3Dセキュア開始まで自動化します。3Dセキュアの認証入力・完了は右側の画面でご自身で行います。続けますか？')) return;
    const cvv = input('payment_card.cvv').value;
    await saveConfig();
    input('payment_card.cvv').value = '';
    renderStatus(await window.watcher.start({ cvv }));
    setMessage('GUI内のブラウザで監視を開始しました。');
  } catch (error) { setMessage(error.message, true); }
});
stopButton.addEventListener('click', async () => {
  try { renderStatus(await window.watcher.stop()); setMessage('停止要求を送信しました。'); } catch (error) { setMessage(error.message, true); }
});
showResaleButton.addEventListener('click', async () => {
  try { await window.watcher.showResaleList(); setMessage('リセール一覧を右側に表示しました。'); } catch (error) { setMessage(error.message, true); }
});
refreshSearchOptionsButton.addEventListener('click', () => { void refreshSearchOptions(); });
async function refresh() {
  try { renderStatus(await window.watcher.getState()); } catch (error) { setMessage(error.message, true); }
}
async function initialize() {
  try {
    const config = await window.watcher.getConfig();
    renderConfig(config);
    renderSearchOptions(null, config);
    await refresh();
    await refreshSearchOptions();
  } catch (error) { setMessage(error.message, true); }
  window.setInterval(refresh, 1000);
}
initialize();
