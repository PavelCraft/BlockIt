// Runs in the page's MAIN world from document_start.
// It retains closed Shadow Roots and applies rules sent by content.js.
(() => {
  const closedRoots = new WeakMap();
  const originalAttachShadow = Element.prototype.attachShadow;
  let activeRules = [];
  let scheduled = false;
  const reportedInvalidRules = new Set();

  Element.prototype.attachShadow = function(init) {
    const root = originalAttachShadow.call(this, init);
    if (init?.mode === 'closed') closedRoots.set(this, root);
    observeRoot(root);
    return root;
  };

  globalThis.__blockItGetClosedShadowRoot = element => closedRoots.get(element) || null;

  function findElements(selector, type) {
    if (type === 'blockitbuilder') return globalThis.__blockItRuleModel.find(selector);
    // Never pass a CSS selector to XPath.  This is deliberately repeated here
    // (rather than relying only on normalizeRule) so legacy rules and malformed
    // data from an older popup cannot make document.evaluate throw.
    if (type === 'xpath' && /^[a-zA-Z*][\w-]*(?:\s|[.#[:>+~]|$)/.test(String(selector).trim())) {
      return globalThis.__blockItSelectorEngine.find(
        globalThis.__blockItSelectorEngine.normalizeCssSelector(selector)
      );
    }
    if (type !== 'xpath') return globalThis.__blockItSelectorEngine.find(selector);
    /* XPath stays inside this frame's Document. CSS and BlockIt rules are the
       supported way to traverse open or closed Shadow DOM. */
    return globalThis.__blockItSelectorEngine.findXPath(selector);
  }

  function normalizeRule(rule) {
    if (rule.type === 'blockitbuilder') {
      const model = rule.builderModel || (() => {
        try { return globalThis.__blockItRuleModel.parse(rule.selector); } catch { return null; }
      })();
      return model ? { ...rule, selector: model, type: 'blockitbuilder' } : null;
    }
    // Older versions treated every string containing // as XPath. Correct such
    // saved CSS rules automatically, including iframe[src^="https://…"].
    if (rule.type === 'xpath' && globalThis.__blockItSelectorEngine.looksLikeCssSelector(rule.selector)) {
      return { ...rule, selector: globalThis.__blockItSelectorEngine.normalizeCssSelector(rule.selector), type: 'css' };
    }
    if (rule.type === 'css') {
      return { ...rule, selector: globalThis.__blockItSelectorEngine.normalizeCssSelector(rule.selector) };
    }
    if (rule.type !== 'stablehtmlfinder') return rule;
    const target = rule.stableRule?.target || rule.stableRule;
    if (!target?.selector || !['css', 'xpath'].includes(target.type || 'css')) return null;
    return { ...rule, selector: target.selector, type: target.type || 'css' };
  }

  function applyRules() {
    globalThis.__blockItRuleModel?.captureSiblingPositions?.();
    for (const originalRule of activeRules) {
      if (originalRule.enabled === false) continue;
      const rule = normalizeRule(originalRule);
      if (!rule) continue;

      if ((rule.type || 'css') === 'css') {
        for (const innerSelector of globalThis.__blockItSelectorEngine.getFrameHasFilters(rule.selector)) {
          globalThis.__blockItSelectorEngine.reportFrameMatches(innerSelector, innerSelector);
        }
      }

      let elements = [];
      try {
        elements = findElements(rule.selector, rule.type || 'css');
      } catch (error) {
        const key = `${rule.type}:${JSON.stringify(rule.selector)}`;
        if (!reportedInvalidRules.has(key)) {
          reportedInvalidRules.add(key);
          console.warn('[BlockIt] Invalid rule:', {
            id: originalRule.id || null,
            domain: originalRule.domain || null,
            type: rule.type || 'css',
            selector: rule.selector
          }, `${error.name}: ${error.message}`);
        }
      }
      for (const element of elements) {
        if (rule.mode === 'remove') {
          element.remove();
        } else {
          element.style.setProperty('visibility', 'hidden', 'important');
          element.style.setProperty('pointer-events', 'none', 'important');
        }
      }
    }
  }

  function observeRoot(root) {
    if (!root || root.__blockItObserved) return;
    Object.defineProperty(root, '__blockItObserved', { value: true });
    new MutationObserver(() => {
      if (scheduled || !activeRules.length) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        applyRules();
      }, 50);
    }).observe(root, { childList: true, subtree: true });
  }

  window.addEventListener('message', event => {
    if (event.source !== window || event.data?.source !== 'blockit' || event.data?.action !== 'apply-rules') return;
    activeRules = Array.isArray(event.data.rules) ? event.data.rules : [];
    globalThis.__blockItSelectorEngine.roots().forEach(observeRoot);
    applyRules();
  });

  globalThis.__blockItSelectorEngine.scheduleApply = () => {
    if (scheduled || !activeRules.length) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      applyRules();
    }, 30);
  };
})();
