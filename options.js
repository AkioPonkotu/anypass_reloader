// AnyPass 出品チケット監視 - 設定画面スクリプト
const STORAGE_KEY = 'apw_config';

const fields = ['free_word', 'p_date', 'num_of_ticket', 'reload_time'];

function loadConfig() {
  chrome.storage.local.get([STORAGE_KEY], (result) => {
    const config = result[STORAGE_KEY] || {};
    fields.forEach((key) => {
      const el = document.getElementById(key);
      if (config[key] !== undefined && config[key] !== null) {
        el.value = config[key];
      }
    });
  });
}

function saveConfig() {
  const config = {};
  fields.forEach((key) => {
    const el = document.getElementById(key);
    config[key] = el.value.trim();
  });

  chrome.storage.local.set({ [STORAGE_KEY]: config }, () => {
    const statusEl = document.getElementById('status');
    statusEl.textContent = '保存しました';
    setTimeout(() => { statusEl.textContent = ''; }, 1500);
  });
}

document.addEventListener('DOMContentLoaded', loadConfig);
document.getElementById('save').addEventListener('click', saveConfig);
