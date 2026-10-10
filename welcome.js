(() => {
  document.documentElement.lang = chrome.i18n.getUILanguage();
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const message = chrome.i18n.getMessage(element.dataset.i18n);
    if (message) element.textContent = message;
  });
  const title = chrome.i18n.getMessage('welcomeTitle');
  if (title) document.title = title;
  const language = chrome.i18n.getUILanguage().toLowerCase().replace('_', '-');
  const videoIds = {
    ru: 'ZHKVCtUHlV8',
    en: 'zflyi6XMiEM',
    es: 'odm6gQ6r024',
    fr: '9ijeOyEbEzY',
    de: 'fZs3ojlWAGA',
    pt: 'z3ThzsO0ixw',
    ja: 'N6_wsSausO4',
    'zh-cn': 'slyBGPqhDD8'
  };
  const languageKey = language === 'pt-br' ? 'pt' : language;
  const videoId = videoIds[languageKey] || videoIds[languageKey.split('-')[0]];
  if (videoId) {
    const video = document.getElementById('welcomeVideo');
    const frame = document.getElementById('welcomeVideoFrame');
    if (video && frame) {
      frame.src = `https://www.youtube-nocookie.com/embed/${videoId}`;
      video.hidden = false;
    }
  }
  document.getElementById('closeWelcome')?.addEventListener('click', () => window.close());
})();
