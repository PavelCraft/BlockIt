// ============================================================
//  BLOCKIT — CONTENT SCRIPT
//  Applies blocking rules to pages using CSS selectors or XPath
// ============================================================

// ============================================================
//  UTILITIES
// ============================================================

/**
 * Check if the extension context is still valid
 * Prevents errors when extension is reloaded or updated
 */
function isExtensionContextValid() {
  try {
    return !!(chrome.runtime && chrome.runtime.id);
  } catch (e) {
    return false;
  }
}

/**
 * Find elements using CSS selector or XPath
 * @param {string} selector - CSS selector or XPath expression
 * @param {string} type - 'css' or 'xpath'
 * @returns {NodeList|Array} Array-like collection of DOM elements
 */
function findElements(selector, type) {
  const selType = type || 'css';

  if (selType === 'xpath') {
    const xpath = selector.replace(/^xpath:/i, '');
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );
    const elements = [];
    for (let i = 0; i < result.snapshotLength; i++) {
      elements.push(result.snapshotItem(i));
    }
    return elements;
  }

  // CSS selector
  try {
    return document.querySelectorAll(selector);
  } catch (e) {
    return [];
  }
}

/**
 * Apply a single rule to the page
 * @param {Object} rule - Rule object with selector, type, mode
 */
function applyRule(rule) {
  try {
    const type = rule.type || 'css';
    const mode = rule.mode || 'hide';
    const elements = findElements(rule.selector, type);

    elements.forEach(el => {
      if (mode === 'remove') {
        el.remove();
      } else {
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
      }
    });
  } catch (e) {
    console.debug('[BlockIt] Error applying rule:', rule.selector, e.message);
  }
}

// ============================================================
//  RULES APPLICATION
// ============================================================

/**
 * Apply all rules from storage to the current page
 */
function applyRules() {
  if (!isExtensionContextValid()) {
    console.log('[BlockIt] Extension context invalid, skipping');
    return;
  }

  chrome.storage.local.get(['rules'], (result) => {
    if (chrome.runtime.lastError) {
      console.warn('[BlockIt] Error getting rules:', chrome.runtime.lastError.message);
      return;
    }

    const rules = result.rules || [];
    rules.forEach(applyRule);
  });
}

// ============================================================
//  STORAGE LISTENER
//  Re-apply rules when they change in storage
// ============================================================

let storageListener = null;

function initStorageListener() {
  // Clean up old listener
  if (storageListener) {
    chrome.storage.onChanged.removeListener(storageListener);
    storageListener = null;
  }

  storageListener = (changes, namespace) => {
    if (namespace === 'local' && changes.rules) {
      applyRules();
    }
  };

  chrome.storage.onChanged.addListener(storageListener);
}

// ============================================================
//  DOM MUTATION OBSERVER
//  Re-apply rules when page content changes (SPA support)
// ============================================================

let observer = null;

function initObserver() {
  // Clean up old observer
  if (observer) {
    observer.disconnect();
    observer = null;
  }

  observer = new MutationObserver(() => {
    applyRules(); // applyRules() already checks context validity
  });

  const startObserving = () => {
    if (document.body && observer) {
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  };

  if (document.body) {
    startObserving();
  } else {
    document.addEventListener('DOMContentLoaded', startObserving);
  }
}

// ============================================================
//  CLEANUP
// ============================================================

function cleanup() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (storageListener) {
    chrome.storage.onChanged.removeListener(storageListener);
    storageListener = null;
  }
}

// ============================================================
//  INIT
// ============================================================

function init() {
  const onReady = () => {
    applyRules();
    initObserver();
    initStorageListener();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
}

// Start the extension
init();

// ============================================================
//  CLEANUP ON UNLOAD
// ============================================================

window.addEventListener('beforeunload', cleanup);

// Cleanup when extension is suspended (e.g., during update)
try {
  chrome.runtime.onSuspend.addListener(cleanup);
} catch (e) {
  // Extension already disconnected, ignore
}