const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const languages = ['ru', 'en', 'de', 'es', 'fr', 'pt', 'ja', 'zh_CN'];
const script = read('blockit-ui-i18n.js').replace(
  '  const uiLanguage =',
  '  globalThis.__sourcePhrases = english; const uiLanguage ='
);

function createContext(language) {
  const document = {
    title: 'BlockIt — Сообщить о проблеме',
    documentElement: { lang: 'ru' },
    createTreeWalker: () => ({ nextNode: () => false }),
    querySelectorAll: () => []
  };
  const context = {
    chrome: { i18n: { getUILanguage: () => language } },
    document,
    NodeFilter: { SHOW_TEXT: 4 }
  };
  context.globalThis = context;
  vm.runInNewContext(read('blockit-ui-i18n-translations.js'), context);
  vm.runInNewContext(script, context);
  return context;
}

test('all Chrome message catalogs have the same keys', () => {
  const catalogs = languages.map(language => JSON.parse(read(`_locales/${language}/messages.json`)));
  const expected = Object.keys(catalogs[0]).sort();
  for (let index = 0; index < catalogs.length; index++) {
    assert.deepEqual(Object.keys(catalogs[index]).sort(), expected, languages[index]);
  }
});

test('every requested Chrome message key exists in all catalogs', () => {
  const catalog = JSON.parse(read('_locales/en/messages.json'));
  for (const file of ['popup.html', 'popup.js', 'import.html', 'import.js', 'welcome.html', 'welcome.js']) {
    const content = read(file);
    const keys = [
      ...[...content.matchAll(/data-i18n(?:-placeholder)?="([^"]+)"/g)].map(match => match[1]),
      ...[...content.matchAll(/getMessage\('([^']+)'\)/g)].map(match => match[1])
    ];
    for (const key of keys) assert.ok(catalog[key], `${file}: ${key}`);
  }
});

test('all additional UI dictionaries are complete and preserve placeholders', () => {
  const { __sourcePhrases: source, BlockItUITranslations: translations } = createContext('ru');
  const phrases = Object.values(source);
  const placeholders = value => [...value.matchAll(/\{[^{}]+\}/g)].map(match => match[0]).sort();
  for (const language of languages.filter(value => !['ru', 'en'].includes(value))) {
    const values = translations[language];
    assert.equal(values.length, phrases.length, language);
    values.forEach((value, index) => {
      assert.ok(value.trim(), `${language}, phrase ${index + 1}`);
      assert.deepEqual(placeholders(value), placeholders(phrases[index]), `${language}, phrase ${index + 1}`);
      assert.doesNotMatch(value, /[А-Яа-яЁё]/, `${language}, phrase ${index + 1}`);
    });
  }
});

test('user-visible Russian strings in extension pages and scripts have translations', () => {
  const source = createContext('ru').__sourcePhrases;
  for (const file of ['contacts.html', 'feedback.html', 'rule-builder.html', 'rule-audit.html']) {
    const html = read(file);
    const text = [...html.matchAll(/>([^<>]*[А-Яа-яЁё][^<>]*)</g)].map(match => match[1].trim()).filter(Boolean);
    const attributes = [...html.matchAll(/(?:title|placeholder|aria-label)="([^"]*[А-Яа-яЁё][^"]*)"/g)].map(match => match[1]);
    for (const phrase of [...text, ...attributes]) assert.ok(source[phrase], `${file}: ${phrase}`);
  }
  for (const file of ['popup.js', 'feedback.js', 'rule-builder.js', 'rule-audit.js']) {
    const literals = [...read(file).matchAll(/'([^'\n]*[А-Яа-яЁё][^'\n]*)'/g)].map(match => match[1]);
    for (const phrase of literals) assert.ok(source[phrase], `${file}: ${phrase}`);
  }
});

test('the interface selects each supported language and interpolates values', () => {
  for (const language of languages) {
    const context = createContext(language === 'zh_CN' ? 'zh-CN' : language);
    const result = context.BlockItUI18n.t('Найдено {count} элементов', { count: 3 });
    assert.ok(result.includes('3'), language);
    assert.ok(!result.includes('{count}'), language);
    assert.equal(context.document.documentElement.lang, language === 'zh_CN' ? 'zh-CN' : language);
  }
});
