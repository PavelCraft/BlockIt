// Runs in the page's MAIN world from document_start.
// It retains closed Shadow Roots and applies rules sent by content.js.
(() => {
  const closedRoots = new WeakMap();
  const originalAttachShadow = Element.prototype.attachShadow;
  let activeRules = [];
  let scheduled = false;
  let hasDynamicRules = false;
  const reportedInvalidRules = new Set();
  const HIDDEN_ATTRIBUTE = 'data-blockit-hidden';
  const sheets = new Map();
  const markedElements = new Set();
  const siblingSnapshots = new WeakMap();

  Element.prototype.attachShadow = function(init) {
    const root = originalAttachShadow.call(this, init);
    if (init?.mode === 'closed') closedRoots.set(this, root);
    observeRoot(root);
    globalThis.__blockItSelectorEngine?.scheduleApply?.();
    return root;
  };

  globalThis.__blockItGetClosedShadowRoot = element => closedRoots.get(element) || null;

  function snapshotParent(parent) {
    if (parent?.children && !siblingSnapshots.has(parent)) siblingSnapshots.set(parent, [...parent.children]);
    return siblingSnapshots.get(parent) || [];
  }

  function captureSiblingTopology() {
    for (const root of globalThis.__blockItSelectorEngine.roots()) {
      if (root.children?.length) snapshotParent(root);
      root.querySelectorAll?.('*').forEach(snapshotParent);
    }
  }

  function originalSiblings(element) {
    const parent = element?.parentElement;
    if (!parent) return [];
    return snapshotParent(parent).filter(item => item !== element);
  }

  function originalSiblingAt(element, direction, distance) {
    const parent = element?.parentElement;
    if (!parent) return null;
    const siblings = snapshotParent(parent), index = siblings.indexOf(element);
    if (index < 0) return null;
    return siblings[index + (direction === 'previous' ? -distance : distance)] || null;
  }

  globalThis.__blockItOriginalSiblings = originalSiblings;
  globalThis.__blockItOriginalSiblingAt = originalSiblingAt;

  function updateSiblingTopology(record) {
    const parent = record.target;
    if (!parent?.children) return;
    const snapshot = snapshotParent(parent);
    for (const node of record.removedNodes) {
      if (node.nodeType !== 1) continue;
      const index = snapshot.indexOf(node);
      if (index >= 0) snapshot.splice(index, 1);
    }
    let insertionIndex = record.nextSibling?.nodeType === 1 ? snapshot.indexOf(record.nextSibling) : -1;
    if (insertionIndex < 0) {
      const previousIndex = record.previousSibling?.nodeType === 1 ? snapshot.indexOf(record.previousSibling) : -1;
      if (previousIndex >= 0) insertionIndex = previousIndex + 1;
    }
    for (const node of record.addedNodes) {
      if (node.nodeType !== 1 || snapshot.includes(node)) continue;
      if (insertionIndex >= 0) snapshot.splice(insertionIndex++, 0, node);
      else snapshot.push(node);
      snapshotParent(node);
      node.querySelectorAll?.('*').forEach(snapshotParent);
    }
  }

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

  function nativeSelector(rule) {
    if (rule.type === 'xpath') return null;
    const selector = rule.type === 'blockitbuilder'
      ? globalThis.__blockItRuleModel.toCssSelector?.(rule.selector)
      : rule.selector;
    if (typeof selector !== 'string' || !selector.trim() ||
        globalThis.__blockItSelectorCore.isBlockItRule(selector)) return null;
    // querySelector validates the entire selector, including nested :has().
    document.querySelector(selector);
    return selector;
  }

  function updateSheets(roots, cssRules) {
    if (!cssRules.length && !hasDynamicRules) {
      for (const [root, sheet] of sheets) {
        root.adoptedStyleSheets = root.adoptedStyleSheets.filter(item => item !== sheet);
      }
      sheets.clear();
      return;
    }
    const css = [
      ...(hasDynamicRules ? [
        `[data-blockit-hidden="collapse"] { display: none !important; }`,
        `[data-blockit-hidden="reserve"] { visibility: hidden !important; pointer-events: none !important; }`
      ] : []),
      ...cssRules
    ].join('\n');
    for (const root of roots) {
      let sheet = sheets.get(root);
      if (!sheet) {
        sheet = new CSSStyleSheet();
        sheets.set(root, sheet);
      }
      if (!root.adoptedStyleSheets.includes(sheet)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      sheet.replaceSync(css);
      sheet.disabled = false;
    }
    for (const [root, sheet] of sheets) {
      if (roots.includes(root)) continue;
      root.adoptedStyleSheets = root.adoptedStyleSheets.filter(item => item !== sheet);
      sheets.delete(root);
    }
  }

  function applyRules() {
    // Match against the page without BlockIt's own styling or marker
    // attributes. This matters for :visible, :style and :attr-count.
    for (const sheet of sheets.values()) sheet.disabled = true;
    for (const element of markedElements) element.removeAttribute(HIDDEN_ATTRIBUTE);
    markedElements.clear();
    captureSiblingTopology();
    globalThis.__blockItRuleModel?.captureSiblingPositions?.();
    const marked = new Map();
    const cssRules = [];
    let dynamic = false;
    for (const originalRule of activeRules) {
      if (originalRule.enabled === false) continue;
      const rule = normalizeRule(originalRule);
      if (!rule) continue;

      try {
        if (['css', 'blockitrule'].includes(rule.type || 'css')) {
          for (const innerSelector of globalThis.__blockItSelectorEngine.getFrameHasFilters(rule.selector)) {
            globalThis.__blockItSelectorEngine.reportFrameMatches(innerSelector, innerSelector);
          }
        }
        const css = nativeSelector(rule);
        if (css) {
          const declaration = rule.mode === 'remove'
            ? 'display: none !important;'
            : 'visibility: hidden !important; pointer-events: none !important;';
          cssRules.push(`${css} { ${declaration} }`);
          continue;
        }
        dynamic = true;
        for (const element of findElements(rule.selector, rule.type || 'css')) {
          if (element?.nodeType !== 1 || !element.isConnected) continue;
          if (rule.mode === 'remove' || !marked.has(element)) {
            marked.set(element, rule.mode === 'remove' ? 'collapse' : 'reserve');
          }
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
    }
    // All rules have seen the same DOM. Only now expose their effects.
    hasDynamicRules = dynamic;
    updateSheets(globalThis.__blockItSelectorEngine.roots(), cssRules);
    for (const [element, mode] of marked) {
      element.setAttribute(HIDDEN_ATTRIBUTE, mode);
      markedElements.add(element);
    }
  }

  function containsShadowHost(node) {
    if (node.nodeType !== 1) return false;
    if (node.shadowRoot || closedRoots.has(node)) return true;
    return [...(node.querySelectorAll?.('*') || [])].some(child =>
      child.shadowRoot || closedRoots.has(child));
  }

  function observeRoot(root) {
    if (!root || root.__blockItObserved) return;
    Object.defineProperty(root, '__blockItObserved', { value: true });
    new MutationObserver(records => {
      if (!activeRules.length) return;
      let relevant = false;
      for (const record of records) {
        if (record.type === 'childList') {
          updateSiblingTopology(record);
          if (hasDynamicRules || [...record.addedNodes].some(containsShadowHost)) relevant = true;
        }
        if (hasDynamicRules && (record.type === 'characterData' ||
            (record.type === 'attributes' && record.attributeName !== HIDDEN_ATTRIBUTE))) relevant = true;
      }
      if (!relevant || scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        applyRules();
      }, 50);
    }).observe(root, { childList: true, attributes: true, characterData: true, subtree: true });
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
