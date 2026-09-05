// Rule model used by Rule Builder. It is deliberately data-only: the same
// model is safe to store, edit later and evaluate in every document/frame.
(() => {
  const PREFIX = 'BIR1:';
  const siblingPositions = new WeakMap();
  const resultPositionMaps = new Map();

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
    if (siblingPositions.has(element)) return siblingPositions.get(element);
    const siblings = [...(element.parentElement?.children || [])];
    const position = siblings.indexOf(element) + 1;
    if (position > 0) siblingPositions.set(element, position);
    return position;
  }

  function captureSiblingPositions() {
    for (const root of roots()) root.querySelectorAll?.('*').forEach(siblingPosition);
  }

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
    if (kind === 'sibling') return [...(element.parentElement?.children || [])].filter(item => item !== element);
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
    const candidates = relationCandidates(element, relation.kind);
    if (relation.allowAbsent && !candidates.some(item => hasTag(item, relation.node))) return true;
    return candidates.some(candidate => matchesNode(candidate, relation.node));
  }

  function matchesNode(element, node) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE || !hasTag(element, node)) return false;
    if (!compareNumber(element.attributes.length, node.attributeCount)) return false;
    if (!compareNumber(element.classList.length, node.classCount)) return false;
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
    const result = new Set();
    for (const root of roots()) {
      root.querySelectorAll?.('*').forEach(element => {
        if (matchesNode(element, model.root || model)) result.add(element);
      });
    }
    return [...result];
  }

  function rankedResults(model, elements) {
    const key = JSON.stringify(model?.root || model);
    let positions = resultPositionMaps.get(key);
    if (!positions) { positions = new WeakMap(); resultPositionMaps.set(key, positions); }
    elements.forEach((element, index) => { if (!positions.has(element)) positions.set(element, index + 1); });
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
  function displayNode(node) {
    let value = node.tag || '*';
    value += (node.attributes || []).map(displayAttribute).join('');
    if (node.attributeCount?.enabled) value += `:attr-count(${node.attributeCount.operator}${node.attributeCount.value})`;
    if (node.classCount?.enabled) value += `:class-count(${node.classCount.operator}${node.classCount.value})`;
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
      for (const relation of relations.filter(item => item.kind === 'sibling')) value += `:near(${build(relation.node)})`;
      return value;
    };
    const value = build(model.root || model);
    return model.resultPositions?.enabled && model.resultPositions.value ? `${value}:matches-position(${model.resultPositions.value})` : value;
  }
  function parse(value) {
    if (!String(value).startsWith(PREFIX)) throw new Error('Invalid Rule Builder rule');
    const model = JSON.parse(String(value).slice(PREFIX.length));
    if (!model?.root) throw new Error('Invalid Rule Builder model');
    return model;
  }

  globalThis.__blockItRuleModel = { PREFIX, find, findWithTotal, matchesNode, stringify, parse, normalizeText, captureSiblingPositions, toDisplaySelector };
})();
