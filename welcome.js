(() => {
  document.documentElement.lang = chrome.i18n.getUILanguage();
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const message = chrome.i18n.getMessage(element.dataset.i18n);
    if (message) element.textContent = message;
  });
  const title = chrome.i18n.getMessage('welcomeTitle');
  if (title) document.title = title;
  document.getElementById('closeWelcome')?.addEventListener('click', () => window.close());
})();
