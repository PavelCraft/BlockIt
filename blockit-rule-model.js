// Rule model used by Rule Builder. It is deliberately data-only: the same
// model is safe to store, edit later and evaluate in every document/frame.
(() => {
  const PREFIX = 'BIR1:';

  function normalizeText(value) {
    return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function compareNumber(actual, condition) {
    if (!condition?.enabled) return true;
    const expected = Number(condition.value);
    if (!Number.isFinite(expected)) return false;
    if (condition.operator === '>=') return actual >= expected;
    if (condition.operator === '<=') return actual <= expected;
    return actual === expected;
  }

  function classCountIsEnabled(node) {
    return node?.classesEnabled === true && !!node.classCount?.enabled;
  }

  function compareString(actual, condition) {
    if (!condition?.enabled || condition.mode === 'ignore') return true;
    const value = String(actual || '');
    const expected = String(condition.value || '');
    const insensitive = !!condition.ignoreCase;
    const source = insensitive ? value.toLocaleLowerCase() : value;
    const needle = insensitive ? expected.toLocaleLowerCase() : expected;
    if (condition.mode === 'exact') return source === needle;
    if (condition.mode === 'prefix') return source.startsWith(needle);
    if (condition.mode === 'suffix') return source.endsWith(needle);
    if (condition.mode === 'contains') return source.includes(needle);
    if (condition.mode === 'regex') {
      try { return new RegExp(expected, insensitive ? 'i' : '').test(value); } catch { return false; }
    }
    return false;
  }

  function classMatches(className, condition) {
    return compareString(className, { ...condition, enabled: condition?.enabled !== false });
  }

  function matchesClasses(element, node) {
    if (!node.classesEnabled) return true;
    if (!element.hasAttribute?.('class')) return false;
    return (node.classes || []).filter(item => item.enabled !== false && item.mode !== 'ignore' && item.value).every(condition =>
      [...element.classList].some(className => classMatches(className, condition))
    );
  }

  function nameMatches(name, condition) {
    if (!condition?.enabled) return true;
    return compareString(name, { ...condition, ignoreCase: true });
  }

  function ownText(element) {
    return normalizeText([...element.childNodes]
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent).join(' '));
  }

  function parentElement(element) {
    return element.parentElement || element.getRootNode?.().host || null;
  }

  function parsePositions(value) {
    const values = Array.isArray(value) ? value : String(value || '').split(/[,;\s]+/);
    return [...new Set(values.map(Number).filter(position => Number.isInteger(position) && position > 0))];
  }

  function siblingPosition(element) {
    return [...(element.parentElement?.children || [])].indexOf(element) + 1;
  }

  // Kept for callers using the older API; positions now reflect the live DOM.
  function captureSiblingPositions() {}

  function descendants(element) {
    const result = [];
    const visit = root => {
      for (const child of root.children || []) {
        result.push(child);
        visit(child);
        const shadow = child.shadowRoot || globalThis.__blockItGetClosedShadowRoot?.(child);
        if (shadow) visit(shadow);
      }
    };
    visit(element);
    return result;
  }

  function relationCandidates(element, kind) {
    if (kind === 'child') return [...element.children];
    if (kind === 'descendant') return descendants(element);
    if (kind === 'sibling') {
      const originalSiblings = globalThis.__blockItOriginalSiblings;
      return typeof originalSiblings === 'function'
        ? originalSiblings(element)
        : [...(element.parentElement?.children || [])].filter(item => item !== element);
    }
    if (kind === 'ancestor-nearest') {
      const parent = parentElement(element);
      return parent ? [parent] : [];
    }
    if (kind === 'ancestor-any') {
      const result = [];
      for (let item = parentElement(element); item; item = parentElement(item)) result.push(item);
      return result;
    }
    return [];
  }

  function hasTag(element, node) {
    return !node.tag || node.tag === '*' || element.localName === node.tag.toLowerCase();
  }

  function matchesRelation(element, relation) {
    let candidates;
    const hasSiblingDistance = relation.siblingGap !== null && relation.siblingGap !== '' && Number.isInteger(Number(relation.siblingGap)) && Number(relation.siblingGap) >= 0;
    if (relation.kind === 'sibling' && hasSiblingDistance) {
      const gap = Number(relation.siblingGap);
      const distance = Number.isInteger(gap) && gap >= 0 ? gap + 1 : 1;
      const originalSiblingAt = globalThis.__blockItOriginalSiblingAt;
      const directions = relation.siblingDirection === 'any' ? ['previous', 'next'] : [relation.siblingDirection];
      candidates = directions.map(direction => typeof originalSiblingAt === 'function'
        ? originalSiblingAt(element, direction, distance)
        : siblingAtDistance(element, direction, distance)).filter(Boolean);
    } else {
      candidates = relationCandidates(element, relation.kind);
    }
    if (relation.allowAbsent && !candidates.some(item => hasTag(item, relation.node))) return true;
    return candidates.some(candidate => matchesNode(candidate, relation.node));
  }

  function siblingAtDistance(element, direction, distance) {
    let sibling = element;
    for (let step = 0; step < distance && sibling; step++) sibling = direction === 'previous' ? sibling.previousElementSibling : sibling.nextElementSibling;
    return sibling;
  }

  function matchesNode(element, node) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE || !hasTag(element, node)) return false;
    if (!compareNumber(element.attributes.length, node.attributeCount)) return false;
    if (!compareNumber(element.classList.length, classCountIsEnabled(node) ? node.classCount : null)) return false;
    if (!matchesClasses(element, node)) return false;
    if (node.siblingPosition?.enabled) {
      const positions = parsePositions(node.siblingPosition.value);
      if (!positions.length || !positions.includes(siblingPosition(element))) return false;
    }
    for (const attribute of node.attributes || []) {
      if (!attribute.enabled) continue;
      const found = [...element.attributes].some(item => nameMatches(item.name, attribute.name) && compareString(item.value, attribute.value));
      if (!found) return false;
    }
    if (!compareString(ownText(element), node.ownText)) return false;
    if (!compareString(normalizeText(element.textContent), node.text)) return false;
    for (const group of node.relationGroups || []) {
      const entries = group.entries || [];
      const pass = group.mode === 'any'
        ? entries.some(entry => matchesRelation(element, entry))
        : entries.every(entry => matchesRelation(element, entry));
      if (!pass) return false;
    }
    return true;
  }

  function roots() {
    return globalThis.__blockItSelectorEngine?.roots?.() || [document];
  }

  function findAll(model) {
    const node = model.root || model;
    // For a plain tag/attribute rule, use the same selector engine as the
    // popup's live counter. Besides keeping both counters consistent, this
    // preserves the selector engine's traversal of nested document roots.
    if (isPlainAttributeRule(node) && globalThis.__blockItSelectorEngine?.find) {
      return globalThis.__blockItSelectorEngine.find(toDisplaySelector({ root: node }));
    }
    const result = new Set();
    for (const root of roots()) {
      root.querySelectorAll?.('*').forEach(element => {
        if (matchesNode(element, model.root || model)) result.add(element);
      });
    }
    return [...result];
  }

  function isPlainAttributeRule(node) {
    if (node.attributeCount?.enabled || classCountIsEnabled(node) || node.siblingPosition?.enabled ||
        node.ownText?.enabled || node.text?.enabled ||
        (node.relationGroups || []).some(group => group.entries?.length)) return false;
    return (node.attributes || []).every(attribute => !attribute.enabled ||
      (attribute.name?.enabled && attribute.name.mode === 'exact' &&
       !attribute.name.ignoreCase && !attribute.value?.ignoreCase &&
       (!attribute.value?.enabled || ['exact', 'prefix', 'suffix', 'contains', 'ignore'].includes(attribute.value.mode))));
  }

  function rankedResults(model, elements) {
    const positions = new Map(elements.map((element, index) => [element, index + 1]));
    return { elements, positions };
  }

  function find(model) {
    const ranked = rankedResults(model, findAll(model));
    const positions = parsePositions(model?.resultPositions?.value);
    if (!model?.resultPositions?.enabled || !positions.length) return ranked.elements;
    return ranked.elements.filter(element => positions.includes(ranked.positions.get(element)));
  }

  function findWithTotal(model) {
    const ranked = rankedResults(model, findAll(model));
    const all = ranked.elements;
    const positions = parsePositions(model?.resultPositions?.value);
    const selected = !model?.resultPositions?.enabled || !positions.length
      ? all
      : all.filter(element => positions.includes(ranked.positions.get(element)));
    return { elements: selected, total: all.length };
  }

  function stringify(model) { return PREFIX + JSON.stringify(model); }

  function quoteDisplay(value) { return JSON.stringify(String(value || '')); }
  function displayAttribute(attribute) {
    if (!attribute.enabled || !attribute.name?.enabled) return '';
    const name = attribute.name, value = attribute.value || {};
    if (name.mode === 'exact') {
      const attrName = name.value || '*';
      if (!value.enabled || value.mode === 'ignore') return `[${attrName}]`;
      const operator = ({ exact: '=', prefix: '^=', suffix: '$=', contains: '*=' })[value.mode];
      return operator ? `[${attrName}${operator}${quoteDisplay(value.value)}]` : `:attr(${quoteDisplay(attrName)},/${value.value || ''}/)`;
    }
    const expression = name.mode === 'prefix' ? `${quoteDisplay(name.value)}*` : `/${name.value || ''}/`;
    return !value.enabled || value.mode === 'ignore' ? `:attr-name(${expression})` : `:attr(${expression}, ${quoteDisplay(value.value)})`;
  }
  function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\//g, '\\/');
  }
  function displayClass(condition) {
    if (condition.enabled === false || condition.mode === 'ignore' || !condition.value) return '';
    if ((condition.mode || 'exact') === 'exact') return '.' + (globalThis.CSS?.escape?.(condition.value) || condition.value);
    if (condition.mode === 'regex') return ':class-name(/' + condition.value + '/)';
    const escaped = escapeRegex(condition.value);
    const expression = condition.mode === 'prefix' ? '^' + escaped : condition.mode === 'suffix' ? escaped + '$' : escaped;
    return ':class-name(/' + expression + '/)';
  }
  function displayNode(node) {
    let value = node.tag || '*';
    if (node.classesEnabled) {
      const classes = (node.classes || []).map(displayClass).join('');
      value += classes || '[class]';
    }
    value += (node.attributes || []).map(displayAttribute).join('');
    if (node.attributeCount?.enabled) value += `:attr-count(${node.attributeCount.operator}${node.attributeCount.value})`;
    if (classCountIsEnabled(node)) value += `:class-count(${node.classCount.operator}${node.classCount.value})`;
    if (node.siblingPosition?.enabled && node.siblingPosition.value) value += `:sibling-position(${node.siblingPosition.value})`;
    const appendText = (condition, pseudo) => {
      if (!condition?.enabled || condition.mode === 'ignore') return;
      const suffix = ({ exact: '', prefix: '-starts', suffix: '-ends', contains: '-contains', regex: '-matches' })[condition.mode] || '';
      value += `:${pseudo}${suffix}(${quoteDisplay(condition.value)})`;
    };
    appendText(node.ownText, 'own-text'); appendText(node.text, 'text');
    return value;
  }
  function toDisplaySelector(model) {
    const build = node => {
      let value = displayNode(node);
      const relations = (node.relationGroups || []).flatMap(group => group.entries || []);
      for (const relation of relations.filter(item => item.kind?.startsWith('ancestor'))) value = `${build(relation.node)}${relation.kind === 'ancestor-nearest' ? ' > ' : ' '}${value}`;
      for (const relation of relations.filter(item => item.kind === 'child' || item.kind === 'descendant')) value += `:has(${relation.kind === 'child' ? '> ' : ''}${build(relation.node)})`;
      /* В модели «сиблинг» — любой элемент с тем же родителем. CSS `~`
         означает только следующего сиблинга, поэтому для строкового правила
         используем собственный симметричный псевдокласс BlockIt. */
      for (const relation of relations.filter(item => item.kind === 'sibling')) {
        const sibling = build(relation.node);
        const hasDistance = relation.siblingGap !== null && relation.siblingGap !== '' && Number.isInteger(Number(relation.siblingGap)) && Number(relation.siblingGap) >= 0;
        if (hasDistance) {
          const gap = Number(relation.siblingGap);
          const direction = relation.siblingDirection === 'any' ? 'either' : relation.siblingDirection;
          value += `:sibling-distance(${direction},${gap + 1},${sibling})`;
        } else value += `:near(${sibling})`;
      }
      return value;
    };
    const value = build(model.root || model);
    return model.resultPositions?.enabled && model.resultPositions.value ? `${value}:matches-position(${model.resultPositions.value})` : value;
  }

  function cssIdentifier(value) {
    const source = String(value || '');
    if (!source) return '';
    if (globalThis.CSS?.escape) return globalThis.CSS.escape(source);
    return /^[a-zA-Z_][\w-]*$/.test(source) ? source : '';
  }

  function cssAttribute(attribute) {
    if (!attribute.enabled) return '';
    const name = attribute.name || {};
    const value = attribute.value || {};
    if (!name.enabled || name.mode !== 'exact' || name.ignoreCase) return null;
    const attrName = cssIdentifier(name.value);
    if (!attrName) return null;
    if (!value.enabled || value.mode === 'ignore') return `[${attrName}]`;
    const operator = ({ exact: '=', prefix: '^=', suffix: '$=', contains: '*=' })[value.mode];
    if (!operator) return null;
    return `[${attrName}${operator}${quoteDisplay(value.value)}${value.ignoreCase ? ' i' : ''}]`;
  }

  function toCssSelector(model) {
    if (!model || model.resultPositions?.enabled) return null;

    const build = (node, nestedRelation = false) => {
      if (!node || node.attributeCount?.enabled || classCountIsEnabled(node) ||
          node.ownText?.enabled || node.text?.enabled) return null;

      const tag = node.tag && node.tag !== '*' ? cssIdentifier(node.tag) : '*';
      if (!tag) return null;
      let value = tag;
      if (node.classesEnabled) {
        let hasClassCondition = false;
        for (const condition of node.classes || []) {
          if (condition.enabled === false || condition.mode === 'ignore' || !condition.value) continue;
          if ((condition.mode || 'exact') !== 'exact') return null;
          const className = cssIdentifier(condition.value);
          if (!className) return null;
          value += '.' + className;
          hasClassCondition = true;
        }
        if (!hasClassCondition) value += '[class]';
      }
      for (const attribute of node.attributes || []) {
        const part = cssAttribute(attribute);
        if (part === null) return null;
        value += part;
      }

      if (node.siblingPosition?.enabled) {
        const positions = parsePositions(node.siblingPosition.value);
        if (!positions.length) return null;
        value += positions.length === 1
          ? `:nth-child(${positions[0]})`
          : `:is(${positions.map(position => `:nth-child(${position})`).join(',')})`;
      }

      const groups = node.relationGroups || [];
      if (groups.some(group => group.mode === 'any')) return null;
      const relations = groups.flatMap(group => group.entries || []);
      if (relations.some(relation => relation.allowAbsent)) return null;
      const ancestors = relations.filter(relation => relation.kind?.startsWith('ancestor'));
      if (ancestors.length > 1 || (nestedRelation && ancestors.length)) return null;
      if (nestedRelation && relations.filter(relation => !relation.kind?.startsWith('ancestor')).length > 1) return null;

      for (const relation of relations.filter(item => item.kind === 'child' || item.kind === 'descendant')) {
        const related = build(relation.node, true);
        if (!related) return null;
        const relative = `${relation.kind === 'child' ? '> ' : ''}${related}`;
        value += nestedRelation ? ` ${relative}` : `:has(${relative})`;
      }

      for (const relation of relations.filter(item => item.kind === 'sibling')) {
        if (relation.siblingDirection !== 'next') return null;
        const related = build(relation.node, true);
        if (!related) return null;
        const hasDistance = relation.siblingGap !== null && relation.siblingGap !== '' &&
          Number.isInteger(Number(relation.siblingGap)) && Number(relation.siblingGap) >= 0;
        const relative = !hasDistance ? `~ ${related}` : `${`${'+ * '.repeat(Number(relation.siblingGap))}+ ${related}`.trim()}`;
        value += nestedRelation ? ` ${relative}` : `:has(${relative})`;
      }

      if (relations.some(relation => !['ancestor-nearest', 'ancestor-any', 'child', 'descendant', 'sibling'].includes(relation.kind))) return null;
      if (ancestors.length) {
        const parent = build(ancestors[0].node);
        if (!parent) return null;
        value = `${parent}${ancestors[0].kind === 'ancestor-nearest' ? ' > ' : ' '}${value}`;
      }
      return value;
    };

    const selector = build(model.root || model);
    if (!selector) return null;
    try { document.createDocumentFragment().querySelector(selector); } catch { return null; }
    return selector;
  }

  function parse(value) {
    if (!String(value).startsWith(PREFIX)) throw new Error('Invalid Rule Builder rule');
    const model = JSON.parse(String(value).slice(PREFIX.length));
    if (!model?.root) throw new Error('Invalid Rule Builder model');
    return model;
  }

  globalThis.__blockItRuleModel = { PREFIX, find, findWithTotal, matchesNode, stringify, parse, normalizeText, captureSiblingPositions, toDisplaySelector, toCssSelector };
})();
