// ============================================================
//  BLOCKIT — POPUP SCRIPT
//  Main UI logic for the browser extension popup
// ============================================================

// ============================================================
//  STATE
// ============================================================

let currentTag = '';
let currentAttributes = {};
let advancedVisible = false;

// ============================================================
//  DOM REFS
// ============================================================

const selectorInput = document.getElementById('selectorInput');
const selectorTypeIndicator = document.getElementById('selectorTypeIndicator');
const elementCount = document.getElementById('elementCount');
const addRuleBtn = document.getElementById('addRule');
const statusDiv = document.getElementById('status');
const modeRadios = document.querySelectorAll('input[name="blockMode"]');
const rulesContainer = document.getElementById('rulesContainer');
const clearRulesBtn = document.getElementById('clearRules');
const importRulesBtn = document.getElementById('importRules');

const toggleAdvancedBtn = document.getElementById('toggleAdvanced');
const advancedPanel = document.getElementById('advancedPanel');
const hintContainer = document.getElementById('hintContainer');
const toolsContainer = document.getElementById('toolsContainer');
const htmlInput = document.getElementById('htmlInput');
const parseBtn = document.getElementById('parseBtn');
const tagDisplay = document.getElementById('tagDisplay');
const attributesContainer = document.getElementById('attributesContainer');
const newAttrName = document.getElementById('newAttrName');
const newAttrValue = document.getElementById('newAttrValue');
const addAttrBtn = document.getElementById('addAttrBtn');

// ============================================================
//  LOCALIZATION
// ============================================================

function localizeUI() {
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

  if (!currentTag) {
    const msg = chrome.i18n.getMessage('tagNotDefined');
    if (msg) tagDisplay.textContent = msg;
  }

  updateModeHint();
}

function updateModeHint() {
  const hint = document.getElementById('modeHint');
  const selected = document.querySelector('input[name="blockMode"]:checked');
  if (selected) {
    const key = selected.value === 'remove' ? 'modeRemoveHint' : 'modeHideHint';
    const msg = chrome.i18n.getMessage(key);
    if (msg) hint.textContent = msg;
  }
}

// ============================================================
//  DOMAIN UTILITIES
// ============================================================

function getDomainFromUrl(url) {
  if (!url) return '';

  let domain = url;

  const protocolIdx = domain.indexOf('://');
  if (protocolIdx !== -1) {
    domain = domain.substring(protocolIdx + 3);
  }

  const slashIdx = domain.indexOf('/');
  if (slashIdx !== -1) {
    domain = domain.substring(0, slashIdx);
  }

  if (domain.startsWith('www.')) {
    domain = domain.substring(4);
  }

  const parts = domain.split('.');
  if (parts.length >= 2) {
    return parts.slice(-2).join('.');
  }

  return domain;
}

function findElements(selector, type) {
  const selType = type || 'css';
  let results = [];

  function findShadowHosts(root) {
    const hosts = [];
    const elements = root.querySelectorAll('*');

    elements.forEach(el => {
      if (el.shadowRoot) {
        hosts.push(el);
        hosts.push(...findShadowHosts(el.shadowRoot));
      }
    });

    return hosts;
  }

  function findInShadowDOM(selector, root = document) {
    const found = [];

    try {
      found.push(...root.querySelectorAll(selector));
    } catch (e) {}

    for (const host of findShadowHosts(root)) {
      if (host.shadowRoot) {
        found.push(...findInShadowDOM(selector, host.shadowRoot));
      }
    }

    return found;
  }

  function findXPathInShadowDOM(xpath, root = document) {
    const found = [];

    try {
      const result = document.evaluate(
        xpath,
        root,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );

      for (let i = 0; i < result.snapshotLength; i++) {
        found.push(result.snapshotItem(i));
      }
    } catch (e) {}

    for (const host of findShadowHosts(root)) {
      if (host.shadowRoot) {
        found.push(...findXPathInShadowDOM(xpath, host.shadowRoot));
      }
    }

    return found;
  }

  if (selType === 'xpath') {
    const xpath = selector.replace(/^xpath:/i, '');

    try {
      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );

      for (let i = 0; i < result.snapshotLength; i++) {
        results.push(result.snapshotItem(i));
      }
    } catch (e) {}

    if (results.length === 0) {
      results = findXPathInShadowDOM(xpath);
    }
  } else {
    try {
      results = Array.from(document.querySelectorAll(selector));
    } catch (e) {}

    if (results.length === 0) {
      results = findInShadowDOM(selector);
    }
  }

  return results;
}

// ============================================================
//  SELECTOR / XPATH DETECTION
// ============================================================

function detectSelectorType(input) {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^xpath:/i.test(trimmed)) return 'xpath';
  if (trimmed.startsWith('/') || trimmed.startsWith('//')) return 'xpath';
  if (trimmed.startsWith('(')) return 'xpath';

  const xpathAxes = [
    'ancestor::', 'parent::', 'child::', 'descendant::',
    'following-sibling::', 'preceding-sibling::',
    'following::', 'preceding::', 'attribute::',
    'namespace::', 'self::', 'descendant-or-self::'
  ];

  for (const axis of xpathAxes) {
    if (trimmed.includes(axis)) return 'xpath';
  }

  if (trimmed.includes('text()') || trimmed.includes('node()')) return 'xpath';
  if (trimmed.includes('@') && !trimmed.includes('@keyframes') && !trimmed.includes('@import')) return 'xpath';
  if (trimmed.includes('//')) return 'xpath';

  return 'css';
}

// ============================================================
//  HTML PARSER (no regex)
// ============================================================

function parseOuterTag(html) {
  let i = 0;
  const len = html.length;

  while (i < len && html[i] !== '<') i++;
  if (i >= len) return null;
  i++;

  let tag = '';
  while (i < len && html[i] !== ' ' && html[i] !== '>') {
    tag += html[i];
    i++;
  }
  if (!tag) return null;

  const attributes = {};
  while (i < len && html[i] !== '>') {
    while (i < len && html[i] === ' ') i++;
    if (i >= len || html[i] === '>') break;

    let attrName = '';
    while (i < len && html[i] !== '=' && html[i] !== ' ') {
      attrName += html[i];
      i++;
    }
    if (!attrName) break;

    while (i < len && html[i] !== '"' && html[i] !== "'") i++;
    if (i >= len) break;
    const quote = html[i];
    i++;

    let attrValue = '';
    while (i < len && html[i] !== quote) {
      attrValue += html[i];
      i++;
    }
    if (i < len) i++;

    attributes[attrName] = attrValue;
  }

  return { tag, attributes };
}

function buildSelector(tag, attributes) {
  let selector = tag;
  for (const [key, value] of Object.entries(attributes)) {
    selector += `[${key}="${value}"]`;
  }
  return selector;
}

// ============================================================
//  ATTRIBUTES RENDERER
// ============================================================

function renderAttributes(tag, attributes) {
  attributesContainer.innerHTML = '';

  const keys = Object.keys(attributes);
  if (keys.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-message';
    empty.textContent = chrome.i18n.getMessage('noAttributes');
    attributesContainer.appendChild(empty);
    return;
  }

  for (const [key, value] of Object.entries(attributes)) {
    const div = document.createElement('div');
    div.className = 'attr-item';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'attr-name';
    nameSpan.textContent = key;

    const valueSpan = document.createElement('span');
    valueSpan.className = 'attr-value';
    valueSpan.textContent = `="${value}"`;

    const editBtn = document.createElement('button');
    editBtn.className = 'attr-edit';
    editBtn.textContent = '✏️';
    editBtn.title = chrome.i18n.getMessage('editAttrTitle');
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const promptMsg = chrome.i18n.getMessage('editAttrPrompt').replace('{key}', key);
      const newValue = prompt(promptMsg, value);
      if (newValue !== null && newValue.trim() !== '') {
        attributes[key] = newValue.trim();
        renderAttributes(tag, attributes);
        updateSelector(tag, attributes);
      }
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'attr-delete';
    deleteBtn.textContent = '🗑️';
    deleteBtn.title = chrome.i18n.getMessage('deleteAttrTitle');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      delete attributes[key];
      renderAttributes(tag, attributes);
      updateSelector(tag, attributes);
    });

    div.appendChild(nameSpan);
    div.appendChild(valueSpan);
    div.appendChild(editBtn);
    div.appendChild(deleteBtn);
    attributesContainer.appendChild(div);
  }
}

// ============================================================
//  SELECTOR PREVIEW & ELEMENT COUNT CHECK
// ============================================================

function updateSelector(tag, attributes) {
  const selector = buildSelector(tag, attributes);
  selectorInput.value = selector;
  currentTag = tag;
  currentAttributes = attributes;
  checkSelectorCount(selector);
}

// ============================================================
//  CHECK SELECTOR COUNT — using chrome.storage.local
// ============================================================

function checkSelectorCount(selector) {
  const trimmed = selector.trim();

  if (!trimmed) {
    elementCount.textContent = chrome.i18n.getMessage('enterSelector');
    elementCount.style.color = '#999';
    selectorTypeIndicator.textContent = '';
    selectorTypeIndicator.style.color = '';
    return;
  }

  const type = detectSelectorType(trimmed);

  if (type === 'css') {
    selectorTypeIndicator.textContent = 'CSS ' + chrome.i18n.getMessage('selectorTypeCSS');
    selectorTypeIndicator.style.color = '#0078d4';
  } else if (type === 'xpath') {
    selectorTypeIndicator.textContent = chrome.i18n.getMessage('selectorTypeXPath');
    selectorTypeIndicator.style.color = '#d13438';
  } else {
    selectorTypeIndicator.textContent = chrome.i18n.getMessage('selectorTypeUnknown');
    selectorTypeIndicator.style.color = '#999';
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0]) {
      elementCount.textContent = chrome.i18n.getMessage('checkError');
      elementCount.style.color = 'orange';
      return;
    }

    // 1. Очищаем хранилище от старых данных
    chrome.storage.local.remove('countResult', () => {
      console.log('[BlockIt] Storage cleared, sending count request...');

      // 2. Отправляем запрос на подсчёт во все фреймы
      chrome.tabs.sendMessage(
        tabs[0].id,
        {
          action: 'countElements',
          selector: trimmed,
          type: type
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.log('[BlockIt] sendMessage error:', chrome.runtime.lastError.message);
          } else {
            console.log('[BlockIt] Message sent, response:', response);
          }
        }
      );

      // 3. Пытаемся прочитать результат несколько раз
      let attempts = 0;
      const maxAttempts = 10; // 10 попыток по 500 мс = 5 секунд максимум

      function tryReadStorage() {
        attempts++;
        console.log(`[BlockIt] Attempt ${attempts}/${maxAttempts} to read storage`);

        chrome.storage.local.get(['countResult'], (result) => {
          const data = result.countResult;
          
          if (data && typeof data === 'object' && data.count !== undefined) {
            // Проверяем, что данные свежие (не старше 3 секунд)
            if (Date.now() - data.timestamp < 3000) {
              console.log('[BlockIt] Fresh data from:', data.href, '=>', data.count);
              const total = data.count;
              updateElementCount(total);
              chrome.storage.local.remove('countResult');
              return;
            } else {
              console.log('[BlockIt] Data is too old, ignoring');
            }
          }

          // Если данные не найдены и попытки не закончились — повторяем
          if (attempts < maxAttempts) {
            setTimeout(tryReadStorage, 500);
          } else {
            // Попытки закончились — показываем 0
            console.log('[BlockIt] Max attempts reached, showing 0');
            updateElementCount(0);
          }
        });
      }

      // Начинаем чтение через 300 мс (даём время content.js на обработку)
      setTimeout(tryReadStorage, 300);
    });
  });
}

// ============================================================
//  UPDATE ELEMENT COUNT — helper function
// ============================================================

function updateElementCount(total) {
  console.log('[BlockIt] Final total count:', total);
  
  if (total === -1) {
    elementCount.textContent = chrome.i18n.getMessage('selectorInvalid');
    elementCount.style.color = 'red';
  } else if (total === 0) {
    elementCount.textContent = chrome.i18n.getMessage('foundZero');
    elementCount.style.color = 'orange';
  } else if (total === 1) {
    elementCount.textContent = chrome.i18n.getMessage('foundOne');
    elementCount.style.color = 'green';
  } else {
    const msg = chrome.i18n.getMessage('foundMultiple').replace('{count}', total);
    elementCount.textContent = msg;
    elementCount.style.color = 'red';
  }
}

// ============================================================
//  UPDATE ELEMENT COUNT — helper function
// ============================================================

function updateElementCount(total) {
  console.log('[BlockIt] Final total count:', total);
  
  if (total === -1) {
    elementCount.textContent = chrome.i18n.getMessage('selectorInvalid');
    elementCount.style.color = 'red';
  } else if (total === 0) {
    elementCount.textContent = chrome.i18n.getMessage('foundZero');
    elementCount.style.color = 'orange';
  } else if (total === 1) {
    elementCount.textContent = chrome.i18n.getMessage('foundOne');
    elementCount.style.color = 'green';
  } else {
    const msg = chrome.i18n.getMessage('foundMultiple').replace('{count}', total);
    elementCount.textContent = msg;
    elementCount.style.color = 'red';
  }
}

// ============================================================
//  RULES LIST (grouped by domain)
// ============================================================

function renderRulesList() {
  chrome.storage.local.get(['rules'], (result) => {
    const rules = result.rules || [];
    rulesContainer.innerHTML = '';

    if (rules.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-message';
      empty.textContent = chrome.i18n.getMessage('noRules');
      rulesContainer.appendChild(empty);
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      let currentDomain = '';
      if (tabs?.[0]?.url) {
        currentDomain = getDomainFromUrl(tabs[0].url);
      }

      const currentSite = [];
      const other = [];

      rules.forEach(rule => {
        const ruleDomain = rule.domain || '';
        if (ruleDomain && currentDomain && currentDomain.endsWith(ruleDomain)) {
          currentSite.push(rule);
        } else {
          other.push(rule);
        }
      });

      if (currentSite.length > 0) {
        const label = currentDomain || chrome.i18n.getMessage('thisSite');
        const title = chrome.i18n.getMessage('rulesForThisSite').replace('{site}', label);
        renderRuleGroup(rulesContainer, title, currentSite);
      }

      if (other.length > 0) {
        const title = chrome.i18n.getMessage('rulesForOtherSites');
        renderRuleGroup(rulesContainer, title, other);
      }
    });
  });
}

function renderRuleGroup(container, title, rules) {
  const group = document.createElement('div');
  group.className = 'rules-group';

  const header = document.createElement('div');
  header.className = 'group-title';
  header.textContent = `${title} (${rules.length})`;
  group.appendChild(header);

  const ul = document.createElement('ul');

  rules.forEach((rule) => {
    const li = document.createElement('li');
    const icon = rule.mode === 'remove' ? '🗑️' : '👻';
    const typeLabel = rule.type === 'xpath' ? '[XP] ' : '';
    li.textContent = `${icon} ${typeLabel}${rule.selector}`;

    const del = document.createElement('button');
    del.textContent = chrome.i18n.getMessage('deleteBtn');
    del.addEventListener('click', () => {
      chrome.storage.local.get(['rules'], (res) => {
        const all = res.rules || [];
        const idx = all.findIndex(r => r.selector === rule.selector && r.domain === rule.domain);
        if (idx !== -1) {
          all.splice(idx, 1);
          chrome.storage.local.set({ rules: all }, renderRulesList);
        }
      });
    });

    li.appendChild(del);
    ul.appendChild(li);
  });

  group.appendChild(ul);
  container.appendChild(group);
}

// ============================================================
//  ADVANCED MODE TOGGLE
// ============================================================

function updateToggleButton() {
  if (advancedVisible) {
    toggleAdvancedBtn.innerHTML = `
      <span class="toggle-icon toggle-icon-up"></span>
      <span data-i18n="hideAdvanced">${chrome.i18n.getMessage('hideAdvanced')}</span>
      <span class="toggle-icon toggle-icon-up"></span>
    `;
    advancedPanel.classList.remove('hidden');
    hintContainer.classList.add('hidden');
    toolsContainer.classList.remove('hidden');
  } else {
    toggleAdvancedBtn.innerHTML = `
      <span class="toggle-icon toggle-icon-down"></span>
      <span data-i18n="toggleAdvanced">${chrome.i18n.getMessage('toggleAdvanced')}</span>
      <span class="toggle-icon toggle-icon-down"></span>
    `;
    advancedPanel.classList.add('hidden');
    hintContainer.classList.remove('hidden');
    toolsContainer.classList.add('hidden');
  }
}

function toggleAdvancedMode() {
  advancedVisible = !advancedVisible;
  updateToggleButton();
}

toggleAdvancedBtn.addEventListener('click', toggleAdvancedMode);

// ============================================================
//  HANDLERS — Manual Selector / XPath Input
// ============================================================

selectorInput.addEventListener('input', () => {
  const manual = selectorInput.value.trim();
  if (manual) {
    checkSelectorCount(manual);
  } else {
    elementCount.textContent = chrome.i18n.getMessage('enterSelector');
    elementCount.style.color = '#999';
    selectorTypeIndicator.textContent = '';
    selectorTypeIndicator.style.color = '';
  }
});

// ============================================================
//  HANDLERS — Parse HTML
// ============================================================

parseBtn.addEventListener('click', () => {
  const html = htmlInput.value.trim();
  if (!html) {
    alert(chrome.i18n.getMessage('alertPasteHtml'));
    return;
  }

  const parsed = parseOuterTag(html);
  if (!parsed || !parsed.tag) {
    alert(chrome.i18n.getMessage('alertParseError'));
    return;
  }

  currentTag = parsed.tag;
  currentAttributes = parsed.attributes;

  tagDisplay.textContent = currentTag;
  renderAttributes(currentTag, currentAttributes);
  updateSelector(currentTag, currentAttributes);
});

// ============================================================
//  HANDLERS — Manual Attribute Addition
// ============================================================

function toggleAddAttrBtn() {
  const name = newAttrName.value.trim();
  const val = newAttrValue.value.trim();
  addAttrBtn.disabled = !(name && val);
}

newAttrName.addEventListener('input', toggleAddAttrBtn);
newAttrValue.addEventListener('input', toggleAddAttrBtn);

addAttrBtn.addEventListener('click', () => {
  const name = newAttrName.value.trim();
  const val = newAttrValue.value.trim();

  if (!name) {
    alert(chrome.i18n.getMessage('alertAttrName'));
    return;
  }
  if (!val) {
    alert(chrome.i18n.getMessage('alertAttrValue'));
    return;
  }

  if (!currentTag) {
    currentTag = 'div';
    tagDisplay.textContent = currentTag;
  }

  currentAttributes[name] = val;
  renderAttributes(currentTag, currentAttributes);
  updateSelector(currentTag, currentAttributes);

  newAttrName.value = '';
  newAttrValue.value = '';
  newAttrName.focus();
  addAttrBtn.disabled = true;
});

// ============================================================
//  HANDLERS — Add Rule
// ============================================================

addRuleBtn.addEventListener('click', () => {
  const rawSelector = selectorInput.value.trim();
  if (!rawSelector) {
    alert(chrome.i18n.getMessage('alertEmptySelector'));
    return;
  }

  const type = detectSelectorType(rawSelector);
  if (!type) {
    alert(chrome.i18n.getMessage('alertInvalidSelector'));
    return;
  }

  let selector = rawSelector;
  if (type === 'xpath') {
    selector = rawSelector.replace(/^xpath:/i, '');
  }

  let blockMode = 'remove';
  for (const radio of modeRadios) {
    if (radio.checked) {
      blockMode = radio.value;
      break;
    }
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0]) {
      alert(chrome.i18n.getMessage('alertNoTab'));
      return;
    }

    let currentDomain = '';
    if (tabs[0].url) {
      currentDomain = getDomainFromUrl(tabs[0].url);
    }

    // ============================================================
    //  ПРОВЕРКА КОЛИЧЕСТВА ЭЛЕМЕНТОВ через storage.local
    //  (аналогично checkSelectorCount)
    // ============================================================

    // 1. Очищаем старое значение в хранилище
    chrome.storage.local.remove('countResult', () => {
      console.log('[BlockIt] Storage cleared for addRule');

      // 2. Отправляем запрос на подсчёт во все фреймы
      chrome.tabs.sendMessage(
        tabs[0].id,
        {
          action: 'countElements',
          selector: selector,
          type: type
        },
        (response) => {
          console.log('[BlockIt] Message sent for addRule');
        }
      );

      // 3. Через 500 мс читаем результат из хранилища
      setTimeout(() => {
        chrome.storage.local.get(['countResult'], (result) => {
          const data = result.countResult;
          console.log('[BlockIt] Data from storage (addRule):', data);

          let totalCount = 0;

          if (data && typeof data === 'object' && data.count !== undefined) {
            if (Date.now() - data.timestamp < 2000) {
              console.log('[BlockIt] Fresh data from:', data.href, '=>', data.count);
              totalCount = data.count;
            } else {
              console.log('[BlockIt] Data is too old, ignoring');
            }
          }

          // 4. Очищаем хранилище
          chrome.storage.local.remove('countResult');

          // 5. Проверяем результат
          if (totalCount === -1) {
            alert(chrome.i18n.getMessage('alertInvalidSelector'));
            return;
          }

          if (totalCount === 0) {
            if (!confirm(chrome.i18n.getMessage('confirmZeroElements'))) {
              return;
            }
          }

          if (totalCount > 1) {
            const msg = chrome.i18n.getMessage('confirmMultipleElements').replace('{count}', totalCount);
            if (!confirm(msg)) {
              return;
            }
          }

          // 6. Сохраняем правило
          chrome.storage.local.get(['rules'], (res) => {
            const rules = res.rules || [];
            if (rules.some(r => r.selector === selector && r.domain === currentDomain)) {
              alert(chrome.i18n.getMessage('alertRuleExists'));
              return;
            }

            rules.push({
              selector: selector,
              type: type,
              mode: blockMode,
              domain: currentDomain
            });

            chrome.storage.local.set({ rules }, () => {
              statusDiv.textContent = chrome.i18n.getMessage('ruleAdded');
              statusDiv.style.color = 'green';
              renderRulesList();
            });
          });
        });
      }, 500);
    });
  });
});

// ============================================================
//  HANDLERS — Mode Hint Update
// ============================================================

modeRadios.forEach(radio => {
  radio.addEventListener('change', updateModeHint);
});

// ============================================================
//  HANDLERS — Clear All Rules
// ============================================================

clearRulesBtn.addEventListener('click', () => {
  if (!confirm(chrome.i18n.getMessage('confirmClearRules'))) return;

  chrome.storage.local.clear(() => {
    if (chrome.runtime.lastError) {
      alert(chrome.i18n.getMessage('alertClearError') + ': ' + chrome.runtime.lastError.message);
      return;
    }

    statusDiv.textContent = chrome.i18n.getMessage('rulesCleared');
    statusDiv.style.color = 'orange';
    renderRulesList();
  });
});

// ============================================================
//  HANDLERS — Export / Import
// ============================================================

document.getElementById('exportRules').addEventListener('click', () => {
  chrome.storage.local.get(['rules'], (result) => {
    const rules = result.rules || [];
    if (rules.length === 0) {
      alert(chrome.i18n.getMessage('alertNoRulesToExport'));
      return;
    }

    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      totalRules: rules.length,
      rules
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blockit-rules-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
});

importRulesBtn.addEventListener('click', () => {
  chrome.windows.create({
    url: chrome.runtime.getURL('import.html'),
    type: 'popup',
    width: 500,
    height: 450,
    focused: true
  });
});

// ============================================================
//  HANDLERS — Messages from import window
// ============================================================

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'rulesUpdated') {
    renderRulesList();
    statusDiv.textContent = chrome.i18n.getMessage('rulesImported');
    statusDiv.style.color = 'green';
  }
});

// ============================================================
//  INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  localizeUI();
  updateToggleButton();
  renderRulesList();
});

// ============================================================
//  CLEANUP — Clear storage when popup closes
// ============================================================

window.addEventListener('unload', function() {
  chrome.storage.local.remove('countResult');
});