// ============================================================
//  BLOCKIT — CONTENT SCRIPT
//  Applies blocking rules to pages using CSS selectors or XPath
//  Supports Shadow DOM and nested shadow roots
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
 * Recursively find all elements with shadowRoot
 * @param {Node} root - Root node to search from
 * @returns {Array} Array of elements that have shadowRoot
 */
function findShadowHosts(root) {
  const hosts = [];
  const elements = root.querySelectorAll('*');

  elements.forEach(el => {
    if (el.shadowRoot) {
      hosts.push(el);
      // Recursively search inside shadowRoot for nested shadow hosts
      const nested = findShadowHosts(el.shadowRoot);
      hosts.push(...nested);
    }
  });

  return hosts;
}

/**
 * Find elements inside Shadow DOM using CSS selector
 * @param {string} selector - CSS selector
 * @param {Node} root - Root node to search from (default: document)
 * @returns {Array} Array of matching elements
 */
function findInShadowDOM(selector, root = document) {
  const results = [];

  // Search in current root
  try {
    const found = root.querySelectorAll(selector);
    if (found.length > 0) {
      results.push(...found);
    }
  } catch (e) {
    // Invalid selector, ignore
  }

  // Find all shadow hosts and search inside them
  const shadowHosts = findShadowHosts(root);
  shadowHosts.forEach(host => {
    if (host.shadowRoot) {
      const nested = findInShadowDOM(selector, host.shadowRoot);
      results.push(...nested);
    }
  });

  return results;
}

/**
 * Find elements inside Shadow DOM using XPath
 * @param {string} xpath - XPath expression
 * @param {Node} root - Root node to search from (default: document)
 * @returns {Array} Array of matching elements
 */
function findXPathInShadowDOM(xpath, root = document) {
  const results = [];

  // Search in current root
  try {
    const result = document.evaluate(
      xpath,
      root,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );
    for (let i = 0; i < result.snapshotLength; i++) {
      results.push(result.snapshotItem(i));
    }
  } catch (e) {
    // Invalid XPath, ignore
  }

  // Find all shadow hosts and search inside them
  const shadowHosts = findShadowHosts(root);
  shadowHosts.forEach(host => {
    if (host.shadowRoot) {
      const nested = findXPathInShadowDOM(xpath, host.shadowRoot);
      results.push(...nested);
    }
  });

  return results;
}

/**
 * Find elements using CSS selector or XPath
 * Searches main DOM first, then falls back to Shadow DOM
 * @param {string} selector - CSS selector or XPath expression
 * @param {string} type - 'css' or 'xpath'
 * @returns {Array} Array of DOM elements
 */
function findElements(selector, type) {
  const selType = type || 'css';
  let results = [];

  if (selType === 'xpath') {
    const xpath = selector.replace(/^xpath:/i, '');

    // First, search in main DOM
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
    } catch (e) {
      // Invalid XPath, ignore
    }

    // If nothing found, search in Shadow DOM
    if (results.length === 0) {
      results = findXPathInShadowDOM(xpath);
    }
  } else {
    // CSS selector

    // First, search in main DOM
    try {
      results = Array.from(document.querySelectorAll(selector));
    } catch (e) {
      // Invalid selector, ignore
    }

    // If nothing found, search in Shadow DOM
    if (results.length === 0) {
      results = findInShadowDOM(selector);
    }
  }

  return results;
}

// ============================================================
//  MESSAGE HANDLER — Count elements and save to storage
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'countElements') {
    console.log('[BlockIt] countElements request received in frame:', window.location.href);
    
    // Используем ту же функцию findElements, что и в applyRules
    const elements = findElements(message.selector, message.type);
    const count = elements.length;
    
    console.log('[BlockIt] Found', count, 'elements in this frame');
    
    // Сохраняем результат в общее хранилище
    chrome.storage.local.set({
      countResult: {
        count: count,
        href: window.location.href,
        timestamp: Date.now()
      }
    }, () => {
      console.log('[BlockIt] Result saved to storage:', count);
      sendResponse({ status: 'saved', count: count });
    });
    
    return true; // Важно для асинхронного ответа
  }
});

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