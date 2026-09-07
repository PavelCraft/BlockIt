const rootEditor = document.getElementById('rootEditor');
const countStatus = document.getElementById('countStatus');
const countTitle = document.getElementById('countTitle');
const countDetail = document.getElementById('countDetail');
const matchSelection = document.getElementById('matchSelection');
const matchPositions = document.getElementById('matchPositions');
const ruleCode = document.getElementById('ruleCode');
const ruleSummary = document.getElementById('ruleSummary');
const reloadResult = document.getElementById('reloadResult');
const builderModeRadios = [...document.querySelectorAll('input[name="builderBlockMode"]')];

let sourceTabId = null;
let model = null;
let sourceElement = null;
let countTimer = null;
let countRequest = 0;
let editingRule = null;
let editingNeedsReload = false;
let sourceUrl = '';
let ruleMode = 'remove';
const relationSources = new WeakMap();
const collapsedNodes = new WeakMap();

function newStringCondition(value = '', enabled = false) {
  return { enabled, mode: 'exact', value, ignoreCase: false };
}

function newCount(value = 0, enabled = true) {
  return { enabled, operator: '=', value };
}

function newPosition(value = '', enabled = false) { return { enabled, value }; }

function nodeFromElement(element) {
  return {
    tag: element.localName,
    attributeCount: newCount(element.attributes.length, true),
    classCount: newCount(element.classList.length, element.hasAttribute('class')),
    siblingPosition: newPosition('', false),
    attributes: [...element.attributes].map(attribute => ({
      enabled: true,
      name: newStringCondition(attribute.name, true),
      value: newStringCondition(attribute.value, true)
    })),
    ownText: newStringCondition(ownText(element), false),
    text: newStringCondition(normalizeText(element.textContent), false),
    relationGroups: [{ mode: 'all', entries: [] }]
  };
}

function emptyNode() {
  return { tag: '', attributeCount: newCount(0, false), classCount: newCount(0, false), siblingPosition: newPosition('', false), attributes: [], ownText: newStringCondition(), text: newStringCondition(), relationGroups: [{ mode: 'all', entries: [] }] };
}

function normalizeText(value) { return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(); }
function ownText(element) { return normalizeText([...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join(' ')); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }

function createOption(value, label, selected) {
  const option = document.createElement('option'); option.value = value; option.textContent = label; option.selected = value === selected; return option;
}
function select(values, selected) { const item = document.createElement('select'); values.forEach(([value, label]) => item.append(createOption(value, label, selected))); return item; }
function checkbox(checked) { const input = document.createElement('input'); input.type = 'checkbox'; input.checked = !!checked; return input; }
function textInput(value = '') { const input = document.createElement('input'); input.type = 'text'; input.value = value; return input; }
function smallButton(label, className = 'secondary') { const button = document.createElement('button'); button.type = 'button'; button.className = `${className} small`; button.textContent = label; return button; }

function render() {
  rootEditor.innerHTML = '';
  if (!model) { rootEditor.innerHTML = '<p class="note">Вставьте HTML и нажмите «Разобрать HTML».</p>'; updatePreview(); return; }
  model.resultPositions ||= newPosition('', false);
  matchPositions.value = model.resultPositions.value || '';
  const ancestorLevels = ancestorDepth(model.root);
  rootEditor.style.setProperty('--tree-indent', `${ancestorLevels * 60}px`);
  // Parents are deliberately placed above the target. This mirrors the DOM
  // hierarchy visually instead of hiding it behind abstract “relations”.
  // Render the whole ancestor chain above the target.  The parent of a parent
  // lives in that parent's model, so a flat list from root would lose it.
  const ancestorEntries = collectAncestorEntries(model.root, sourceElement);
  ancestorEntries.forEach((item, index) => {
    const entry = renderRelation(item.owner, item.relation, item.source);
    entry.classList.add('ancestor-node', 'has-next-node');
    entry.style.marginLeft = `${index * 60}px`;
    rootEditor.append(entry);
  });
  const rootLowerRelations = allRelations(model.root).filter(relation => !relation.kind.startsWith('ancestor'));
  const target = document.createElement('div'); target.className = 'node target';
  target.classList.toggle('has-ancestors', ancestorEntries.length > 0);
  target.classList.toggle('has-root-siblings', rootLowerRelations.some(relation => relation.kind === 'sibling'));
  target.append(renderRelationCaption('target'), renderNode(model.root, 'Блокируемый элемент', sourceElement, true, true, true, true, true, element => { sourceElement = element; }));
  rootEditor.append(target);
  const lowerTree = renderLowerTree(model.root, sourceElement, 'Блокируемого элемента');
  if (lowerTree) rootEditor.append(lowerTree);
  updatePreview();
}

function renderLowerTree(owner, source, ownerLabel) {
  const relations = allRelations(owner).filter(relation => !relation.kind.startsWith('ancestor'));
  if (!relations.length) return null;
  const branches = document.createElement('div'); branches.className = 'lower-tree';
  const descendants = relations.filter(relation => relation.kind === 'child' || relation.kind === 'descendant');
  if (descendants.length) {
    const group = document.createElement('div'); group.className = 'descendants';
    const caption = document.createElement('div'); caption.className = 'branch-caption'; caption.textContent = `Внутри ${ownerLabel.toLowerCase()}`;
    group.append(caption);
    descendants.forEach(relation => group.append(renderRelation(owner, relation, relationSources.get(relation))));
    branches.append(group);
  }
  const siblings = relations.filter(relation => relation.kind === 'sibling');
  branches.classList.toggle('has-siblings', siblings.length > 0);
  siblings.forEach(relation => branches.append(renderRelation(owner, relation, relationSources.get(relation))));
  return branches;
}

function collectAncestorEntries(owner, source, visited = new Set()) {
  if (!owner || visited.has(owner)) return [];
  visited.add(owner);
  const result = [];
  for (const relation of allRelations(owner).filter(item => item.kind.startsWith('ancestor'))) {
    const relationSource = relationSources.get(relation);
    result.push(...collectAncestorEntries(relation.node, relationSource, new Set(visited)));
    result.push({ owner, relation, source: relationSource || source });
  }
  return result;
}

function ancestorDepth(node, visited = new Set()) {
  if (!node || visited.has(node)) return 0;
  visited.add(node);
  const parents = allRelations(node).filter(relation => relation.kind.startsWith('ancestor'));
  return parents.length ? 1 + Math.max(...parents.map(relation => ancestorDepth(relation.node, new Set(visited)))) : 0;
}

function renderNode(node, title, source, isRoot = false, hideParentRelations = false, hideRelations = false, allowAncestor = false, allowLower = isRoot, sourceChanged = null) {
  const isCollapsed = !!collapsedNodes.get(node);
  const card = document.createElement('article'); card.className = `card${isRoot ? ' primary-card' : ''}${isCollapsed ? ' collapsed' : ''}`;
  const header = document.createElement('header'); header.className = 'card-head';
  const tagPill = document.createElement('span'); tagPill.className = 'tag'; tagPill.textContent = node.tag || '*';
  const role = document.createElement('span'); role.className = 'role'; role.textContent = title;
  const summary = document.createElement('span'); summary.className = 'summary'; summary.textContent = nodeSummary(node);
  const spacer = document.createElement('span'); spacer.className = 'spacer';
  const tag = textInput(node.tag); tag.placeholder = 'Любой тег';
  // While typing we deliberately do not validate or re-render: an empty field
  // is a normal intermediate state, not an error.
  tag.addEventListener('blur', () => { node.tag = tag.value.trim(); scheduleRender(); });
  const body = document.createElement('div'); body.className = 'card-body';
  const collapse = document.createElement('button'); collapse.type = 'button'; collapse.className = 'icon-btn collapse'; collapse.title = isCollapsed ? 'Развернуть' : 'Свернуть'; collapse.setAttribute('aria-label', collapse.title); collapse.innerHTML = '<span class="chev">⌃</span>';
  collapse.addEventListener('click', () => { collapsedNodes.set(node, !collapsedNodes.get(node)); scheduleRender(); });
  let ancestorMenu = null;
  if (allowAncestor) {
    ancestorMenu = document.createElement('div'); ancestorMenu.className = 'menu-wrap';
    // This intentionally mirrors the mockup's button verbatim.  Do not route
    // it through the generic helper: helper-only classes made visual matching
    // needlessly fragile.
    const addAncestor = document.createElement('button');
    addAncestor.type = 'button';
    addAncestor.className = 'btn small menu-trigger';
    addAncestor.textContent = '↑ Добавить предка';
    const picker = document.createElement('div'); picker.className = 'menu';
    addAncestor.addEventListener('click', () => { const opening = !picker.classList.contains('open'); document.querySelectorAll('.menu.open').forEach(menu => menu.classList.remove('open')); if (opening) { renderRelationKinds(picker, node, source, [['ancestor-nearest', 'Непосредственный родитель'], ['ancestor-any', 'Просто предок']]); picker.classList.add('open'); } });
    ancestorMenu.append(addAncestor, picker);
  }
  header.append(tagPill, role, summary, spacer);
  if (ancestorMenu) header.append(ancestorMenu);
  header.append(collapse); card.append(header, body);
  body.hidden = isCollapsed;

  body.append(renderHtmlImporter(node, sourceChanged));

  const tagEdit = document.createElement('div'); tagEdit.className = 'tag-edit';
  const tagLabel = document.createElement('label'); tagLabel.className = 'label'; tagLabel.textContent = 'Имя тега';
  const hint = document.createElement('span'); hint.className = 'hint'; hint.textContent = 'Можно оставить пустым, если тег не важен';
  tagEdit.append(tagLabel, tag, hint); body.append(tagEdit);

  const counts = section('Количество', 'структурные признаки');
  counts.append(renderCount(node.attributeCount, 'Количество атрибутов', () => scheduleUpdate()));
  node.siblingPosition ||= newPosition('', false);
  counts.append(renderPosition(node.siblingPosition));
  body.append(counts);

  const attributes = section('Атрибуты', 'совпадут все включённые');
  if (!node.attributes.length) attributes.append(note('У этого элемента пока нет добавленных атрибутов.'));
  node.attributes.forEach((attribute, index) => attributes.append(renderAttribute(node, attribute, index)));
  const addAttribute = smallButton('+ Добавить атрибут'); addAttribute.classList.add('add');
  addAttribute.addEventListener('click', () => { node.attributes.push({ enabled: true, name: newStringCondition('', true), value: newStringCondition('', false) }); scheduleRender(); });
  attributes.append(addAttribute); body.append(attributes);

  const texts = section('Текст', 'содержимое элемента');
  texts.append(renderTextCondition(node.ownText, 'Текст самого элемента', () => scheduleUpdate()));
  texts.append(renderTextCondition(node.text, 'Текст внутри элемента', () => scheduleUpdate()));
  body.append(texts);

  if (allowLower) body.append(renderRootAdder(node, source, 'lower'));
  if (!hideRelations) body.append(renderEnvironment(node, source, hideParentRelations));
  return card;
}

function renderHtmlImporter(node, sourceChanged) {
  const importer = document.createElement('div'); importer.className = 'html-importer';
  const copy = document.createElement('div'); copy.className = 'html-importer-copy';
  const title = document.createElement('strong'); title.textContent = 'Заполнить из HTML';
  const hint = document.createElement('span'); hint.textContent = 'Тег, атрибуты и текст заполнятся автоматически';
  copy.append(title, hint);
  const html = document.createElement('textarea'); html.className = 'html-import-input'; html.placeholder = '<div class="banner" data-ad="true">…</div>';
  const parse = document.createElement('button'); parse.type = 'button'; parse.className = 'btn small primary'; parse.textContent = 'Разобрать';
  parse.addEventListener('click', () => {
    const element = parseHtmlElement(html.value);
    if (!element) return alert('Не удалось найти HTML-элемент. Вставьте разметку, начинающуюся с тега.');
    const relationGroups = node.relationGroups;
    Object.assign(node, nodeFromElement(element));
    node.relationGroups = relationGroups;
    sourceChanged?.(element);
    scheduleRender();
  });
  importer.append(copy, html, parse);
  return importer;
}

function nodeSummary(node) {
  const enabled = (node.attributes || []).filter(attribute => attribute.enabled).length
    + Number(!!node.attributeCount?.enabled) + Number(!!node.classCount?.enabled)
    + Number(!!node.ownText?.enabled) + Number(!!node.text?.enabled);
  return enabled ? `${enabled} ${enabled === 1 ? 'условие' : 'условия'}` : 'без условий';
}

function renderRelationCaption(kind) {
  const caption = document.createElement('div'); caption.className = 'relation';
  const labels = { target:['target', 'Цель', 'этот элемент будет заблокирован'], child:['child', 'Дочерний элемент', 'непосредственно внутри выбранного элемента'], descendant:['child', 'Потомок', 'внутри выбранного элемента на любом уровне'], 'ancestor-nearest':['', 'Родитель', 'непосредственный родитель выбранного элемента'], 'ancestor-any':['', 'Предок', 'предок выбранного элемента на любом уровне'], sibling:['sibling', 'Сиблинг', 'на одном уровне с выбранным элементом'] };
  const [tone, label, description] = labels[kind];
  const pill = document.createElement('span'); pill.className = `pill ${tone}`; pill.textContent = label;
  const text = document.createElement('span'); text.textContent = description;
  caption.append(pill, text); return caption;
}

function section(title, hint = '') { const element = document.createElement('div'); element.className = 'section'; const heading = document.createElement('div'); heading.className = 'section-title'; heading.append(document.createTextNode(title)); if (hint) { const detail = document.createElement('span'); detail.textContent = hint; heading.append(detail); } element.append(heading); return element; }
function note(value) { const item = document.createElement('p'); item.className = 'note'; item.textContent = value; return item; }

function renderCount(condition, label, changed) {
  const row = document.createElement('div'); row.className = 'quantity';
  const toggle = document.createElement('label'); toggle.className = 'toggle';
  const enabled = checkbox(condition.enabled); const toggleVisual = document.createElement('i'); toggle.append(enabled, toggleVisual);
  const title = document.createElement('span'); title.textContent = label;
  const operator = select([['=', 'ровно'], ['>=', 'не менее'], ['<=', 'не более']], condition.operator); const value = textInput(condition.value);
  value.type = 'number'; value.min = '0'; value.disabled = !condition.enabled; operator.disabled = !condition.enabled;
  enabled.addEventListener('change', () => { condition.enabled = enabled.checked; changed(); });
  operator.addEventListener('change', () => { condition.operator = operator.value; changed(); }); value.addEventListener('input', () => { condition.value = value.value; changed(); });
  row.append(toggle, title, operator, value); return row;
}

function renderPosition(condition) {
  const row = document.createElement('div'); row.className = 'position-row toggle-row';
  const toggle = switchToggle(condition.enabled); const enabled = toggle.input;
  const title = document.createElement('span'); title.textContent = 'Порядковый номер среди сиблингов';
  const value = textInput(condition.value); value.inputMode = 'numeric'; value.placeholder = 'Например: 1 или 1, 3';
  const hint = document.createElement('span'); hint.className = 'hint'; hint.textContent = 'Несколько номеров — через запятую';
  const refresh = () => { value.disabled = !enabled.checked; row.classList.toggle('off', !enabled.checked); };
  enabled.addEventListener('change', () => { condition.enabled = enabled.checked; refresh(); scheduleUpdate(); });
  value.addEventListener('input', () => { condition.value = value.value; scheduleUpdate(); });
  refresh(); row.append(toggle.element, title, value, hint); return row;
}

function renderAttribute(node, attribute, index) {
  const block = document.createElement('div'); block.className = 'attribute-block';
  const row = document.createElement('div'); row.className = `condition toggle-row${attribute.name.value.trim().toLowerCase() === 'class' ? ' class-row' : ''}`;
  const toggle = switchToggle(attribute.enabled); const enabled = toggle.input;
  const name = textInput(attribute.name.value); const nameMode = select([['exact', 'имя: точно'], ['prefix', 'имя: начинается с'], ['regex', 'имя: рег. выражение']], attribute.name.mode);
  const value = textInput(attribute.value.value); const valueMode = select([['exact', 'значение: точно'], ['prefix', 'значение: начинается с'], ['suffix', 'значение: заканчивается на'], ['contains', 'значение: содержит'], ['regex', 'значение: рег. выражение'], ['ignore', 'значение не важно']], attribute.value.mode);
  const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'icon-btn danger remove'; remove.textContent = '×';
  const refreshDisabled = () => { const disabled = !enabled.checked; name.disabled = nameMode.disabled = valueMode.disabled = disabled; value.disabled = disabled || valueMode.value === 'ignore'; row.classList.toggle('off', disabled); };
  enabled.addEventListener('change', () => { attribute.enabled = enabled.checked; refreshDisabled(); scheduleUpdate(); });
  nameMode.addEventListener('change', () => { attribute.name.mode = nameMode.value; scheduleUpdate(); }); name.addEventListener('input', () => { attribute.name.value = name.value; scheduleUpdate(); }); name.addEventListener('blur', () => scheduleRender());
  valueMode.addEventListener('change', () => {
    attribute.value.mode = valueMode.value;
    if (valueMode.value === 'ignore') { attribute.value.value = ''; value.value = ''; }
    refreshDisabled(); scheduleUpdate();
  }); value.addEventListener('input', () => { attribute.value.value = value.value; scheduleUpdate(); });
  remove.addEventListener('click', () => { node.attributes.splice(index, 1); scheduleRender(); }); refreshDisabled(); row.append(toggle.element, name, nameMode, value, valueMode, remove);
  if (attribute.name.value.trim().toLowerCase() === 'class') { const classExtra = document.createElement('div'); classExtra.className = 'class-extra'; classExtra.append(renderCount(node.classCount, 'Количество классов в этом class', () => scheduleUpdate())); row.append(classExtra); }
  block.append(row);
  return block;
}

function renderTextCondition(condition, label, changed) {
  const row = document.createElement('div'); row.className = 'text-grid toggle-row';
  const toggle = switchToggle(condition.enabled); const enabled = toggle.input;
  const title = document.createElement('span'); title.className = 'label'; title.textContent = label;
  const value = textInput(condition.value); const mode = select([['exact', 'точное совпадение'], ['prefix', 'начинается с'], ['suffix', 'заканчивается на'], ['contains', 'содержит'], ['regex', 'рег. выражение'], ['ignore', 'не учитывать']], condition.mode);
  const caseLabel = document.createElement('label'); caseLabel.className = 'case'; const insensitive = checkbox(condition.ignoreCase); caseLabel.append(insensitive, document.createTextNode(' Без учёта регистра'));
  const refreshDisabled = () => { mode.disabled = value.disabled = insensitive.disabled = !enabled.checked; if (mode.value === 'ignore') value.disabled = true; row.classList.toggle('off', !enabled.checked); };
  enabled.addEventListener('change', () => { condition.enabled = enabled.checked; refreshDisabled(); changed(); }); mode.addEventListener('change', () => { condition.mode = mode.value; refreshDisabled(); changed(); }); value.addEventListener('input', () => { condition.value = value.value; changed(); }); insensitive.addEventListener('change', () => { condition.ignoreCase = insensitive.checked; changed(); }); refreshDisabled(); row.append(toggle.element, title, value, mode, caseLabel); return row;
}

function switchToggle(checked) {
  const element = document.createElement('label'); element.className = 'toggle';
  const input = checkbox(checked); const visual = document.createElement('i'); element.append(input, visual); return { element, input };
}

function allRelations(node) { return (node.relationGroups || []).flatMap(group => group.entries || []); }
function relationGroup(node) { node.relationGroups ||= []; return node.relationGroups[0] ||= { mode: 'all', entries: [] }; }
function addRelation(node, relation) { relationGroup(node).entries.push(relation); }
function deleteRelation(node, relation) { for (const group of node.relationGroups || []) { const index = group.entries?.indexOf(relation) ?? -1; if (index >= 0) group.entries.splice(index, 1); } }
function newRelation(kind, element = null) {
  const relation = { kind, allowAbsent: false, node: element ? nodeFromElement(element) : emptyNode() };
  // A selected related element is already completely described by its header.
  // Keep its full editable form available, but fold it initially so the tree
  // stays readable like the approved layout.  A manually created relation is
  // intentionally left open: it needs an HTML fragment first.
  if (element) {
    relationSources.set(relation, element);
    collapsedNodes.set(relation.node, true);
  }
  return relation;
}
function relationName(kind) {
  return ({ child: 'Непосредственный дочерний элемент', descendant: 'Потомок внутри элемента', 'ancestor-nearest': 'Непосредственный родительский элемент', 'ancestor-any': 'Предок выше', sibling: 'Соседний элемент' })[kind];
}
function candidatesFor(source, kind) {
  if (!source) return [];
  // DOMParser places the pasted root into an artificial <body>. It is not the
  // user’s real parent, so never offer that fake ancestor as a suggestion.
  if (source === sourceElement && kind.startsWith('ancestor')) return [];
  if (kind === 'child') return [...source.children];
  if (kind === 'descendant') return [...source.querySelectorAll('*')];
  if (kind === 'sibling') return [...(source.parentElement?.children || [])].filter(item => item !== source);
  if (kind === 'ancestor-nearest') return source.parentElement ? [source.parentElement] : [];
  if (kind === 'ancestor-any') { const result = []; for (let item = source.parentElement; item; item = item.parentElement) result.push(item); return result; }
  return [];
}
function elementPreview(element) {
  const compact = normalizeText(element.outerHTML).replace(/\s+/g, ' ');
  return compact.length > 30 ? `${compact.slice(0, 30)}…` : compact;
}

function renderEnvironment(node, source, hideParentRelations = false) {
  const sectionElement = section('Элементы вокруг'); sectionElement.classList.add('relations');
  const relations = allRelations(node);
  const parents = relations.filter(item => item.kind.startsWith('ancestor'));
  const others = relations.filter(item => !item.kind.startsWith('ancestor'));
  if (!hideParentRelations) parents.forEach(relation => sectionElement.append(renderRelation(node, relation, relationSources.get(relation))));
  const add = document.createElement('button'); add.type = 'button'; add.className = 'add-environment'; add.textContent = 'Добавить потомка или сиблинга';
  const picker = document.createElement('div'); picker.className = 'environment-picker'; picker.hidden = true;
  add.addEventListener('click', () => { picker.hidden = !picker.hidden; if (!picker.hidden) renderRelationKinds(picker, node, source, [['child', 'Непосредственный дочерний элемент'], ['descendant', 'Просто потомок'], ['sibling', 'Сиблинг']]); });
  sectionElement.append(add, picker);
  others.forEach(relation => sectionElement.append(renderRelation(node, relation, relationSources.get(relation))));
  return sectionElement;
}

function renderRootAdder(owner, source, position) {
  const wrap = document.createElement('div'); wrap.className = 'relation-actions';
  const menuWrap = document.createElement('div'); menuWrap.className = 'menu-wrap';
  const button = document.createElement('button'); button.type = 'button'; button.className = 'btn small menu-trigger';
  button.textContent = position === 'ancestor' ? '↑ Добавить предка' : '↓ Добавить потомка или сиблинга';
  const picker = document.createElement('div'); picker.className = 'menu';
  const kinds = position === 'ancestor'
    ? [['ancestor-nearest', 'Непосредственный родитель'], ['ancestor-any', 'Просто предок']]
    : [['child', 'Непосредственный дочерний элемент'], ['descendant', 'Просто потомок'], ['sibling', 'Сиблинг']];
  button.addEventListener('click', () => {
    const opening = !picker.classList.contains('open');
    document.querySelectorAll('.menu.open').forEach(menu => menu.classList.remove('open'));
    if (opening) { renderRelationKinds(picker, owner, source, kinds); picker.classList.add('open'); }
  });
  menuWrap.append(button, picker); wrap.append(menuWrap); return wrap;
}

function renderRelationKinds(container, owner, source, allowedKinds = null) {
  container.innerHTML = '';
  const intro = document.createElement('p'); intro.className = 'picker-title'; intro.textContent = 'Где находится этот элемент относительно текущего?';
  const kinds = allowedKinds || [['ancestor-nearest', 'Непосредственно выше (родитель)'], ['ancestor-any', 'Где-то выше (предок)'], ['child', 'Непосредственно внутри (ребёнок)'], ['descendant', 'Где-то внутри (потомок)'], ['sibling', 'Рядом (соседний)']];
  const choices = document.createElement('div'); choices.className = 'kind-choices';
  kinds.forEach(([kind, label]) => { const button = smallButton(label); button.addEventListener('click', () => renderCandidateChoices(container, owner, source, kind, kinds)); choices.append(button); });
  container.append(intro, choices);
}

function renderCandidateChoices(container, owner, source, kind, allowedKinds = null) {
  container.innerHTML = '';
  const intro = document.createElement('p'); intro.className = 'picker-title'; intro.textContent = `${relationName(kind)} — выберите вариант:`;
  const candidates = candidatesFor(source, kind).slice(0, 5);
  const choices = document.createElement('div'); choices.className = 'candidate-choices';
  candidates.forEach(candidate => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'candidate-choice'; button.textContent = elementPreview(candidate);
    button.title = normalizeText(candidate.outerHTML);
    button.addEventListener('click', () => { addRelation(owner, newRelation(kind, candidate)); scheduleRender(); }); choices.append(button);
  });
  const manual = smallButton('Добавить вручную'); manual.addEventListener('click', () => { addRelation(owner, newRelation(kind)); scheduleRender(); });
  const back = smallButton('← Назад'); back.addEventListener('click', () => renderRelationKinds(container, owner, source, allowedKinds));
  if (!candidates.length) choices.append(note('В этом фрагменте HTML нет подходящих вариантов. Можно добавить элемент вручную.'));
  container.append(intro, choices, manual, back);
}

function renderRelation(owner, relation, source) {
  const entry = document.createElement('div'); entry.className = `node relation-entry relation-${relation.kind}${owner === model?.root ? ' root-relation' : ''}`;
  const caption = renderRelationCaption(relation.kind);
  const absentLabel = document.createElement('label'); absentLabel.className = 'absent-toggle'; const absent = checkbox(relation.allowAbsent); absentLabel.append(absent, document.createTextNode(' Допускается отсутствие'));
  const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'icon-btn danger'; remove.textContent = '×'; remove.title = 'Удалить элемент'; absent.addEventListener('change', () => { relation.allowAbsent = absent.checked; scheduleUpdate(); }); remove.addEventListener('click', () => { deleteRelation(owner, relation); scheduleRender(); });
  entry.append(caption);

  const nested = document.createElement('div'); nested.className = 'nested';
  const card = renderNode(relation.node, relationName(relation.kind), source, false, true, true, relation.kind.startsWith('ancestor'), true, element => { relationSources.set(relation, element); });
  // The mockup keeps relation-specific controls in the card header.  Keeping
  // them there also makes it unambiguous which card "absence" belongs to.
  const head = card.querySelector('.card-head');
  const collapse = head.querySelector('.collapse');
  head.insertBefore(absentLabel, collapse);
  head.insertBefore(remove, collapse);
  nested.append(card);
  entry.append(nested);
  const lowerTree = renderLowerTree(relation.node, source, relationName(relation.kind));
  if (lowerTree) entry.append(lowerTree);
  return entry;
}

function parseHtmlElement(html) { const documentFromHtml = new DOMParser().parseFromString(String(html || ''), 'text/html'); return documentFromHtml.body.firstElementChild; }

function scheduleRender() { render(); scheduleCount(); }
function scheduleUpdate() { updatePreview(); scheduleCount(); }

function summary(node, depth = 0) {
  const attributes = (node.attributes || []).filter(item => item.enabled).map(item => item.name.value || '?').join(', ');
  const pieces = [`${'  '.repeat(depth)}<${node.tag || '*'}>${attributes ? ` — ${attributes}` : ''}`];
  for (const group of node.relationGroups || []) for (const relation of group.entries || []) pieces.push(...summary(relation.node, depth + 1));
  return pieces;
}

function quoteCss(value) { return JSON.stringify(String(value || '')); }

function cssAttribute(attribute) {
  if (!attribute.enabled || !attribute.name?.enabled) return '';
  const name = attribute.name;
  const value = attribute.value || newStringCondition('', false);
  if (name.mode === 'exact') {
    const escapedName = name.value || '*';
    if (!value.enabled || value.mode === 'ignore') return `[${escapedName}]`;
    const operator = ({ exact: '=', prefix: '^=', suffix: '$=', contains: '*=' })[value.mode];
    return operator ? `[${escapedName}${operator}${quoteCss(value.value)}]` : `:attr(${quoteCss(escapedName)},/${value.value || ''}/)`;
  }
  const nameExpression = name.mode === 'prefix' ? `${quoteCss(name.value)}*` : `/${name.value || ''}/`;
  if (!value.enabled || value.mode === 'ignore') return `:attr-name(${nameExpression})`;
  return `:attr(${nameExpression}, ${quoteCss(value.value)})`;
}

function nodeRule(node) {
  let value = node.tag || '*';
  value += (node.attributes || []).map(cssAttribute).join('');
  if (node.attributeCount?.enabled) value += `:attr-count(${node.attributeCount.operator}${node.attributeCount.value})`;
  if (node.classCount?.enabled) value += `:class-count(${node.classCount.operator}${node.classCount.value})`;
  if (node.siblingPosition?.enabled && node.siblingPosition.value) value += `:sibling-position(${node.siblingPosition.value})`;
  const appendText = (condition, pseudo) => {
    if (!condition?.enabled || condition.mode === 'ignore') return;
    const suffix = ({ exact: '', prefix: '-starts', suffix: '-ends', contains: '-contains', regex: '-matches' })[condition.mode] || '';
    value += `:${pseudo}${suffix}(${quoteCss(condition.value)})`;
  };
  appendText(node.ownText, 'own-text');
  appendText(node.text, 'text');
  return value;
}

function selectorLikeRule(node) {
  let value = nodeRule(node);
  const relations = allRelations(node);
  for (const relation of relations.filter(item => item.kind.startsWith('ancestor'))) {
    const parent = selectorLikeRule(relation.node);
    value = `${parent}${relation.kind === 'ancestor-nearest' ? ' > ' : ' '}${value}`;
  }
  for (const relation of relations.filter(item => item.kind === 'child' || item.kind === 'descendant')) {
    value += `:has(${relation.kind === 'child' ? '> ' : ''}${selectorLikeRule(relation.node)})`;
  }
  for (const relation of relations.filter(item => item.kind === 'sibling')) value += `:has(~ ${selectorLikeRule(relation.node)})`;
  return value;
}

function comparisonLabel(operator) { return ({ '=': 'ровно', '>=': 'не менее', '<=': 'не более' })[operator] || operator; }
function stringModeLabel(mode) { return ({ exact: 'равно', prefix: 'начинается с', suffix: 'заканчивается на', contains: 'содержит', regex: 'соответствует регулярному выражению' })[mode] || mode; }
function nameModeLabel(mode) { return ({ exact: '', prefix: 'Имя начинается с', regex: 'Имя соответствует регулярному выражению' })[mode] || mode; }
function relationRole(kind) { return ({ child: 'Дочерний элемент', descendant: 'Потомок', 'ancestor-nearest': 'Родитель', 'ancestor-any': 'Предок', sibling: 'Сиблинг' })[kind] || 'Связанный элемент'; }
function relationDescription(kind) { return ({ child: 'непосредственно внутри родительского элемента', descendant: 'внутри родительского элемента на любом уровне', 'ancestor-nearest': 'непосредственный родитель', 'ancestor-any': 'предок на любом уровне выше', sibling: 'на одном уровне с исходным элементом' })[kind] || kind; }

function structuredRuleDescription(ruleModel) {
  const fragment = document.createDocumentFragment();
  const appendNode = (node, role, depth, relation = null) => {
    const block = document.createElement('section'); block.className = 'summary-node'; block.style.setProperty('--summary-depth', depth);
    const heading = document.createElement('div'); heading.className = 'summary-node-heading';
    const roleElement = document.createElement('strong'); roleElement.textContent = role;
    const tag = document.createElement('code'); tag.textContent = node.tag || '*';
    heading.append(roleElement, tag); block.append(heading);
    const list = document.createElement('ul');
    const item = (label, value) => { const li = document.createElement('li'); const name = document.createElement('span'); name.textContent = `${label}: `; const detail = document.createElement('b'); detail.textContent = value; li.append(name, detail); list.append(li); };
    if (relation) {
      item('Связь', relationDescription(relation.kind));
      if (relation.allowAbsent) item('Отсутствие', 'допускается');
    }
    if (node.attributeCount?.enabled) item('Количество атрибутов', `${comparisonLabel(node.attributeCount.operator)} ${node.attributeCount.value}`);
    if (node.classCount?.enabled) item('Количество классов', `${comparisonLabel(node.classCount.operator)} ${node.classCount.value}`);
    if (node.siblingPosition?.enabled) item('Позиция среди сиблингов', node.siblingPosition.value || 'не указана');
    for (const attribute of node.attributes || []) {
      if (!attribute.enabled || !attribute.name?.enabled) continue;
      const name = attribute.name.value || 'атрибут';
      const namePrefix = attribute.name.mode === 'exact' ? name : `${nameModeLabel(attribute.name.mode)} «${name}»`;
      const value = attribute.value;
      item('Атрибут', !value?.enabled || value.mode === 'ignore' ? `${namePrefix} — значение не важно` : `${namePrefix} ${stringModeLabel(value.mode)} «${value.value}»`);
    }
    const appendText = (condition, label) => {
      if (!condition?.enabled || condition.mode === 'ignore') return;
      item(label, `${stringModeLabel(condition.mode)} «${condition.value}»${condition.ignoreCase ? ', без учёта регистра' : ''}`);
    };
    appendText(node.ownText, 'Собственный текст'); appendText(node.text, 'Любой текст внутри');
    for (const group of node.relationGroups || []) {
      if ((group.entries || []).length > 1 || group.mode === 'any') item('Связанные элементы', group.mode === 'any' ? 'достаточно любого из перечисленных' : 'обязательны все перечисленные');
    }
    if (!list.children.length) item('Условия', 'не заданы');
    block.append(list); fragment.append(block);
    for (const group of node.relationGroups || []) for (const entry of group.entries || []) appendNode(entry.node, relationRole(entry.kind), depth + 1, entry);
  };
  appendNode(ruleModel.root, 'Блокируемый элемент', 0);
  if (ruleModel.resultPositions?.enabled) {
    const selection = document.createElement('div'); selection.className = 'summary-selection'; selection.textContent = `Блокировать совпадения №: ${ruleModel.resultPositions.value}`; fragment.append(selection);
  }
  return fragment;
}

function updatePreview() {
  if (!model) { ruleCode.textContent = '—'; ruleSummary.textContent = 'Сначала вставьте HTML элемента.'; countStatus.textContent = '—'; countDetail.textContent = 'Заполняйте правило'; return; }
  ruleCode.textContent = globalThis.__blockItRuleModel.toDisplaySelector?.(model) || selectorLikeRule(model.root);
  ruleSummary.replaceChildren(structuredRuleDescription(model));
}

function countModelInFrame(ruleModel) {
  const engine = globalThis.__blockItRuleModel;
  if (!engine) return { count: 0, invalid: true };
  try { const result = engine.findWithTotal?.(ruleModel); return result ? { count: result.elements.length, total: result.total, invalid: false } : { count: engine.find(ruleModel).length, total: engine.find(ruleModel).length, invalid: false }; } catch { return { count: 0, total: 0, invalid: true }; }
}

async function recount() {
  if (!model || !sourceTabId) { countStatus.textContent = '—'; countTitle.textContent = 'Совпадения'; countDetail.textContent = model ? 'Нет исходной вкладки для проверки' : 'Заполняйте правило'; return null; }
  const request = ++countRequest; countStatus.textContent = '…'; countTitle.textContent = 'Идёт проверка'; countDetail.textContent = 'Считаю совпадения…';
  try {
    const results = await chrome.scripting.executeScript({ target: { tabId: sourceTabId, allFrames: true }, world: 'MAIN', func: countModelInFrame, args: [model] });
    if (request !== countRequest) return null;
    if (results.some(item => item.result?.invalid)) { countStatus.textContent = '—'; countTitle.textContent = 'Правило заполнено некорректно'; countDetail.textContent = 'Проверьте отмеченные поля'; countStatus.className = 'count error'; return null; }
    const count = results.reduce((sum, item) => sum + (item.result?.count || 0), 0);
    const total = results.reduce((sum, item) => sum + (item.result?.total ?? item.result?.count ?? 0), 0);
    matchSelection.hidden = total <= 1;
    countStatus.textContent = String(total); countTitle.textContent = total === 1 ? 'Найден ровно один элемент' : `Найдено ${total} элементов`;
    countDetail.textContent = total > 1 && model.resultPositions?.enabled ? `Будет заблокировано: ${count}` : total === 1 ? 'Правило достаточно точное' : 'Можно уточнить условия или выбрать номера';
    countStatus.className = total === 1 ? 'count' : 'count warning'; return count;
  } catch (error) { if (request === countRequest) { countStatus.textContent = '—'; countTitle.textContent = 'Не удалось проверить исходную вкладку'; countDetail.textContent = 'Повторите проверку позже'; countStatus.className = 'count error'; } return null; }
}

function scheduleCount() { clearTimeout(countTimer); countTimer = setTimeout(recount, 300); }

async function parseSource(html) {
  const element = parseHtmlElement(html);
  if (!element) return alert('Не удалось найти HTML-элемент. Вставьте разметку, начинающуюся с тега.');
  sourceElement = element; model = { version: 1, root: nodeFromElement(element), resultPositions: newPosition('', false) }; reloadResult.textContent = ''; render(); scheduleCount();
}

async function checkAfterReload() {
  if (!sourceTabId) { reloadResult.textContent = 'Откройте вкладку сайта правила и заново откройте редактор.'; reloadResult.className = 'reload-result error'; return; }
  const before = editingNeedsReload ? null : await recount(); if (!editingNeedsReload && before === null) return;
  reloadResult.textContent = `${before === null ? 'Правило временно отключено для корректной проверки.' : `До обновления: ${before}`}\nПерезагружаю исходную вкладку…`; reloadResult.className = 'reload-result';
  try {
    const completed = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); reject(new Error('timeout')); }, 20000);
      const listener = (tabId, change) => { if (tabId === sourceTabId && change.status === 'complete') { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); resolve(); } };
      chrome.tabs.onUpdated.addListener(listener);
    });
    await chrome.tabs.reload(sourceTabId);
    await completed;
    await new Promise(resolve => setTimeout(resolve, 2500));
    editingNeedsReload = false;
    const after = await recount(); if (after === null) return;
    reloadResult.textContent = before === null ? `После обновления: ${after}\nТеперь результат учитывает элементы, восстановленные страницей.` : `До обновления: ${before}\nПосле обновления: ${after}\n${before === after ? 'Количество совпадений не изменилось.' : 'Количество изменилось: проверьте динамические признаки.'}`;
    reloadResult.className = before === null || before === after ? 'reload-result' : 'reload-result warning';
  } catch { reloadResult.textContent = 'Не удалось дождаться перезагрузки исходной вкладки.'; reloadResult.className = 'reload-result error'; }
}

function domain(url) { try { const parts = new URL(url).hostname.replace(/^www\./, '').split('.'); return parts.slice(-2).join('.'); } catch { return ''; } }

async function saveRule() {
  if (!sourceTabId) return alert('Для проверки и сохранения откройте вкладку сайта правила, затем заново откройте редактор. BlockIt не открывает сайт автоматически.');
  if (!model) return;
  if (editingNeedsReload && !confirm('Страница ещё не обновлялась: текущее число совпадений может быть неверным, потому что старое правило уже могло скрыть или удалить элементы. Всё равно сохранить изменения?')) return;
  const count = editingNeedsReload ? null : await recount();
  if (!editingNeedsReload && count === null) return;
  if (count === 0 && !confirm('Сейчас правило не находит элементов. Всё равно сохранить?')) return;
  if (count > 1 && !confirm(`Правило находит ${count} элементов. Сохранить его?`)) return;
  const selector = globalThis.__blockItRuleModel.stringify(model); const rule = { id: editingRule?.id || crypto.randomUUID(), selector, displaySelector: ruleCode.textContent, type: 'blockitbuilder', syntaxVersion: globalThis.__blockItSelectorCore?.SYNTAX_VERSION || 1, builderModel: model, mode: ruleMode, enabled: editingRule?.enabled ?? true, domain: domain((await chrome.tabs.get(sourceTabId)).url) };
  const { rules = [] } = await chrome.storage.local.get(['rules']);
  const editingIndex = editingRule ? rules.findIndex(item => editingRule.id ? item.id === editingRule.id : item.selector === editingRule.selector && (item.domain || '') === editingRule.domain) : -1;
  if (rules.some((item, index) => index !== editingIndex && item.selector === selector && item.domain === rule.domain)) return alert('Такое правило уже есть.');
  if (editingIndex >= 0) rules[editingIndex] = rule; else rules.push(rule);
  await chrome.storage.local.set({ rules });
  await releaseEditedRule(rule.id);
  editingRule = { id: rule.id, selector: rule.selector, domain: rule.domain || '', enabled: rule.enabled !== false, mode: rule.mode };
  document.getElementById('saveRule').querySelector('span').textContent = 'Сохранить изменения';
  countDetail.textContent = editingIndex >= 0 ? 'Изменения сохранены и применены.' : 'Правило сохранено и применено.';
}

async function releaseEditedRule(ruleId = editingRule?.id) {
  if (!sourceTabId || !ruleId) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: sourceTabId }, world: 'ISOLATED', func: id => { try { const ids = JSON.parse(sessionStorage.getItem('blockit-editor-excluded-rules') || '[]').filter(item => item !== id); if (ids.length) sessionStorage.setItem('blockit-editor-excluded-rules', JSON.stringify(ids)); else sessionStorage.removeItem('blockit-editor-excluded-rules'); } catch {} }, args: [ruleId] });
    await chrome.tabs.sendMessage(sourceTabId, { action: 'blockit-editor-resume' });
  } catch {}
}

document.getElementById('reloadCheck').addEventListener('click', checkAfterReload);
document.getElementById('checkNow').addEventListener('click', () => editingNeedsReload ? alert('Сначала обновите страницу: правило уже могло удалить подходящие элементы, поэтому текущий подсчёт будет неточным.') : recount());
document.getElementById('saveRule').addEventListener('click', saveRule);
builderModeRadios.forEach(radio => radio.addEventListener('change', () => { if (radio.checked) ruleMode = radio.value; }));
document.getElementById('copyRule').addEventListener('click', async () => { if (ruleCode.textContent && ruleCode.textContent !== '—') await navigator.clipboard.writeText(ruleCode.textContent); });
document.getElementById('openFeedback').addEventListener('click', async () => {
  const draft = {
    source: 'rule-builder',
    sourceLabel: 'Конструктор правила',
    tabId: sourceTabId,
    pageUrl: sourceUrl,
    editingRule,
    rule: {
      displaySelector: ruleCode.textContent === '—' ? '' : ruleCode.textContent,
      model,
      matchCount: countStatus.textContent,
      matchStatus: countTitle.textContent,
      matchDetail: countDetail.textContent
    },
    createdAt: Date.now()
  };
  await chrome.storage.session.set({ feedbackDraft: draft });
  await chrome.tabs.create({ url: chrome.runtime.getURL('feedback.html') });
});
matchPositions.addEventListener('input', () => { model.resultPositions ||= newPosition('', false); model.resultPositions.value = matchPositions.value; model.resultPositions.enabled = !!matchPositions.value.trim(); updatePreview(); scheduleCount(); });
(async () => {
  const { ruleBuilderDraft } = await chrome.storage.session.get(['ruleBuilderDraft']);
  if (ruleBuilderDraft) {
    sourceTabId = ruleBuilderDraft.sourceTabId || null;
    sourceUrl = ruleBuilderDraft.sourceUrl || '';
    await chrome.storage.session.remove('ruleBuilderDraft');
    if (ruleBuilderDraft.model?.root) {
      model = ruleBuilderDraft.model;
      editingRule = ruleBuilderDraft.editingRule || null;
      ruleMode = editingRule?.mode === 'hide' ? 'hide' : 'remove';
      builderModeRadios.forEach(radio => { radio.checked = radio.value === ruleMode; });
      editingNeedsReload = !!(editingRule && sourceTabId);
      const reloadButton = document.getElementById('reloadCheck');
      reloadButton.title = sourceTabId ? `Страница ${sourceUrl || editingRule?.domain || 'сайта'} будет перезагружена. Редактируемое правило временно не применяется.` : `Нет открытой вкладки сайта ${editingRule?.domain || ''}. BlockIt не будет открывать её автоматически.`;
      document.getElementById('saveRule').querySelector('span').textContent = editingRule ? 'Сохранить изменения' : 'Создать правило';
      render(); scheduleCount(); return;
    }
    if (ruleBuilderDraft.html) return parseSource(ruleBuilderDraft.html);
  }
  model = { version: 1, root: emptyNode(), resultPositions: newPosition('', false) };
  render();
})();
