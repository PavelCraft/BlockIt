// ===== Проверка контекста расширения =====
function isExtensionContextValid() {
  try {
    return !!(chrome.runtime && chrome.runtime.id);
  } catch (e) {
    return false;
  }
}

// ===== Применение правил =====
function applyRules() {
  if (!isExtensionContextValid()) {
    console.log('[BlockIt] Контекст расширения невалиден, пропускаем');
    return;
  }
  
  chrome.storage.local.get(['rules'], function(result) {
    if (chrome.runtime.lastError) {
      console.warn('[BlockIt] Ошибка получения правил:', chrome.runtime.lastError.message);
      return;
    }
    
    const rules = result.rules || [];
    rules.forEach(rule => {
      try {
        const elements = document.querySelectorAll(rule.selector);
        const mode = rule.mode || 'hide';
        
        elements.forEach(el => {
          if (mode === 'remove') {
            el.remove();
          } else {
            el.style.setProperty('visibility', 'hidden', 'important');
            el.style.setProperty('pointer-events', 'none', 'important');
          }
        });
      } catch (e) {
        console.debug('[BlockIt] Ошибка правила:', rule.selector, e.message);
      }
    });
  });
}

// ===== Инициализация =====
let observer = null;
let storageListener = null;

function initObserver() {
  // Отключаем старый observer, если он был
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  
  // Создаём новый observer
  observer = new MutationObserver(function() {
    if (isExtensionContextValid()) {
      applyRules();
    } else {
      // Если контекст невалиден — отключаем observer
      observer.disconnect();
      observer = null;
    }
  });
  
  // Начинаем наблюдение, если body существует
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      if (document.body && observer) {
        observer.observe(document.body, { childList: true, subtree: true });
      }
    });
  }
}

function initStorageListener() {
  // Удаляем старый listener, если он был
  if (storageListener) {
    chrome.storage.onChanged.removeListener(storageListener);
    storageListener = null;
  }
  
  // Создаём новый listener
  storageListener = function(changes, namespace) {
    if (namespace === 'local' && changes.rules) {
      if (isExtensionContextValid()) {
        applyRules();
      }
    }
  };
  
  chrome.storage.onChanged.addListener(storageListener);
}

// ===== Очистка ресурсов =====
function cleanup() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (storageListener) {
    chrome.storage.onChanged.removeListener(storageListener);
    storageListener = null;
  }
}

// ===== Основная логика =====
function main() {
  // Применяем правила при загрузке
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      applyRules();
      initObserver();
      initStorageListener();
    });
  } else {
    applyRules();
    initObserver();
    initStorageListener();
  }
}

// Запускаем
main();

// Очистка при выгрузке страницы
window.addEventListener('beforeunload', function() {
  cleanup();
});

// Обработка ошибок при отключении расширения
try {
  chrome.runtime.onSuspend.addListener(function() {
    cleanup();
  });
} catch (e) {
  // Игнорируем, если расширение уже отключено
}