// ============================================================
//  BLOCKIT — REDIRECT SCRIPT
//  Detects browser language and redirects to the appropriate
//  version of the instruction page
// ============================================================

(function() {
    'use strict';

    // ============================================================
    //  1. CONFIGURATION
    // ============================================================

    // Mapping of language codes to folder names
    const LANGUAGE_MAP = {
        'ru': 'ru',      // Russian
        'en': 'en',      // English
        'fr': 'fr',      // French
        'es': 'es',      // Spanish
        'pt': 'pt',      // Portuguese
        'de': 'de',      // German
        'zh': 'zh_CN',   // Chinese (simplified)
        'ja': 'ja'       // Japanese
    };

    // Fallback language if browser language is not supported
    const FALLBACK_LANG = 'en';

    // Current page URL
    const currentPath = window.location.pathname;
    const currentDir = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);

    // ============================================================
    //  2. DETECT BROWSER LANGUAGE
    // ============================================================

    function getBrowserLanguage() {
        // Try chrome.i18n first (for extensions)
        if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getUILanguage) {
            return chrome.i18n.getUILanguage();
        }

        // Fallback to navigator.language
        if (navigator.language) {
            return navigator.language;
        }

        // Last resort
        return 'en';
    }

    function getLanguageCode(lang) {
        // Extract primary language code (e.g., 'ru-RU' → 'ru')
        const primary = lang.split('-')[0].toLowerCase();

        // Check if we have a mapping for this language
        if (LANGUAGE_MAP[primary]) {
            return LANGUAGE_MAP[primary];
        }

        // Check if we have a mapping for the full code (e.g., 'zh-CN')
        if (LANGUAGE_MAP[lang]) {
            return LANGUAGE_MAP[lang];
        }

        // Not supported → fallback
        return FALLBACK_LANG;
    }

    // ============================================================
    //  3. REDIRECT LOGIC
    // ============================================================

    function redirect() {
        const browserLang = getBrowserLanguage();
        const targetFolder = getLanguageCode(browserLang);

        // Build target URL
        const targetUrl = currentDir + targetFolder + '/instruction.html';

        // Check if we're already on the target page
        const currentUrl = window.location.href;
        if (currentUrl.includes('/' + targetFolder + '/instruction.html')) {
            // Already on correct page, do nothing
            return;
        }

        // Redirect
        window.location.href = targetUrl;
    }

    // ============================================================
    //  4. INIT
    // ============================================================

    // Only redirect if not already on a language-specific page
    const isLanguagePage = /\/[a-z]{2}(_[A-Z]{2})?\/instruction\.html/.test(window.location.pathname);
    if (!isLanguagePage) {
        redirect();
    }

})();