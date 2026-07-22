// ===== Парсер без регулярок =====
function parseOuterTag(html) {
  let i = 0;
  const len = html.length;
  
  while (i < len && html[i] !== '<') i++;
  if (i >= len) return null;
  i++;
  
  let tag = '';
  while (i < len && html[i] !== ' ' && html[i] !== '>') {
    tag += html[i];
    i++;
  }
  if (!tag) return null;
  
  const attributes = {};
  while (i < len && html[i] !== '>') {
    while (i < len && html[i] === ' ') i++;
    if (i >= len || html[i] === '>') break;
    
    let attrName = '';
    while (i < len && html[i] !== '=' && html[i] !== ' ') {
      attrName += html[i];
      i++;
    }
    if (!attrName) break;
    
    while (i < len && html[i] !== '"' && html[i] !== "'") i++;
    if (i >= len) break;
    const quote = html[i];
    i++;
    
    let attrValue = '';
    while (i < len && html[i] !== quote) {
      attrValue += html[i];
      i++;
    }
    if (i < len) i++;
    
    attributes[attrName] = attrValue;
  }
  
  return { tag, attributes };
}

// ===== Сборка селектора =====
function buildSelector(tag, attributes) {
  let selector = tag;
  for (const [key, value] of Object.entries(attributes)) {
    selector += `[${key}="${value}"]`;
  }
  return selector;
}

// ===== Состояние =====
let currentTag = '';
let currentAttributes = {};

// ===== Отображение атрибутов с кнопками редактирования/удаления =====
function renderAttributes(tag, attributes) {
  const container = document.getElementById('attributesContainer');
  container.innerHTML = '';
  
  const keys = Object.keys(attributes);
  if (keys.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.style.color = '#999';
    emptyMsg.style.fontStyle = 'italic';
    emptyMsg.textContent = 'Нет атрибутов';
    container.appendChild(emptyMsg);
    return;
  }
  
  for (const [key, value] of Object.entries(attributes)) {
    const div = document.createElement('div');
    div.className = 'attr-item';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'attr-name';
    nameSpan.textContent = key;
    
    const valueSpan = document.createElement('span');
    valueSpan.className = 'attr-value';
    valueSpan.textContent = `="${value}"`;
    
    const editBtn = document.createElement('button');
    editBtn.className = 'attr-edit';
    editBtn.textContent = '✏️';
    editBtn.title = 'Редактировать значение атрибута';
    editBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      const newValue = prompt(`Введите новое значение для атрибута "${key}":`, value);
      if (newValue !== null && newValue.trim() !== '') {
        attributes[key] = newValue.trim();
        renderAttributes(tag, attributes);
        updateSelector(tag, attributes);
      }
    });
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'attr-delete';
    deleteBtn.textContent = '🗑️';
    deleteBtn.title = 'Удалить атрибут';
    deleteBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      delete attributes[key];
      renderAttributes(tag, attributes);
      updateSelector(tag, attributes);
    });
    
    div.appendChild(nameSpan);
    div.appendChild(valueSpan);
    div.appendChild(editBtn);
    div.appendChild(deleteBtn);
    container.appendChild(div);
  }
}

// ===== Обновление селектора =====
function updateSelector(tag, attributes) {
  const selector = buildSelector(tag, attributes);
  document.getElementById('selectorInput').value = selector;
  currentTag = tag;
  currentAttributes = attributes;
  
  // Проверяем, сколько элементов найдёт селектор на текущей странице
  checkSelectorCount(selector);
}

// ===== Проверка количества элементов =====
function checkSelectorCount(selector) {
  const countSpan = document.getElementById('elementCount');
  
  if (!selector || selector.trim() === '') {
    countSpan.textContent = '🔍 Введите селектор';
    countSpan.style.color = '#999';
    return;
  }
  
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (!tabs || !tabs[0]) {
      countSpan.textContent = '⚠️ Не удалось определить';
      countSpan.style.color = 'orange';
      return;
    }
    
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: (sel) => {
        try {
          return document.querySelectorAll(sel).length;
        } catch (e) {
          return -1;
        }
      },
      args: [selector]
    }, function(results) {
      if (chrome.runtime.lastError) {
        countSpan.textContent = '⚠️ Ошибка проверки';
        countSpan.style.color = 'orange';
        return;
      }
      
      const count = results && results[0] ? results[0].result : -1;
      
      if (count === -1) {
        countSpan.textContent = '❌ Невалидный селектор';
        countSpan.style.color = 'red';
      } else if (count === 0) {
        countSpan.textContent = '🔍 Найдено элементов: 0 (на текущей странице)';
        countSpan.style.color = 'orange';
      } else if (count === 1) {
        countSpan.textContent = '✅ Найдено элементов: 1 (отлично!)';
        countSpan.style.color = 'green';
      } else {
        countSpan.textContent = `⚠️ Найдено элементов: ${count} (возможно, селектор слишком широкий)`;
        countSpan.style.color = 'red';
      }
    });
  });
}

// ===== Обработка вставленного HTML =====
document.getElementById('parseBtn').addEventListener('click', function() {
  const html = document.getElementById('htmlInput').value.trim();
  if (!html) {
    alert('Вставьте HTML-элемент');
    return;
  }
  
  const parsed = parseOuterTag(html);
  if (!parsed || !parsed.tag) {
    alert('Не удалось распарсить HTML. Убедитесь, что это корректный открывающий тег.');
    return;
  }
  
  currentTag = parsed.tag;
  currentAttributes = parsed.attributes;
  
  document.getElementById('tagDisplay').textContent = currentTag;
  renderAttributes(currentTag, currentAttributes);
  updateSelector(currentTag, currentAttributes);
});

// ===== Добавление нового атрибута вручную =====
document.getElementById('addAttrBtn').addEventListener('click', function() {
  const nameInput = document.getElementById('newAttrName');
  const valueInput = document.getElementById('newAttrValue');
  const name = nameInput.value.trim();
  const value = valueInput.value.trim();
  
  if (!name) {
    alert('Введите имя атрибута');
    return;
  }
  if (!value) {
    alert('Введите значение атрибута');
    return;
  }
  
  // Если тег ещё не задан, ставим div по умолчанию
  if (!currentTag) {
    currentTag = 'div';
    document.getElementById('tagDisplay').textContent = currentTag;
  }
  
  currentAttributes[name] = value;
  renderAttributes(currentTag, currentAttributes);
  updateSelector(currentTag, currentAttributes);
  
  // Очищаем поля и добавляем новое пустое поле
  nameInput.value = '';
  valueInput.value = '';
  nameInput.focus();
  
  // Кнопка "Добавить" снова становится неактивной
  document.getElementById('addAttrBtn').disabled = true;
});

// ===== Включение/отключение кнопки "Добавить атрибут" =====
document.getElementById('newAttrName').addEventListener('input', toggleAddAttrBtn);
document.getElementById('newAttrValue').addEventListener('input', toggleAddAttrBtn);

function toggleAddAttrBtn() {
  const name = document.getElementById('newAttrName').value.trim();
  const value = document.getElementById('newAttrValue').value.trim();
  document.getElementById('addAttrBtn').disabled = !(name && value);
}

// ===== Редактирование селектора вручную =====
document.getElementById('selectorInput').addEventListener('input', function() {
  const manualSelector = this.value.trim();
  if (manualSelector) {
    // Если пользователь вручную редактирует селектор, проверяем его
    checkSelectorCount(manualSelector);
  }
});

// ===== Добавление правила с проверкой =====
document.getElementById('addRule').addEventListener('click', function() {
  const selector = document.getElementById('selectorInput').value.trim();
  if (!selector) {
    alert('Селектор пуст. Напишите или сгенерируйте селектор.');
    return;
  }
  
  // НОВОЕ: Получаем выбранный режим блокировки
  const modeRadios = document.querySelectorAll('input[name="blockMode"]');
  let blockMode = 'hide';
  for (const radio of modeRadios) {
    if (radio.checked) {
      blockMode = radio.value;
      break;
    }
  }
  
  // Проверяем, сколько элементов находит селектор
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (!tabs || !tabs[0]) {
      alert('Не удалось получить доступ к странице');
      return;
    }
    
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: (sel) => {
        try {
          return document.querySelectorAll(sel).length;
        } catch (e) {
          return -1;
        }
      },
      args: [selector]
    }, function(results) {
      if (chrome.runtime.lastError) {
        alert('Ошибка проверки селектора');
        return;
      }
      
      const count = results && results[0] ? results[0].result : -1;
      
      if (count === -1) {
        alert('Невалидный селектор. Проверьте синтаксис.');
        return;
      }
      
      if (count === 0) {
        if (!confirm('Селектор не нашёл элементов на текущей странице. Возможно, вы на другой странице?\n\nВсё равно добавить правило?')) {
          return;
        }
      }
      
      if (count > 1) {
        if (!confirm(`Данный селектор находит ${count} элементов на странице. Возможно, он не вполне специфичный.\n\nДобавить правило?`)) {
          return;
        }
      }
      
      // Сохраняем правило с режимом блокировки
      chrome.storage.local.get(['rules'], function(result) {
        const rules = result.rules || [];
        if (rules.some(rule => rule.selector === selector)) {
          alert('Это правило уже существует');
          return;
        }
        // НОВОЕ: сохраняем не только селектор, но и режим
        rules.push({ 
          selector: selector,
          mode: blockMode  // 'hide' или 'remove'
        });
        chrome.storage.local.set({ rules }, function() {
          document.getElementById('status').textContent = '✅ Правило добавлено!';
          document.getElementById('status').style.color = 'green';
          renderRulesList();
        });
      });
    });
  });
});

// ===== Обновлённое отображение списка правил =====
function renderRulesList() {
  chrome.storage.local.get(['rules'], function(result) {
    let rules = result.rules || [];
    let needsUpdate = false;
    
    // Миграция: добавляем mode='hide' для старых правил
    rules = rules.map(rule => {
      if (!rule.mode) {
        needsUpdate = true;
        return { ...rule, mode: 'hide' };
      }
      return rule;
    });
    
    if (needsUpdate) {
      chrome.storage.local.set({ rules });
    }
    const list = document.getElementById('rulesList');
    list.innerHTML = '';
    if (rules.length === 0) {
      list.innerHTML = '<li>Нет активных правил</li>';
      return;
    }
    rules.forEach((rule, index) => {
      const li = document.createElement('li');
      
      // Отображаем селектор и режим
      const modeLabel = rule.mode === 'remove' ? '🗑️' : '👻';
      li.textContent = `${modeLabel} ${rule.selector}`;
      
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Удалить';
      deleteBtn.addEventListener('click', function() {
        rules.splice(index, 1);
        chrome.storage.local.set({ rules }, renderRulesList);
      });
      li.appendChild(deleteBtn);
      list.appendChild(li);
    });
  });
}

// ===== Обновление подсказки при переключении режима =====
document.querySelectorAll('input[name="blockMode"]').forEach(radio => {
  radio.addEventListener('change', function() {
    const hint = document.getElementById('modeHint');
    if (this.value === 'remove') {
      hint.textContent = 'Элемент будет полностью удалён из HTML. Вёрстка может "поехать", но место освободится.';
    } else {
      hint.textContent = 'Элемент станет невидимым, но сохранит свои размеры. Вёрстка не "поедет".';
    }
  });
});

// ===== Загрузка списка правил при открытии popup =====
document.addEventListener('DOMContentLoaded', function() {
  console.log('[BlockIt] Popup загружен, загружаем правила');
  renderRulesList();
});