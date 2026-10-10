const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const hook = fs.readFileSync(path.join(__dirname, '..', 'blockit-shadow-hook.js'), 'utf8');

function page(...ids) {
  const observers = [];
  const root = { children: [], adoptedStyleSheets: [] };
  const notify = records => observers.forEach(observer => observer(records.map(record => ({
    target: root, addedNodes: [], removedNodes: [], ...record
  }))));

  class Element {
    constructor(id, isAnchor = false) {
      this.id = id;
      this.isAnchor = isAnchor;
      this.nodeType = 1;
      this.parent = null;
      this.attributes = new Map();
    }
    setAttribute(name, value) { this.attributes.set(name, value); }
    removeAttribute(name) { this.attributes.delete(name); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    get isConnected() { return !!this.parent?.children.includes(this); }
    get parentElement() { return this.parent; }
    get previousElementSibling() {
      const index = this.parent?.children.indexOf(this) ?? -1;
      return index > 0 ? this.parent.children[index - 1] : null;
    }
    get nextElementSibling() {
      const index = this.parent?.children.indexOf(this) ?? -1;
      return index >= 0 ? this.parent.children[index + 1] || null : null;
    }
    querySelectorAll() { return []; }
    remove() {
      if (!this.isConnected) return;
      this.parent.children.splice(this.parent.children.indexOf(this), 1);
      notify([{ type: 'childList', addedNodes: [], removedNodes: [this] }]);
    }
  }
  Element.prototype.attachShadow = function() { return {}; };

  function insertBefore(id, before, isAnchor = false) {
    const element = new Element(id, isAnchor);
    element.parent = root;
    const index = before ? root.children.indexOf(before) : root.children.length;
    root.children.splice(index, 0, element);
    return element;
  }

  ids.forEach(id => insertBefore(id, null, id === 'anchor'));
  const listeners = {};
  const window = {
    Element,
    document: { querySelector() { return null; } },
    CSSStyleSheet: class {
      replaceSync(css) { this.css = css; }
    },
    __blockItSelectorCore: {
      isBlockItRule: selector => /:(?:sibling-distance|attr-count|own-text)\(/.test(selector)
    },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; }
      observe() { observers.push(this.callback); }
    },
    setTimeout,
    addEventListener(type, listener) { listeners[type] = listener; },
    __blockItSelectorEngine: {
      roots: () => [root],
      getFrameHasFilters: () => [],
      normalizeCssSelector: selector => selector,
      find: selector => {
        if (selector === 'div:nth-child(2)') return root.children.slice(1, 2);
        if (selector === 'div:attr-count(=1)') return root.children.filter(element => element.attributes.size === 1);
        if (selector === 'div:own-text("ad")') return root.children.filter(element => element.textContent === 'ad');
        return root.children.filter(element => element.isAnchor)
          .map(element => element.previousElementSibling).filter(Boolean);
      }
    }
  };
  window.window = window;
  const context = vm.createContext(window);
  vm.runInContext(hook, context);
  const pageWindow = vm.runInContext('window', context);

  return {
    root,
    insertBefore,
    notify,
    hiddenIds() {
      const activeCss = root.adoptedStyleSheets.filter(sheet => !sheet.disabled)
        .flatMap(sheet => [...(sheet.css || '').matchAll(/^(.+?) \{ display: none !important; \}$/gm)]
          .map(match => match[1]).filter(selector => !selector.startsWith('[data-blockit-hidden')));
      const cssMatches = new Set(activeCss.flatMap(selector => window.__blockItSelectorEngine.find(selector)));
      return root.children.filter(element =>
        element.getAttribute('data-blockit-hidden') === 'collapse' || cssMatches.has(element)
      ).map(element => element.id);
    },
    marker(id) {
      return root.children.find(element => element.id === id)?.getAttribute('data-blockit-hidden');
    },
    originalSiblingAt(element, direction, distance) {
      return pageWindow.__blockItOriginalSiblingAt(element, direction, distance);
    },
    apply(rules) {
      listeners.message({ source: pageWindow, data: { source: 'blockit', action: 'apply-rules', rules } });
    }
  };
}

const cssRule = { id: 'css', type: 'css', selector: 'div:has(+ div.new-menu)', mode: 'remove' };
const blockitRule = { id: 'blockit', type: 'blockitrule', selector: 'div:sibling-distance(next, 1, div.new-menu)', mode: 'remove' };
const settle = () => new Promise(resolve => setTimeout(resolve, 120));

test('two equivalent sibling rules hide only their shared target', async () => {
  const state = page('older', 'ad', 'anchor');
  state.apply([cssRule, blockitRule]);
  await settle();
  assert.deepEqual(state.hiddenIds(), ['ad']);
});

test('a later inserted ad is hidden without hiding an unrelated sibling', async () => {
  const state = page('older', 'placeholder', 'anchor');
  state.apply([cssRule, blockitRule]);
  assert.deepEqual(state.hiddenIds(), ['placeholder']);
  const ad = state.insertBefore('late-ad', state.root.children[2]);
  state.notify([{ type: 'childList', addedNodes: [ad] }]);
  await settle();
  assert.deepEqual(state.hiddenIds(), ['late-ad']);
});

test('nth-child hides its target without changing sibling positions', async () => {
  const state = page('first', 'target', 'third');
  state.apply([{ id: 'nth', type: 'css', selector: 'div:nth-child(2)', mode: 'remove' }]);
  await settle();
  assert.deepEqual(state.hiddenIds(), ['target']);
});

test('a batch of new siblings hides only the positional match', async () => {
  const state = page('anchor');
  state.apply([blockitRule]);
  const anchor = state.root.children[0];
  const first = state.insertBefore('first', anchor);
  const second = state.insertBefore('second', anchor);
  state.notify([{ type: 'childList', addedNodes: [first, second] }]);
  await settle();
  assert.deepEqual(state.hiddenIds(), ['second']);
});

test('a newly inserted sibling anchor can select an existing target', async () => {
  const state = page('target');
  state.apply([cssRule, blockitRule]);
  const anchor = state.insertBefore('anchor', null, true);
  state.notify([{ type: 'childList', addedNodes: [anchor] }]);
  await settle();
  assert.deepEqual(state.hiddenIds(), ['target']);
});

test('an unrelated inserted sibling does not become hidden', async () => {
  const state = page('older', 'placeholder', 'anchor');
  state.apply([cssRule, blockitRule]);
  const extra = state.insertBefore('extra', state.root.children[0]);
  state.notify([{ type: 'childList', addedNodes: [extra] }]);
  await settle();
  assert.deepEqual(state.hiddenIds(), ['placeholder']);
});

test('hiding another node preserves the original sibling distance', async () => {
  const state = page('target', 'between', 'anchor');
  const target = state.root.children[0];
  const anchor = state.root.children[2];
  state.apply([{ id: 'between', type: 'css', selector: 'div:nth-child(2)', mode: 'remove' }]);
  await settle();
  assert.deepEqual(state.hiddenIds(), ['between']);
  assert.equal(state.originalSiblingAt(target, 'next', 2), anchor);
});

test('disabling a CSS rule restores the element without reloading', () => {
  const state = page('first', 'target', 'third');
  state.apply([{ id: 'nth', type: 'css', selector: 'div:nth-child(2)', mode: 'remove' }]);
  assert.deepEqual(state.hiddenIds(), ['target']);
  state.apply([]);
  assert.deepEqual(state.hiddenIds(), []);
});

test('a new DOM node is covered by a CSS rule without another apply message', () => {
  const state = page('first', 'old-second');
  state.apply([{ id: 'nth', type: 'css', selector: 'div:nth-child(2)', mode: 'remove' }]);
  state.insertBefore('new-second', state.root.children[1]);
  assert.deepEqual(state.hiddenIds(), ['new-second']);
});

test('BlockIt marker is removed when an attribute condition stops matching', async () => {
  const state = page('target');
  const target = state.root.children[0];
  target.setAttribute('data-ad', '1');
  state.apply([{ id: 'count', type: 'blockitrule', selector: 'div:attr-count(=1)', mode: 'remove' }]);
  assert.equal(state.marker('target'), 'collapse');
  // The marker is excluded before evaluating the attribute count again.
  state.notify([{ type: 'attributes', attributeName: 'data-ad' }]);
  await settle();
  assert.equal(state.marker('target'), 'collapse');
  target.removeAttribute('data-ad');
  state.notify([{ type: 'attributes', attributeName: 'data-ad' }]);
  await settle();
  assert.equal(state.marker('target'), null);
});

test('reusing a row for different text removes the old BlockIt marker', async () => {
  const state = page('row');
  const row = state.root.children[0];
  row.textContent = 'ad';
  state.apply([{ id: 'text', type: 'blockitrule', selector: 'div:own-text("ad")', mode: 'remove' }]);
  assert.equal(state.marker('row'), 'collapse');
  row.textContent = 'letter';
  state.notify([{ type: 'characterData' }]);
  await settle();
  assert.equal(state.marker('row'), null);
});

test('disabling a BlockIt rule removes its marker', () => {
  const state = page('row');
  state.root.children[0].textContent = 'ad';
  state.apply([{ id: 'text', type: 'blockitrule', selector: 'div:own-text("ad")', mode: 'hide' }]);
  assert.equal(state.marker('row'), 'reserve');
  state.apply([]);
  assert.equal(state.marker('row'), null);
});

test('Rule Builder displays siblings at the same hierarchy depth as their source element', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'rule-builder.js'), 'utf8');
  const helper = source.match(/function relatedPreviewDepth\(kind, sourceDepth\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(helper, 'preview depth helper should exist');
  const context = vm.createContext({});
  vm.runInContext(`${helper}; globalThis.siblingDepth = relatedPreviewDepth('sibling', 2); globalThis.childDepth = relatedPreviewDepth('child', 2);`, context);
  assert.equal(context.siblingDepth, 2);
  assert.equal(context.childDepth, 3);
});

test('Rule Builder exports an exact sibling gap as BlockIt syntax', () => {
  const context = vm.createContext({ Node: { TEXT_NODE: 3 }, globalThis: null });
  context.globalThis = context;
  const modelScript = fs.readFileSync(path.join(__dirname, '..', 'blockit-rule-model.js'), 'utf8');
  vm.runInContext(modelScript, context);
  const selector = context.__blockItRuleModel.toDisplaySelector({
    root: {
      tag: 'section', attributes: [], relationGroups: [{ entries: [{
        kind: 'sibling', siblingDirection: 'previous', siblingGap: 2,
        node: { tag: 'aside', attributes: [], relationGroups: [] }
      }] }]
    }
  });
  assert.equal(selector, 'section:sibling-distance(previous,3,aside)');
});

test('Rule Builder can require the same distance on either side', () => {
  const context = vm.createContext({ Node: { TEXT_NODE: 3 }, globalThis: null });
  context.globalThis = context;
  const modelScript = fs.readFileSync(path.join(__dirname, '..', 'blockit-rule-model.js'), 'utf8');
  vm.runInContext(modelScript, context);
  const selector = context.__blockItRuleModel.toDisplaySelector({
    root: {
      tag: 'section', attributes: [], relationGroups: [{ entries: [{
        kind: 'sibling', siblingDirection: 'any', siblingGap: 3,
        node: { tag: 'aside', attributes: [], relationGroups: [] }
      }] }]
    }
  });
  assert.equal(selector, 'section:sibling-distance(either,4,aside)');
});


test('Rule Builder exports exact classes as readable CSS and partial classes as BlockIt syntax', () => {
  const fragment = { querySelector() {} };
  const context = vm.createContext({
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
    CSS: { escape: value => String(value).replace(/[^a-zA-Z0-9_-]/g, character => '\\' + character) },
    document: { createDocumentFragment: () => fragment },
    globalThis: null
  });
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'blockit-rule-model.js'), 'utf8'), context);
  const exactModel = { root: { tag: 'div', classesEnabled: true, classes: [
    { enabled: true, mode: 'exact', value: 'card' },
    { enabled: true, mode: 'exact', value: 'featured' }
  ], attributes: [], relationGroups: [] } };
  assert.equal(context.__blockItRuleModel.toCssSelector(exactModel), 'div.card.featured');
  assert.equal(context.__blockItRuleModel.toDisplaySelector(exactModel), 'div.card.featured');
  const partialModel = { root: { tag: 'div', classesEnabled: true, classes: [
    { enabled: true, mode: 'prefix', value: 'letter-' }
  ], attributes: [], relationGroups: [] } };
  assert.equal(context.__blockItRuleModel.toCssSelector(partialModel), null);
  assert.equal(context.__blockItRuleModel.toDisplaySelector(partialModel), 'div:class-name(/^letter-/)');
});

test('an enabled class block without a class value requires the class attribute', () => {
  const fragment = { querySelector() {} };
  const context = vm.createContext({
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
    CSS: { escape: value => String(value) },
    document: { createDocumentFragment: () => fragment },
    globalThis: null
  });
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'blockit-rule-model.js'), 'utf8'), context);
  for (const classes of [[], [{ enabled: true, mode: 'ignore', value: '' }]]) {
    const model = { root: { tag: 'div', classesEnabled: true, classes, attributes: [], relationGroups: [] } };
    assert.equal(context.__blockItRuleModel.toCssSelector(model), 'div[class]');
    assert.equal(context.__blockItRuleModel.toDisplaySelector(model), 'div[class]');
    assert.equal(context.__blockItRuleModel.matchesNode({
      nodeType: 1, localName: 'div', matches: selector => selector === 'div', hasAttribute: name => name === 'class', classList: [], attributes: [], childNodes: [], textContent: ''
    }, model.root), true);
    assert.equal(context.__blockItRuleModel.matchesNode({
      nodeType: 1, localName: 'div', matches: selector => selector === 'div', hasAttribute: () => false, classList: [], attributes: [], childNodes: [], textContent: ''
    }, model.root), false);
  }
});

test('Rule Builder flattens nested child relations into CSS and ignores disabled class counts', () => {
  const fragment = { querySelector() {} };
  const context = vm.createContext({
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
    CSS: { escape: value => String(value) },
    document: { createDocumentFragment: () => fragment },
    globalThis: null
  });
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'blockit-rule-model.js'), 'utf8'), context);
  const leaf = { tag: 'div', classesEnabled: true, classes: [{ enabled: true, mode: 'exact', value: 'fullscreen-ad-wrapper' }], attributes: [], relationGroups: [] };
  const styled = { tag: 'div', attributes: [{ enabled: true, name: { enabled: true, mode: 'exact', value: 'style' }, value: { enabled: true, mode: 'exact', value: '' } }], relationGroups: [{ mode: 'all', entries: [{ kind: 'child', node: leaf }] }] };
  const root = { tag: 'div', classesEnabled: false, classes: [], classCount: { enabled: true, operator: '=', value: 9 }, attributes: [], relationGroups: [{ mode: 'all', entries: [{ kind: 'child', node: styled }] }] };
  const model = { root };
  assert.equal(context.__blockItRuleModel.toCssSelector(model), 'div:has(> div[style=""] > div.fullscreen-ad-wrapper)');
  assert.doesNotMatch(context.__blockItRuleModel.toDisplaySelector(model), /class-count/);
  const element = { nodeType: 1, localName: 'div', attributes: [], classList: { length: 0 }, childNodes: [], textContent: '' };
  assert.equal(context.__blockItRuleModel.matchesNode(element, { ...root, relationGroups: [] }), true);
});

test('Quick rule emits class selectors instead of exact class attributes', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'popup.js'), 'utf8');
  const functionSource = source.match(/function buildSelector\(tag, attributes\) \{[\s\S]*?\n\}/)[0];
  const context = vm.createContext({ CSS: { escape: value => String(value) }, result: null });
  vm.runInContext(functionSource + "; result = buildSelector('div', { class: 'card featured', id: 'hero' });", context);
  assert.equal(context.result, 'div.card.featured[id="hero"]');
});

test('Rule Builder skips the candidate screen when no related elements are available', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'rule-builder.js'), 'utf8');
  const functionSource = source.match(/function renderCandidateChoices\([\s\S]*?\n\}/)[0];
  assert.match(functionSource, /if \(!candidates\.length\) \{\s*addRelation\(owner, newRelation\(kind, null, source\)\);\s*scheduleRender\(\);\s*return;/);
  assert.doesNotMatch(functionSource, /choices\.append\(note\(tr\('В этом фрагменте HTML нет подходящих вариантов/);
});
