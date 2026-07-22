function applyRules() {
  chrome.storage.local.get(['rules'], function(result) {
    const rules = result.rules || [];
    rules.forEach(rule => {
      try {
        const elements = document.querySelectorAll(rule.selector);
        elements.forEach(el => el.style.display = 'none');
      } catch (e) {
        // Игнорируем невалидные селекторы
      }
    });
  });
}

// Применяем правила при загрузке страницы
document.addEventListener('DOMContentLoaded', applyRules);

// Слушаем изменения в хранилище
chrome.storage.onChanged.addListener(function(changes, namespace) {
  if (namespace === 'local' && changes.rules) {
    applyRules();
  }
});

// Также применяем при динамических изменениях страницы (для SPA)
const observer = new MutationObserver(function() {
  applyRules();
});
observer.observe(document.body, { childList: true, subtree: true });