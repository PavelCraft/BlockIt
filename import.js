// ============================================================
//  BLOCKIT — IMPORT SCRIPT
//  Handles importing rules from a JSON file or pasted text
// ============================================================

// ============================================================
//  STATE
// ============================================================

let importedRules = [];

// ============================================================
//  DOM REFS
// ============================================================

const jsonInput = document.getElementById('jsonInput');
const fileInput = document.getElementById('fileInput');
const loadFileBtn = document.getElementById('loadFileBtn');
const clearBtn = document.getElementById('clearBtn');
const replaceBtn = document.getElementById('replaceBtn');
const addBtn = document.getElementById('addBtn');
const closeBtn = document.getElementById('closeBtn');
const statusDiv = document.getElementById('status');
const fileInfo = document.getElementById('fileInfo');

// ============================================================
//  LOCALIZATION
// ============================================================

function localizeImport() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const msg = chrome.i18n.getMessage(key);
    if (msg) el.textContent = msg;
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    const msg = chrome.i18n.getMessage(key);
    if (msg) el.placeholder = msg;
  });
}

// ============================================================
//  UI HELPERS
// ============================================================

function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = type;
  statusDiv.style.display = 'block';
}

function hideStatus() {
  statusDiv.style.display = 'none';
}

// ============================================================
//  RULE PARSER
// ============================================================

function parseRules(jsonText) {
  const data = JSON.parse(jsonText);
  let rules = [];

  if (data.rules && Array.isArray(data.rules)) {
    rules = data.rules;
  } else if (Array.isArray(data)) {
    rules = data;
  } else {
    throw new Error(chrome.i18n.getMessage('errorInvalidFormat'));
  }

  rules.forEach((rule, index) => {
    if (!rule.selector) {
      throw new Error(
        chrome.i18n.getMessage('errorMissingSelector').replace('{index}', index + 1)
      );
    }
  });

  return rules;
}

// ============================================================
//  CORE IMPORT LOGIC
// ============================================================

function importRules(replace) {
  const jsonText = jsonInput.value.trim();
  if (!jsonText) {
    showStatus(chrome.i18n.getMessage('alertNoRulesInFile'), 'error');
    return;
  }

  try {
    const rules = parseRules(jsonText);

    if (rules.length === 0) {
      showStatus(chrome.i18n.getMessage('alertNoRulesInFile'), 'error');
      return;
    }

    chrome.storage.local.get(['rules'], (result) => {
      let existingRules = result.rules || [];

      if (replace) {
        existingRules = rules;
        const msg = chrome.i18n.getMessage('statusReplaced').replace('{count}', rules.length);
        showStatus(msg, 'success');
      } else {
        const existingSelectors = new Set(existingRules.map(r => r.selector));
        let addedCount = 0;

        rules.forEach(rule => {
          if (!existingSelectors.has(rule.selector)) {
            existingRules.push(rule);
            existingSelectors.add(rule.selector);
            addedCount++;
          }
        });

        if (addedCount === 0) {
          showStatus(chrome.i18n.getMessage('alertNoNewRules'), 'error');
          return;
        }

        const msg = chrome.i18n.getMessage('statusAdded')
          .replace('{added}', addedCount)
          .replace('{total}', existingRules.length);
        showStatus(msg, 'success');
      }

      chrome.storage.local.set({ rules: existingRules }, () => {
        chrome.runtime.sendMessage({ type: 'rulesUpdated' });
      });
    });

  } catch (error) {
    const msg = chrome.i18n.getMessage('errorImport').replace('{message}', error.message);
    showStatus(msg, 'error');
  }
}

// ============================================================
//  HANDLERS — File loading
// ============================================================

loadFileBtn.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', (event) => {
  const file = event.target.files[0];

  if (!file) return;

  if (file.size === 0) {
    showStatus(chrome.i18n.getMessage('errorEmptyFile'), 'error');
    fileInfo.textContent = chrome.i18n.getMessage('errorEmptyFile');
    return;
  }

  fileInfo.textContent = chrome.i18n.getMessage('fileInfo')
    .replace('{name}', file.name)
    .replace('{size}', (file.size / 1024).toFixed(1));

  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      const content = e.target.result;

      if (!content || content.trim() === '') {
        showStatus(chrome.i18n.getMessage('errorEmptyData'), 'error');
        return;
      }

      jsonInput.value = content;
      hideStatus();

      try {
        const rules = parseRules(content);
        fileInfo.textContent = chrome.i18n.getMessage('fileInfoWithCount')
          .replace('{name}', file.name)
          .replace('{size}', (file.size / 1024).toFixed(1))
          .replace('{count}', rules.length);
      } catch (parseError) {
        fileInfo.textContent = chrome.i18n.getMessage('fileInfoError')
          .replace('{name}', file.name)
          .replace('{error}', parseError.message);
        showStatus(chrome.i18n.getMessage('errorParse').replace('{message}', parseError.message), 'error');
      }

    } catch (error) {
      showStatus(chrome.i18n.getMessage('errorReadFile').replace('{message}', error.message), 'error');
      fileInfo.textContent = chrome.i18n.getMessage('errorReadFile');
    }
  };

  reader.onerror = () => {
    showStatus(chrome.i18n.getMessage('errorReadFile'), 'error');
    fileInfo.textContent = chrome.i18n.getMessage('errorReadFile');
  };

  reader.onloadend = () => {
    event.target.value = '';
  };

  reader.readAsText(file);
});

// ============================================================
//  HANDLERS — Buttons
// ============================================================

clearBtn.addEventListener('click', () => {
  jsonInput.value = '';
  fileInfo.textContent = '';
  hideStatus();
  jsonInput.focus();
});

replaceBtn.addEventListener('click', () => {
  importRules(true);
});

addBtn.addEventListener('click', () => {
  importRules(false);
});

closeBtn.addEventListener('click', () => {
  window.close();
});

// ============================================================
//  HANDLERS — Keyboard shortcuts
// ============================================================

jsonInput.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'Enter') {
    e.preventDefault();
    addBtn.click();
  }
});

// ============================================================
//  INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  localizeImport();
  jsonInput.focus();
});