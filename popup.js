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
let countRequestId = 0;
const STABLE_HTML_FINDER_PREFIX = 'SHF1:';
const RULE_BUILDER_PREFIX = 'BIR1:';
/* These pseudo-classes are understood by blockit-selector-engine.js, not by
   the browser's native CSS parser. Keeping a separate type prevents the UI
   from calling such a rule “invalid CSS”. */
const BLOCKIT_RULE_PSEUDO = /:(?:attr-name|attr|text(?:-(?:starts|ends|contains|matches))?|own-text(?:-(?:starts|ends|contains|matches))?|html|class-name|attrs|within|near|children|accessible|visible|size|style|property|in-frame|in-shadow|frame-has|has-frame|class-count|attribute-count|attr-count|matches-position|sibling-position)\s*\(/i;

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
const openRuleBuilderBtn = document.getElementById('openRuleBuilder');
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

  function findXPathInDocument(xpath) {
    const found = [];

    try {
      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );

      for (let i = 0; i < result.snapshotLength; i++) {
        found.push(result.snapshotItem(i));
      }
    } catch (e) {}

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
      results = findXPathInDocument(xpath);
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

  if (trimmed.startsWith(STABLE_HTML_FINDER_PREFIX)) return 'stablehtmlfinder';
  if (trimmed.startsWith(RULE_BUILDER_PREFIX)) return 'blockitbuilder';

  if (BLOCKIT_RULE_PSEUDO.test(trimmed) || /\[[a-zA-Z_][\w-]*-\*(?:[\]\^$*~|=]|$)/.test(trimmed)) return 'blockitrule';

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
  // A CSS attribute selector can legitimately contain an URL with //.
  if (/^[a-zA-Z*][\w-]*(?:\s|[.#[:>+~]|$)/.test(trimmed)) return 'css';
  if (trimmed.includes('//')) return 'xpath';

  return 'css';
}

function normalizeCssSelector(selector) {
  return String(selector).replace(/(['"])\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)\1/g, '$1$2$1');
}

/**
 * Re-send saved rules in a form understood by both the current hook and a
 * hook which was injected before an extension reload. This also repairs old
 * CSS rules that an earlier popup accidentally saved with type "xpath".
 */
async function repairLegacyRulesInActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) return;
  const { rules = [] } = await chrome.storage.local.get(['rules']);
  if (!rules.length) return;

  await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    world: 'MAIN',
    args: [rules],
    func: savedRules => {
      const isCss = value => /^[a-zA-Z*][\w-]*(?:\s|[.#[:>+~]|$)/.test(String(value || '').trim());
      const normalize = value => String(value).replace(/(['"])\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)\1/g, '$1$2$1');
      const repaired = savedRules.map(rule => (
        rule?.type === 'xpath' && isCss(rule.selector)
          ? { ...rule, type: 'css', selector: normalize(rule.selector) }
          : rule?.type === 'css'
            ? { ...rule, selector: normalize(rule.selector) }
            : rule
      ));
      window.postMessage({ source: 'blockit', action: 'apply-rules', rules: repaired }, '*');
    }
  });
}

/** Parse the interchange format emitted by StableHTMLFinder.
 * Example: SHF1:{"version":1,"target":{"type":"css","selector":".ad"}} */
function parseRuleInput(input) {
  const raw = input.trim();
  const type = detectSelectorType(raw);
  if (!type) throw new Error('empty');

  if (type === 'stablehtmlfinder') {
    const stableRule = JSON.parse(raw.slice(STABLE_HTML_FINDER_PREFIX.length));
    const target = stableRule.target || stableRule;
    const targetType = target.type || 'css';
    if (!target.selector || !['css', 'xpath'].includes(targetType)) throw new Error('invalid StableHTMLFinder rule');
    return {
      type,
      selector: raw,
      stableRule,
      query: { type: targetType, selector: target.selector }
    };
  }

  if (type === 'blockitbuilder') {
    const builderModel = JSON.parse(raw.slice(RULE_BUILDER_PREFIX.length));
    if (!builderModel?.root) throw new Error('invalid Rule Builder rule');
    return {
      type,
      selector: raw,
      stableRule: null,
      builderModel,
      query: { type, model: builderModel }
    };
  }

  return {
    type,
    selector: type === 'xpath' ? raw.replace(/^xpath:/i, '') : normalizeCssSelector(raw),
    stableRule: null,
    query: { type, selector: type === 'xpath' ? raw.replace(/^xpath:/i, '') : normalizeCssSelector(raw) }
  };
}

/** Runs in every accessible frame in the MAIN world. */
function countRuleInFrame(query) {
  if (query.type === 'blockitbuilder') {
    const engine = globalThis.__blockItRuleModel;
    if (!engine) return { count: 0, invalid: true };
    try { return { count: engine.find(query.model).length, invalid: false }; }
    catch { return { count: 0, invalid: true }; }
  }
  const rule = query.type === 'stablehtmlfinder'
    ? query.stableRule?.target || query.stableRule
    : query;
  const selector = rule?.selector;
  const type = rule?.type || 'css';
  if (!selector || !['css', 'blockitrule', 'xpath'].includes(type)) return { count: 0, invalid: true };

  const elements = new Set();
  try {
    if (type === 'css' || type === 'blockitrule') {
      const engine = globalThis.__blockItSelectorEngine;
      if (!engine) return { count: 0, invalid: true };
      engine.find(selector).forEach(element => elements.add(element));
    } else {
      const engine = globalThis.__blockItSelectorEngine;
      if (!engine?.findXPath) return { count: 0, invalid: true };
      engine.findXPath(selector).forEach(element => elements.add(element));
    }
  } catch {
    return { count: 0, invalid: true };
  }

  return { count: elements.size, invalid: false };
}

/** Sends inner selector probes upward so :frame-has(...) also works before a rule is saved. */
function probeFrameHasInFrame(query) {
  const rule = query.type === 'stablehtmlfinder'
    ? query.stableRule?.target || query.stableRule
    : query;
  if (!['css', 'blockitrule'].includes(rule?.type || 'css')) return;
  const engine = globalThis.__blockItSelectorEngine;
  if (!engine) return;
  engine.getFrameHasFilters(rule.selector).forEach(inner => engine.reportFrameMatches(inner, inner));
}

async function countRuleInActiveTab(query) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw new Error('no-tab');

  const selector = query.type === 'stablehtmlfinder'
    ? query.stableRule?.target?.selector || query.stableRule?.selector
    : query.selector;
  if (query.type !== 'xpath' && /:frame-has\(/i.test(selector || '')) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      world: 'MAIN',
      func: probeFrameHasInFrame,
      args: [query]
    });
    await new Promise(resolve => setTimeout(resolve, 80));
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    world: 'MAIN',
    func: countRuleInFrame,
    args: [query]
  });

  return {
    count: results.reduce((total, item) => total + (item.result?.count || 0), 0),
    invalid: results.some(item => item.result?.invalid)
  };
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
    selector += `[${CSS.escape(key)}="${CSS.escape(value)}"]`;
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

async function checkSelectorCount(selector) {
  const trimmed = selector.trim();

  if (!trimmed) {
    elementCount.textContent = chrome.i18n.getMessage('enterSelector');
    elementCount.style.color = '#999';
    selectorTypeIndicator.textContent = '';
    selectorTypeIndicator.style.color = '';
    return;
  }

  let parsed;
  try {
    parsed = parseRuleInput(trimmed);
  } catch {
    updateElementCount(-1);
    selectorTypeIndicator.textContent = 'StableHTMLFinder';
    selectorTypeIndicator.style.color = '#6f42c1';
    return;
  }
  const type = parsed.type;

  if (type === 'css') {
    selectorTypeIndicator.textContent = 'CSS ' + chrome.i18n.getMessage('selectorTypeCSS');
    selectorTypeIndicator.style.color = '#0078d4';
  } else if (type === 'xpath') {
    selectorTypeIndicator.textContent = chrome.i18n.getMessage('selectorTypeXPath');
    selectorTypeIndicator.style.color = '#d13438';
  } else if (type === 'stablehtmlfinder') {
    selectorTypeIndicator.textContent = 'StableHTMLFinder';
    selectorTypeIndicator.style.color = '#6f42c1';
  } else if (type === 'blockitbuilder') {
    selectorTypeIndicator.textContent = 'Конструктор BlockIt';
    selectorTypeIndicator.style.color = '#397837';
  } else if (type === 'blockitrule') {
    selectorTypeIndicator.textContent = 'Правило BlockIt';
    selectorTypeIndicator.style.color = '#397837';
  } else {
    selectorTypeIndicator.textContent = chrome.i18n.getMessage('selectorTypeUnknown');
    selectorTypeIndicator.style.color = '#999';
  }

  const requestId = ++countRequestId;
  try {
    const result = await countRuleInActiveTab(parsed.query);
    if (requestId === countRequestId) updateElementCount(result.invalid ? -1 : result.count);
  } catch {
    if (requestId === countRequestId) {
      elementCount.textContent = chrome.i18n.getMessage('checkError');
      elementCount.style.color = 'orange';
    }
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

    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      let currentDomain = '';
      if (tabs?.[0]?.url) {
        currentDomain = getDomainFromUrl(tabs[0].url);
      }

      const currentSite = [];
      const other = [];
      const withoutDomain = [];

      rules.forEach(rule => {
        const ruleDomain = rule.domain || '';
        if (!ruleDomain) withoutDomain.push(rule);
        if (ruleDomain && currentDomain && currentDomain.endsWith(ruleDomain)) {
          currentSite.push(rule);
        } else {
          other.push(rule);
        }
      });

      if (currentSite.length > 0 || withoutDomain.length > 0) {
        const label = currentDomain || chrome.i18n.getMessage('thisSite');
        const title = chrome.i18n.getMessage('rulesForThisSite').replace('{site}', label);
        renderRuleGroup(rulesContainer, title, currentSite, { auditDomain: currentDomain, auditRules: [...currentSite, ...withoutDomain] });
      }

      if (other.length > 0) {
        const title = chrome.i18n.getMessage('rulesForOtherSites');
        renderRuleGroup(rulesContainer, title, other);
      }
    });
  });
}

function renderRuleGroup(container, title, rules, options = {}) {
  const group = document.createElement('div');
  group.className = 'rules-group';

  const header = document.createElement('div');
  header.className = 'group-title';
  const headerText = document.createElement('span'); headerText.textContent = `${title} (${rules.length})`;
  header.append(headerText);
  if (options.auditDomain) {
    const audit = document.createElement('button'); audit.className = 'rules-audit-open'; audit.textContent = '↻ Проверить правила';
    audit.addEventListener('click', () => openRulesAudit(options.auditDomain, options.auditRules || rules));
    header.append(audit);
  }
  group.appendChild(header);

  const ul = document.createElement('ul');

  rules.forEach((rule) => {
    const li = document.createElement('li');
    const icon = rule.mode === 'remove' ? '🗑️' : '👻';
    const isBuilder = rule.type === 'blockitbuilder';
    const typeLabel = rule.type === 'xpath' ? '[XP] ' : rule.type === 'stablehtmlfinder' ? '[SHF] ' : '';
    let displaySelector = rule.selector;
    if (isBuilder) {
      const builderModel = rule.builderModel || (() => { try { return globalThis.__blockItRuleModel.parse(rule.selector); } catch { return null; } })();
      displaySelector = rule.displaySelector || (builderModel ? globalThis.__blockItRuleModel.toDisplaySelector(builderModel) : 'Некорректное правило конструктора');
    }
    const text = document.createElement('span'); text.className = 'rule-text'; text.textContent = `${icon} ${typeLabel}${displaySelector}`;
    if (rule.enabled === false) { li.classList.add('rule-disabled'); const mark = document.createElement('span'); mark.className = 'disabled-mark'; mark.textContent = 'Отключено'; text.append(document.createTextNode(' '), mark); }
    const actions = document.createElement('span'); actions.className = 'rule-list-actions';

    if (isBuilder) {
      const edit = document.createElement('button'); edit.className = 'rule-edit'; edit.textContent = 'Редактировать';
      edit.addEventListener('click', async () => {
        const builderModel = rule.builderModel || (() => { try { return globalThis.__blockItRuleModel.parse(rule.selector); } catch { return null; } })();
        if (!builderModel) return alert('Не удалось открыть модель этого правила.');
        await openRuleBuilderDraft({ model: builderModel, editingRule: { id: rule.id || null, selector: rule.selector, domain: rule.domain || '', enabled: rule.enabled !== false, mode: rule.mode || 'remove' }, expectedDomain: rule.domain || '' });
      });
      actions.append(edit);
    }
    const toggle = document.createElement('button'); toggle.className = 'rule-toggle'; toggle.textContent = rule.enabled === false ? 'Включить' : 'Отключить';
    toggle.addEventListener('click', () => {
      chrome.storage.local.get(['rules'], res => {
        const all = res.rules || []; const index = all.findIndex(item => item.id && rule.id ? item.id === rule.id : item.selector === rule.selector && item.domain === rule.domain);
        if (index < 0) return; all[index] = { ...all[index], id: all[index].id || crypto.randomUUID(), enabled: all[index].enabled === false };
        chrome.storage.local.set({ rules: all }, renderRulesList);
      });
    });
    actions.append(toggle);

    const del = document.createElement('button');
    del.className = 'btn-danger';
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

    actions.append(del); li.append(text, actions);
    ul.appendChild(li);
  });

  group.appendChild(ul);
  container.appendChild(group);
}

async function openRuleBuilderDraft(draft = {}) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tabMatches = !draft.expectedDomain || (tab?.url && getDomainFromUrl(tab.url).endsWith(draft.expectedDomain));
  const sourceTabId = tabMatches ? tab?.id || null : null;
  if (sourceTabId && draft.editingRule?.id) {
    await chrome.scripting.executeScript({ target:{ tabId:sourceTabId }, world:'ISOLATED', func:id=>{let ids=[];try{ids=JSON.parse(sessionStorage.getItem('blockit-editor-excluded-rules')||'[]')}catch{}if(!ids.includes(id))ids.push(id);sessionStorage.setItem('blockit-editor-excluded-rules',JSON.stringify(ids))}, args:[draft.editingRule.id] });
  }
  await chrome.storage.session.set({ ruleBuilderDraft: { ...draft, sourceTabId, sourceUrl: tabMatches ? tab?.url || '' : '', createdAt: Date.now() } });
  const createProperties = { url: chrome.runtime.getURL('rule-builder.html') };
  if (Number.isInteger(tab?.windowId)) createProperties.windowId = tab.windowId;
  await chrome.tabs.create(createProperties);
}

async function openRulesAudit(domainName, rules) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  await chrome.storage.session.set({ ruleAuditDraft: { domain: domainName, tabId: tab?.id || null, tabUrl: tab?.url || '', rules, createdAt: Date.now() } });
  const properties = { url: chrome.runtime.getURL('rule-audit.html') };
  if (Number.isInteger(tab?.windowId)) properties.windowId = tab.windowId;
  await chrome.tabs.create(properties);
}

async function openContactsPage() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const { rules = [] } = await chrome.storage.local.get(['rules']);
  await chrome.storage.session.set({
    feedbackDraft: {
      source: 'popup',
      sourceLabel: 'Главное окно BlockIt',
      tabId: tab?.id || null,
      pageUrl: tab?.url || '',
      rules: rules.map(rule => ({
        id: rule.id || null,
        selector: rule.displaySelector || rule.selector || '',
        type: rule.type || 'css',
        domain: rule.domain || '',
        enabled: rule.enabled !== false,
        mode: rule.mode || 'remove'
      })),
      createdAt: Date.now()
    }
  });
  const properties = { url: chrome.runtime.getURL('contacts.html') };
  if (Number.isInteger(tab?.windowId)) properties.windowId = tab.windowId;
  await chrome.tabs.create(properties);
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

openRuleBuilderBtn.addEventListener('click', async () => {
  await openRuleBuilderDraft({ html: htmlInput.value.trim() });
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

  let parsed;
  try {
    parsed = parseRuleInput(rawSelector);
  } catch {
    alert(chrome.i18n.getMessage('alertInvalidSelector'));
    return;
  }

  let blockMode = 'remove';
  for (const radio of modeRadios) {
    if (radio.checked) {
      blockMode = radio.value;
      break;
    }
  }

  chrome.tabs.query({ active: true, lastFocusedWindow: true }, async (tabs) => {
    if (!tabs?.[0]) {
      alert(chrome.i18n.getMessage('alertNoTab'));
      return;
    }

    let currentDomain = '';
    if (tabs[0].url) {
      currentDomain = getDomainFromUrl(tabs[0].url);
    }

    let totalCount;
    try {
      const result = await countRuleInActiveTab(parsed.query);
      if (result.invalid) {
        alert(chrome.i18n.getMessage('alertInvalidSelector'));
        return;
      }
      totalCount = result.count;
    } catch {
      alert(chrome.i18n.getMessage('alertCheckError'));
      return;
    }

    if (totalCount === 0 && !confirm(chrome.i18n.getMessage('confirmZeroElements'))) return;
    if (totalCount > 1) {
      const msg = chrome.i18n.getMessage('confirmMultipleElements').replace('{count}', totalCount);
      if (!confirm(msg)) return;
    }

    chrome.storage.local.get(['rules'], (res) => {
      const rules = res.rules || [];
      if (rules.some(r => r.selector === parsed.selector && r.domain === currentDomain)) {
        alert(chrome.i18n.getMessage('alertRuleExists'));
        return;
      }

      rules.push({
        id: crypto.randomUUID(),
        selector: parsed.selector,
        type: parsed.type,
        stableRule: parsed.stableRule,
        builderModel: parsed.builderModel,
        mode: blockMode,
        enabled: true,
        domain: currentDomain
      });

      chrome.storage.local.set({ rules }, () => {
        statusDiv.textContent = chrome.i18n.getMessage('ruleAdded');
        statusDiv.style.color = 'green';
        renderRulesList();
      });
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
  repairLegacyRulesInActiveTab().catch(() => {});
  document.getElementById('openContacts')?.addEventListener('click', openContactsPage);
});

// ============================================================
//  CLEANUP — Clear storage when popup closes
// ============================================================

window.addEventListener('unload', function() {
  chrome.storage.local.remove('countResult');
});
