const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createFormHarness(fetch) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', checked: false, hidden: false, textContent: '', className: '',
      addEventListener() {}, replaceChildren() {}, setAttribute() {},
      append() {}, reset() {}
    });
    return elements.get(id);
  };
  element('contactValue').value = 'user@example.com';
  element('privacyConsent').checked = true;
  const form = element('feedbackForm');
  form.querySelector = () => ({ closest: () => ({ textContent: 'Другая проблема' }) });
  const context = {
    document: { querySelector: selector => element(selector.slice(1)) },
    window: { addEventListener() {} },
    navigator: { userAgent: 'Test Browser', platform: 'Test OS' },
    chrome: {
      runtime: { getManifest: () => ({ name: 'BlockIt', version: '1.0.0' }) },
      storage: { session: { get: async () => ({}), remove: async () => {} } }
    },
    FormData: class { get() { return 'other'; } },
    crypto: { randomUUID: () => '550e8400-e29b-41d4-a716-446655440000' },
    fetch,
    URL,
    console
  };
  context.globalThis = context;
  const source = fs.readFileSync(path.join(__dirname, '..', 'feedback.js'), 'utf8');
  vm.runInNewContext(`${source}\nglobalThis.__test = { parseContact, prepareReport };`, context);
  return { element, form, ...context.__test };
}

test('feedback requires a valid contact and explicit consent', async () => {
  let calls = 0;
  const harness = createFormHarness(async () => { calls++; });
  const event = { preventDefault() {}, currentTarget: harness.form };
  harness.element('contactValue').value = 'not-a-contact';
  await harness.prepareReport(event);
  assert.equal(calls, 0);
  assert.match(harness.element('contactError').textContent, /email/);
  harness.element('contactValue').value = '@test_user';
  harness.element('privacyConsent').checked = false;
  await harness.prepareReport(event);
  assert.equal(calls, 0);
  assert.match(harness.element('formMessage').textContent, /согласие/);
});

test('feedback sends the public JSON format and treats only 201 as success', async () => {
  const requests = [];
  const harness = createFormHarness(async (url, options) => {
    requests.push({ url, options });
    return { status: requests.length === 1 ? 200 : 201, headers: { get: () => null }, json: async () => ({ ok: true, email_delivery: 'sent' }) };
  });
  const event = { preventDefault() {}, currentTarget: harness.form };
  await harness.prepareReport(event);
  assert.equal(harness.element('formMessage').className, 'message error');
  await harness.prepareReport(event);
  assert.equal(harness.element('formMessage').className, 'message');
  const first = JSON.parse(requests[0].options.body);
  const second = JSON.parse(requests[1].options.body);
  assert.equal(requests[0].url, 'https://formacode.dev/api/product-feedback');
  assert.equal(requests[0].options.headers['Content-Type'], 'application/json');
  assert.equal(first.product_id, 'blockit');
  assert.equal(first.contact_method, 'email');
  assert.equal(first.contact_value, 'user@example.com');
  assert.equal(first.website, '');
  assert.equal(first.request_id, second.request_id);
  assert.ok(first.message);
});

test('feedback keeps the form reference after the submit event ends', async () => {
  let event;
  const harness = createFormHarness(async () => {
    event.currentTarget = null;
    return { status: 201, headers: { get: () => null }, json: async () => ({ ok: true, email_delivery: 'sent' }) };
  });
  let resets = 0;
  harness.form.reset = () => { resets++; };
  event = { preventDefault() {}, currentTarget: harness.form };
  await harness.prepareReport(event);
  assert.equal(resets, 1);
  assert.equal(harness.element('formMessage').className, 'message');
  assert.match(harness.element('formMessage').textContent, /Сообщение отправлено/);
});
