// Runs in the page's MAIN world from document_start.
// It retains closed Shadow Roots and applies rules sent by content.js.
(() => {
  const closedRoots = new WeakMap();
  const originalAttachShadow = Element.prototype.attachShadow;
  let activeRules = [];
  let scheduled = false;
  const reportedInvalidRules = new Set();
  /* A positional selector describes a place in the DOM as it existed when
     the rule first ran. If its target is physically removed, re-evaluating
     `:nth-child(2)` would turn the former third child into a new target.
     Keep the initial selection for this document so BlockIt never creates a
     deletion cascade from its own DOM changes. */
  const frozenPositionalMatches = new Map();

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

  function hasPositionDependentCondition(rule) {
    if (rule.type === 'blockitbuilder') {
      const model = rule.selector;
      return !!(model?.resultPositions?.enabled || containsSiblingPosition(model?.root || model));
    }
    return /:(?:nth-(?:last-)?(?:child|of-type)|first-child|last-child|only-child|matches-position|sibling-position)\b/i
      .test(String(rule.selector || ''));
  }

  function containsSiblingPosition(node) {
    if (!node || typeof node !== 'object') return false;
    if (node.siblingPosition?.enabled) return true;
    return (node.relationGroups || []).some(group =>
      (group.entries || []).some(entry => containsSiblingPosition(entry.node))
    );
  }

  function positionalRuleKey(originalRule, rule) {
    return `${originalRule.id || ''}\u0000${rule.type || 'css'}\u0000${typeof rule.selector === 'string' ? rule.selector : originalRule.selector || ''}`;
  }

  function applyRules() {
    globalThis.__blockItRuleModel?.captureSiblingPositions?.();
    for (const originalRule of activeRules) {
      if (originalRule.enabled === false) continue;
      const rule = normalizeRule(originalRule);
      if (!rule) continue;

      if (['css', 'blockitrule'].includes(rule.type || 'css')) {
        for (const innerSelector of globalThis.__blockItSelectorEngine.getFrameHasFilters(rule.selector)) {
          globalThis.__blockItSelectorEngine.reportFrameMatches(innerSelector, innerSelector);
        }
      }

      let elements = [];
      try {
        const positional = hasPositionDependentCondition(rule);
        const key = positional ? positionalRuleKey(originalRule, rule) : null;
        const frozen = key ? frozenPositionalMatches.get(key) : null;
        if (frozen) {
          /* Removed nodes stay in the frozen Set only as a record that this
             rule has already selected them. Do not replace them with a new
             element which merely inherited the same ordinal position. */
          elements = [...frozen].filter(element => element.isConnected);
        } else {
          elements = findElements(rule.selector, rule.type || 'css');
          /* If nothing exists yet, keep watching: a late-loaded target may
             still legitimately appear. Once a positional match is found, its
             identity is frozen for the rest of this document. */
          if (key && elements.length) frozenPositionalMatches.set(key, new Set(elements));
        }
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
