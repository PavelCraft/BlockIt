const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const hook = fs.readFileSync(path.join(__dirname, '..', 'blockit-shadow-hook.js'), 'utf8');

function page(...ids) {
  const observers = [];
  const root = { children: [] };
  const notify = records => observers.forEach(observer => observer(records));

  class Element {
    constructor(id, isAnchor = false) {
      this.id = id;
      this.isAnchor = isAnchor;
      this.nodeType = 1;
      this.parent = null;
      this.style = { setProperty() {} };
    }
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
      find: selector => selector === 'div:nth-child(2)'
        ? root.children.slice(1, 2)
        : root.children.filter(element => element.isAnchor).map(element => element.previousElementSibling).filter(Boolean)
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

test('two equivalent sibling rules inspect the same DOM before removal', async () => {
  const state = page('older', 'ad', 'anchor');
  state.apply([cssRule, blockitRule]);
  await settle();
  assert.deepEqual(state.root.children.map(element => element.id), ['older', 'anchor']);
});

test('a later inserted ad is removed, without deleting the promoted old sibling', async () => {
  const state = page('older', 'placeholder', 'anchor');
  state.apply([cssRule, blockitRule]);
  assert.deepEqual(state.root.children.map(element => element.id), ['older', 'anchor']);
  const ad = state.insertBefore('late-ad', state.root.children[1]);
  state.notify([{ type: 'childList', addedNodes: [ad] }]);
  await settle();
  assert.deepEqual(state.root.children.map(element => element.id), ['older', 'anchor']);
});

test('nth-child does not delete the node promoted after its target is removed', async () => {
  const state = page('first', 'target', 'third');
  state.apply([{ id: 'nth', type: 'css', selector: 'div:nth-child(2)', mode: 'remove' }]);
  await settle();
  assert.deepEqual(state.root.children.map(element => element.id), ['first', 'third']);
});

test('a batch of new siblings does not cascade after the first removal', async () => {
  const state = page('anchor');
  state.apply([blockitRule]);
  const anchor = state.root.children[0];
  const first = state.insertBefore('first', anchor);
  const second = state.insertBefore('second', anchor);
  state.notify([{ type: 'childList', addedNodes: [first, second] }]);
  await settle();
  assert.deepEqual(state.root.children.map(element => element.id), ['first', 'anchor']);
});

test('a newly inserted sibling anchor can select an existing target', async () => {
  const state = page('target');
  state.apply([cssRule, blockitRule]);
  const anchor = state.insertBefore('anchor', null, true);
  state.notify([{ type: 'childList', addedNodes: [anchor] }]);
  await settle();
  assert.deepEqual(state.root.children.map(element => element.id), ['anchor']);
});

test('an unrelated inserted sibling does not cause a promoted old target to be removed', async () => {
  const state = page('older', 'placeholder', 'anchor');
  state.apply([cssRule, blockitRule]);
  const extra = state.insertBefore('extra', state.root.children[0]);
  state.notify([{ type: 'childList', addedNodes: [extra] }]);
  await settle();
  assert.deepEqual(state.root.children.map(element => element.id), ['extra', 'older', 'anchor']);
});

test('the original sibling distance survives removal by another BlockIt rule', async () => {
  const state = page('target', 'between', 'anchor');
  const target = state.root.children[0];
  const anchor = state.root.children[2];
  state.apply([{ id: 'between', type: 'css', selector: 'div:nth-child(2)', mode: 'remove' }]);
  await settle();
  assert.deepEqual(state.root.children.map(element => element.id), ['target', 'anchor']);
  assert.equal(state.originalSiblingAt(target, 'next', 2), anchor);
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
