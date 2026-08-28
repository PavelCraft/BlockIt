const MAX_FILES = 5;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
// Укажите HTTPS-адрес после развёртывания сервера обратной связи.
const FEEDBACK_ENDPOINT = '';
let attachments = [];
let context = {};

const $ = selector => document.querySelector(selector);
const formatBytes = bytes => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} КБ` : `${(bytes / 1024 / 1024).toFixed(2)} МБ`;

function safeDomain(rawUrl) {
  try { return new URL(rawUrl).hostname || ''; } catch { return ''; }
}

function technicalData() {
  const manifest = chrome.runtime.getManifest();
  const pageUrl = context.pageUrl || '';
  const base = {
    reportVersion: 1,
    createdAt: new Date().toISOString(),
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
  const total = attachments.reduce((sum, item) => sum + item.file.size, 0);
  $('#fileCount').textContent = attachments.length ? `${attachments.length} из ${MAX_FILES} файлов` : 'Файлы не выбраны';
  $('#fileSize').textContent = `${formatBytes(total)} из 10 МБ`;
  attachments.forEach((item, index) => {
    const row = document.createElement('div'); row.className = 'attachment';
    const image = document.createElement('img'); image.src = item.previewUrl; image.alt = '';
    const info = document.createElement('div');
    const name = document.createElement('strong'); name.textContent = item.file.name;
    const size = document.createElement('small'); size.textContent = `${formatBytes(item.file.size)} · ${item.file.type || 'изображение'}`;
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Удалить';
    remove.addEventListener('click', () => { revokeAttachment(item); attachments.splice(index, 1); showFileError(); renderAttachments(); });
    info.append(name, size); row.append(image, info, remove); list.append(row);
  });
}

function addFiles(files) {
  showFileError();
  for (const file of files) {
    if (!file.type.startsWith('image/')) { showFileError(`«${file.name}» не является изображением.`); continue; }
    if (attachments.length >= MAX_FILES) { showFileError('Можно прикрепить не более 5 изображений.'); break; }
    const currentSize = attachments.reduce((sum, item) => sum + item.file.size, 0);
    if (currentSize + file.size > MAX_TOTAL_BYTES) { showFileError('Общий размер изображений не должен превышать 10 МБ.'); continue; }
    attachments.push({ file, previewUrl: URL.createObjectURL(file) });
  }
  renderAttachments();
}

function showFormMessage(message, error = false) {
  const element = $('#formMessage'); element.textContent = message; element.className = `message${error ? ' error' : ''}`; element.hidden = false;
}

async function prepareReport(event) {
  event.preventDefault();
  if (!FEEDBACK_ENDPOINT) return;
  const type = new FormData(event.currentTarget).get('problemType');
  if (!type) return showFormMessage('Выберите, что произошло.', true);
  const email = $('#contactEmail').value.trim();
  if (email && !$('#contactEmail').checkValidity()) return showFormMessage('Проверьте адрес электронной почты.', true);
  const button = $('#sendReport');
  button.disabled = true;
  button.textContent = 'Отправляем…';
  try {
    const body = new FormData();
    body.append('report', new Blob([JSON.stringify({
      problem: { type, description: $('#description').value.trim(), contactEmail: email || undefined },
      diagnostics: technicalData()
    })], { type: 'application/json' }), 'report.json');
    attachments.forEach(({ file }) => body.append('screenshots', file, file.name));
    const response = await fetch(FEEDBACK_ENDPOINT, { method: 'POST', body });
    if (!response.ok) throw new Error(`сервер ответил с кодом ${response.status}`);
    showFormMessage('Сообщение отправлено. Спасибо, что помогаете улучшать BlockIt.');
    event.currentTarget.reset();
    attachments.forEach(revokeAttachment);
    attachments = [];
    renderAttachments();
    $('#descriptionCount').textContent = '0';
  } catch (error) {
    showFormMessage(`Не удалось отправить сообщение: ${error.message}`, true);
  } finally {
    button.disabled = false;
    button.textContent = 'Отправить';
  }
}

async function init() {
  const stored = await chrome.storage.session.get(['feedbackDraft']);
  context = stored.feedbackDraft || {};
  await chrome.storage.session.remove('feedbackDraft');
  const manifest = chrome.runtime.getManifest();
  $('#extensionVersion').textContent = manifest.version;
  $('#pageDomain').textContent = safeDomain(context.pageUrl) || 'Не определена';
  $('#sourceName').textContent = context.sourceLabel || 'BlockIt';
  $('#sourceLabel').textContent = context.source === 'rule-builder' ? 'Текущее правило' : 'Состояние расширения';
  updateTechnicalPreview();
}

$('#screenshots').addEventListener('change', event => { addFiles([...event.target.files]); event.target.value = ''; });
$('#description').addEventListener('input', event => { $('#descriptionCount').textContent = event.target.value.length; });
$('#includeTechnical').addEventListener('change', updateTechnicalPreview);
$('#includeFullUrl').addEventListener('change', updateTechnicalPreview);
$('#closePage').addEventListener('click', () => window.close());
$('#feedbackForm').addEventListener('submit', prepareReport);
window.addEventListener('beforeunload', () => attachments.forEach(revokeAttachment));
init().catch(error => showFormMessage(`Не удалось загрузить контекст: ${error.message}`, true));
