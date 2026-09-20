const MAX_FILES = 5;
const MAX_FILE_BYTES = 30 * 1024 * 1024;
const MAX_TOTAL_BYTES = 70 * 1024 * 1024;
const EMAIL_DELIVERY_BYTES = 15 * 1024 * 1024;
const SCREENSHOT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const FEEDBACK_ENDPOINT = 'https://formacode.dev/api/product-feedback';
const PRODUCT_ID = 'blockit';
let attachments = [];
let context = {};
let reportCreatedAt = new Date().toISOString();
let pendingRequestId = null;
let pendingFingerprint = null;
const tr = (source, values) => globalThis.BlockItUI18n?.t(source, values) || source;

const $ = selector => document.querySelector(selector);
const formatBytes = bytes => bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} ${tr('КиБ')}` : `${(bytes / 1024 / 1024).toFixed(2)} ${tr('МиБ')}`;
const attachmentBytes = () => attachments.reduce((sum, item) => sum + item.file.size, 0);

function safeDomain(rawUrl) {
  try { return new URL(rawUrl).hostname || ''; } catch { return ''; }
}

function technicalData() {
  const manifest = chrome.runtime.getManifest();
  const pageUrl = context.pageUrl || '';
  const base = {
    reportVersion: 1,
    createdAt: reportCreatedAt,
    extension: { name: manifest.name, version: manifest.version },
    environment: { userAgent: navigator.userAgent, platform: navigator.platform || '' },
    source: context.source || 'unknown',
    sourceLabel: context.sourceLabel || 'BlockIt',
    page: {
      domain: safeDomain(pageUrl),
      url: $('#includeFullUrl').checked ? pageUrl : undefined
    }
  };
  if (!$('#includeTechnical').checked) return {
    reportVersion: base.reportVersion,
    createdAt: base.createdAt,
    extension: base.extension,
    source: base.source,
    page: base.page
  };
  if (context.source === 'rule-builder') {
    base.rule = context.rule || null;
    base.editingRule = context.editingRule || null;
  } else {
    base.rules = context.rules || [];
  }
  return base;
}

function updateTechnicalPreview() {
  $('#technicalPreview').textContent = JSON.stringify(technicalData(), null, 2);
}

function showFileError(message = '') {
  const element = $('#fileError');
  element.textContent = message;
  element.hidden = !message;
}

function revokeAttachment(item) {
  if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
}

function renderAttachments() {
  const list = $('#attachmentList');
  list.replaceChildren();
  const total = attachmentBytes();
  $('#fileCount').textContent = attachments.length ? tr('{count} из {max} файлов', { count: attachments.length, max: MAX_FILES }) : tr('Файлы не выбраны');
  $('#fileSize').textContent = tr('{size} из 70 МиБ', { size: formatBytes(total) });
  $('#deliveryNotice').hidden = total <= EMAIL_DELIVERY_BYTES;
  attachments.forEach((item, index) => {
    const row = document.createElement('div'); row.className = 'attachment';
    const image = document.createElement('img'); image.src = item.previewUrl; image.alt = '';
    const info = document.createElement('div');
    const name = document.createElement('strong'); name.textContent = item.file.name;
    const size = document.createElement('small'); size.textContent = `${formatBytes(item.file.size)} · ${item.file.type || tr('изображение')}`;
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = tr('Удалить');
    remove.addEventListener('click', () => { revokeAttachment(item); attachments.splice(index, 1); showFileError(); renderAttachments(); });
    info.append(name, size); row.append(image, info, remove); list.append(row);
  });
}

function addFiles(files) {
  showFileError();
  for (const file of files) {
    if (!SCREENSHOT_TYPES.has(file.type.toLowerCase())) { showFileError(tr('«{name}» имеет неподдерживаемый формат. Используйте PNG, JPEG или WebP.', { name: file.name })); continue; }
    if (attachments.length >= MAX_FILES) { showFileError(tr('Можно прикрепить не более 5 изображений.')); break; }
    if (file.size > MAX_FILE_BYTES) { showFileError(tr('«{name}» больше допустимых 30 МиБ.', { name: file.name })); continue; }
    if (attachmentBytes() + file.size > MAX_TOTAL_BYTES) { showFileError(tr('Общий размер вложений не должен превышать 70 МиБ.')); continue; }
    attachments.push({ file, previewUrl: URL.createObjectURL(file) });
  }
  renderAttachments();
}

function showFormMessage(message, type = 'success') {
  const element = $('#formMessage'); element.textContent = message; element.className = `message${type === 'success' ? '' : ` ${type}`}`; element.hidden = false;
}

function setContactError(message = '') {
  const element = $('#contactError'); element.textContent = message; element.hidden = !message;
}

function parseContact(raw) {
  const value = raw.trim();
  if (!value) return null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return { method: 'email', value };
  if (/^@[a-zA-Z0-9_]{3,32}$/.test(value) || /^https:\/\/t\.me\/[a-zA-Z0-9_]{3,32}\/?$/i.test(value)) return { method: 'telegram', value };
  return false;
}

function updateContactType() {
  const contact = parseContact($('#contactValue').value);
  const badge = $('#contactType');
  badge.className = 'contact-type';
  if (contact?.method === 'email') badge.textContent = 'Email';
  else if (contact?.method === 'telegram') badge.textContent = 'Telegram';
  else { badge.classList.add(contact === false ? 'invalid' : 'neutral'); badge.textContent = contact === false ? tr('Не распознано') : tr('Email или Telegram'); }
  setContactError();
}

function diagnosticFields() {
  const report = technicalData();
  const fields = {
    extension_version: String(report.extension.version),
    source: String(report.sourceLabel || report.source).slice(0, 1000),
    page_domain: String(report.page.domain).slice(0, 1000)
  };
  if ($('#includeTechnical').checked) {
    fields.browser = String(navigator.userAgent).slice(0, 1000);
    fields.os = String(navigator.platform || '').slice(0, 1000);
  }
  if ($('#includeFullUrl').checked && report.page.url) fields.page_url = report.page.url.slice(0, 1000);
  return fields;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(tr('Не удалось прочитать файл «{name}».', { name: file.name })));
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] || '');
    reader.readAsDataURL(file);
  });
}

function reportFingerprint(type, contact) {
  const diagnostics = technicalData();
  delete diagnostics.createdAt;
  return JSON.stringify({
    type, contact, description: $('#description').value.trim(),
    diagnostics,
    files: attachments.map(({ file }) => [file.name, file.size, file.lastModified, file.type])
  });
}

async function makeAttachments() {
  const files = attachments.map(item => item.file);
  if ($('#includeTechnical').checked) {
    const diagnostics = new File([JSON.stringify(technicalData(), null, 2)], 'blockit-diagnostics.json', { type: 'application/json' });
    if (diagnostics.size > MAX_FILE_BYTES || attachmentBytes() + diagnostics.size > MAX_TOTAL_BYTES) {
      throw new Error(tr('Технические сведения вместе с вложениями превышают допустимый размер.'));
    }
    files.push(diagnostics);
  }
  return Promise.all(files.map(async file => ({
    filename: file.name,
    content_type: file.type,
    content_base64: await fileToBase64(file)
  })));
}

function retryAfterText(response) {
  const value = response.headers.get('Retry-After');
  if (!value) return '';
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return tr(' Повторите попытку через {minutes} мин.', { minutes: Math.max(1, Math.ceil(seconds / 60)) });
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : tr(' Повторите попытку после {time}.', { time: date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) });
}

async function responseError(response) {
  if (response.status === 400) return tr('Сервер отклонил данные формы. Проверьте заполненные поля.');
  if (response.status === 403) return tr('Сервер пока не разрешает обращения из этой сборки расширения.');
  if (response.status === 413) return tr('Сервер отклонил вложения из-за их размера.');
  if (response.status === 429) return tr('Слишком много отправок.{retry}', { retry: retryAfterText(response) });
  if (response.status === 502 || response.status === 503) return tr('Сервис обратной связи временно недоступен. Повторите попытку позже.');
  return tr('Сервер ответил с кодом {status}.', { status: response.status });
}

async function prepareReport(event) {
  event.preventDefault();
  const form = event.currentTarget;
  setContactError();
  $('#telegramContinue').hidden = true;
  const type = new FormData(form).get('problemType');
  if (!type) return showFormMessage(tr('Выберите, что произошло.'), 'error');
  const contact = parseContact($('#contactValue').value);
  if (!contact) {
    setContactError(contact === false ? tr('Введите корректный email, @username или ссылку вида https://t.me/username.') : tr('Укажите контакт для ответа.'));
    return showFormMessage(tr('Проверьте контактные данные.'), 'error');
  }
  if (!$('#privacyConsent').checked) return showFormMessage(tr('Подтвердите согласие с Политикой конфиденциальности.'), 'error');
  const fingerprint = reportFingerprint(type, contact);
  if (!pendingRequestId || pendingFingerprint !== fingerprint) {
    reportCreatedAt = new Date().toISOString();
    pendingRequestId = crypto.randomUUID(); pendingFingerprint = fingerprint;
  }
  const topic = form.querySelector('input[name="problemType"]:checked').closest('label').textContent.trim();
  const description = $('#description').value.trim();
  const button = $('#sendReport');
  button.disabled = true;
  button.textContent = tr('Подготавливаем вложения…');
  try {
    const files = await makeAttachments();
    button.textContent = tr('Отправляем…');
    const response = await fetch(FEEDBACK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request_id: pendingRequestId,
        product_id: PRODUCT_ID,
        contact_method: contact.method,
        contact_value: contact.value,
        topic,
        message: description || tr('Тип проблемы: {topic}. Дополнительное описание не предоставлено.', { topic }),
        fields: diagnosticFields(),
        attachments: files,
        website: ''
      })
    }).catch(error => {
      if (error instanceof TypeError) throw new Error(tr('Не удалось связаться с сервером. Проверьте подключение и повторите попытку.'));
      throw error;
    });
    if (response.status !== 201) throw new Error(await responseError(response));
    let result = {};
    try { result = await response.json(); } catch { /* A 201 response may have no body. */ }
    const delivery = result.email_delivery;
    showFormMessage(delivery === 'skipped_size'
      ? tr('Сообщение отправлено в Telegram. Из-за размера вложений почтовая копия не создавалась.')
      : delivery === 'failed'
        ? tr('Сообщение отправлено в Telegram, но почтовую копию доставить не удалось.')
        : tr('Сообщение отправлено. Спасибо, что помогаете улучшать BlockIt.'),
      delivery && delivery !== 'sent' ? 'warning' : 'success');
    if (contact.method === 'telegram' && /^https:\/\/t\.me\//i.test(result.telegram_start_url || '')) {
      const link = $('#telegramContinue'); link.href = result.telegram_start_url; link.hidden = false;
    }
    form.reset();
    attachments.forEach(revokeAttachment);
    attachments = [];
    pendingRequestId = null; pendingFingerprint = null; reportCreatedAt = new Date().toISOString();
    renderAttachments();
    $('#descriptionCount').textContent = '0';
    updateContactType();
    updateTechnicalPreview();
  } catch (error) {
    showFormMessage(error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = tr('Отправить');
  }
}

async function init() {
  const stored = await chrome.storage.session.get(['feedbackDraft']);
  context = stored.feedbackDraft || {};
  await chrome.storage.session.remove('feedbackDraft');
  const manifest = chrome.runtime.getManifest();
  $('#extensionVersion').textContent = manifest.version;
  $('#pageDomain').textContent = safeDomain(context.pageUrl) || tr('Не определена');
  $('#sourceName').textContent = context.sourceLabel || 'BlockIt';
  $('#sourceLabel').textContent = context.source === 'rule-builder' ? tr('Текущее правило') : tr('Состояние расширения');
  $('#privacyPolicyLink').href = `https://formacode.dev/${globalThis.BlockItUI18n?.isRussian ? 'ru' : 'en'}/blockit/privacy`;
  updateTechnicalPreview();
}

$('#screenshots').addEventListener('change', event => { addFiles([...event.target.files]); event.target.value = ''; });
$('#description').addEventListener('input', event => { $('#descriptionCount').textContent = event.target.value.length; });
$('#contactValue').addEventListener('input', updateContactType);
$('#includeTechnical').addEventListener('change', updateTechnicalPreview);
$('#includeFullUrl').addEventListener('change', updateTechnicalPreview);
$('#closePage').addEventListener('click', () => window.close());
$('#feedbackForm').addEventListener('submit', prepareReport);
window.addEventListener('beforeunload', () => attachments.forEach(revokeAttachment));
renderAttachments();
updateContactType();
init().catch(error => {
  console.warn('[BlockIt] Feedback context:', error);
  showFormMessage(tr('Не удалось загрузить контекст.'), true);
});
