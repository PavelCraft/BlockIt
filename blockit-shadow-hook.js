// Runs in the page's MAIN world from document_start.
// It retains closed Shadow Roots and applies rules sent by content.js.
(() => {
  const closedRoots = new WeakMap();
  const originalAttachShadow = Element.prototype.attachShadow;
  let activeRules = [];
  let scheduled = false;
  const reportedInvalidRules = new Set();
  /* Remember identities selected by positional rules. A removed element must
     not cause its old neighbour to inherit the match, but a node later added
     by the page may legitimately become a new target. */
  const frozenPositionalMatches = new Map();
  const siblingSnapshots = new WeakMap();
  const blockItRemovedNodes = new WeakSet();
  let pendingAddedNodes = new Set();

  Element.prototype.attachShadow = function(init) {
    const root = originalAttachShadow.call(this, init);
    if (init?.mode === 'closed') closedRoots.set(this, root);
    observeRoot(root);
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
      if (node.nodeType !== 1 || blockItRemovedNodes.has(node)) continue;
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

  function hasPositionDependentCondition(rule) {
    if (rule.type === 'blockitbuilder') {
      const model = rule.selector;
      return !!(model?.resultPositions?.enabled || containsPositionCondition(model?.root || model));
    }
    const selector = String(rule.selector || '');
    if (rule.type === 'xpath') return hasPositionDependentXPath(selector);
    return /:(?:nth-(?:last-)?(?:child|of-type)|(?:first|last|only)-(?:child|of-type)|matches-position|sibling-position|sibling-distance)\b/i
      .test(selector) || hasAdjacentSiblingCombinator(selector);
  }

  function containsPositionCondition(node) {
    if (!node || typeof node !== 'object') return false;
    if (node.resultPositions?.enabled || node.siblingPosition?.enabled || node.siblingDistance?.enabled) return true;
    return (node.relationGroups || []).some(group =>
      (group.entries || []).some(entry =>
        (entry.kind === 'sibling' && entry.siblingGap !== null && entry.siblingGap !== '') ||
        containsPositionCondition(entry.node)
      )
    );
  }

  /* `+` changes its target when the previous sibling is removed. Ignore plus
     signs inside attribute values, quoted text, regular expressions and CSS
     escapes; those are data rather than an adjacent-sibling combinator. */
  function hasAdjacentSiblingCombinator(selector, topLevelOnly = false) {
    let quote = '', bracketDepth = 0, parenDepth = 0, inRegex = false, escaped = false;
    for (let index = 0; index < selector.length; index++) {
      const char = selector[index];
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (quote) {
        if (char === quote) quote = '';
        continue;
      }
      if (char === '"' || char === "'") { quote = char; continue; }
      if (char === '/' && bracketDepth === 0) {
        inRegex = !inRegex;
        continue;
      }
      if (inRegex) continue;
      if (char === '[') { bracketDepth++; continue; }
      if (char === ']') { bracketDepth = Math.max(0, bracketDepth - 1); continue; }
      if (char === '(') { parenDepth++; continue; }
      if (char === ')') { parenDepth = Math.max(0, parenDepth - 1); continue; }
      if (char === '+' && bracketDepth === 0 && (!topLevelOnly || parenDepth === 0)) return true;
    }
    return false;
  }

  function hasPositionDependentXPath(expression) {
    const xpath = String(expression || '').replace(/^xpath:/i, '');
    return /\b(?:position|last)\s*\(/i.test(xpath) ||
      /\[\s*\d+(?:\.\d+)?(?:\s*(?:[+*/-]|mod|div)\s*\d+(?:\.\d+)?)*\s*\]/i.test(xpath);
  }

  function positionalRuleKey(originalRule, rule) {
    return `${originalRule.id || ''}\u0000${rule.type || 'css'}\u0000${typeof rule.selector === 'string' ? rule.selector : originalRule.selector || ''}`;
  }

  function rememberAddedSubtree(node) {
    if (node.nodeType !== 1) return;
    pendingAddedNodes.add(node);
    node.querySelectorAll?.('*').forEach(element => pendingAddedNodes.add(element));
  }

  function siblingAtDistance(element, direction, distance) {
    let sibling = element;
    for (let index = 0; index < distance && sibling; index++) {
      sibling = direction === 'previous' ? sibling.previousElementSibling : sibling.nextElementSibling;
    }
    return sibling;
  }

  function hasNewSiblingAnchor(element, rule, addedNodes) {
    const selector = typeof rule.selector === 'string' ? rule.selector : '';
    if (/:has\(\s*\+/i.test(selector) && addedNodes.has(element.nextElementSibling)) return true;
    if (hasAdjacentSiblingCombinator(selector, true) && addedNodes.has(element.previousElementSibling)) return true;
    const distances = selector.matchAll(/:sibling-distance\(\s*(previous|next|either)\s*,\s*(\d+)\s*,/gi);
    for (const [, direction, rawDistance] of distances) {
      const distance = Number(rawDistance);
      const directions = direction.toLowerCase() === 'either' ? ['previous', 'next'] : [direction.toLowerCase()];
      if (distance > 0 && directions.some(item => addedNodes.has(siblingAtDistance(element, item, distance)))) return true;
    }
    return false;
  }

  function isFreshPositionalMatch(element, rule, addedNodes) {
    return addedNodes.has(element) || hasNewSiblingAnchor(element, rule, addedNodes);
  }

  function applyRules() {
    /* Consume external mutations once. A second pass caused by BlockIt's own
       removals must not reuse them to delete the next sibling. */
    const addedNodes = pendingAddedNodes;
    pendingAddedNodes = new Set();
    captureSiblingTopology();
    globalThis.__blockItRuleModel?.captureSiblingPositions?.();
    const planned = [];
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
        const matches = findElements(rule.selector, rule.type || 'css');
        if (key) {
          const frozen = frozenPositionalMatches.get(key);
          elements = frozen
            ? matches.filter(element => frozen.has(element) || isFreshPositionalMatch(element, rule, addedNodes))
            : matches;
          if (!frozen) frozenPositionalMatches.set(key, new Set(elements));
          else elements.forEach(element => frozen.add(element));
        } else {
          elements = matches;
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
      planned.push({ rule, elements });
    }
    /* Evaluate every rule against the same DOM state. Two equivalent sibling
       rules must not remove two successive siblings in a single pass. */
    for (const { rule, elements } of planned) {
      for (const element of elements) {
        if (!element.isConnected) continue;
        if (rule.mode === 'remove') {
          blockItRemovedNodes.add(element);
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
    new MutationObserver(records => {
      if (!activeRules.length) return;
      for (const record of records) {
        if (record.type === 'childList') {
          updateSiblingTopology(record);
          record.addedNodes.forEach(rememberAddedSubtree);
        }
      }
      if (scheduled) return;
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
    if (!activeRules.length) {
      pendingAddedNodes.clear();
    }
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
