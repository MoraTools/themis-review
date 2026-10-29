(function () {
  'use strict';
  const html = document.documentElement;
  const media = matchMedia('(prefers-color-scheme: dark)');
  const prefix = 'suite.themis.';
  function read(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }
  function save(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (_) { /* Preferences still work when storage is blocked. */ }
  }
  function browserLang() {
    for (const language of navigator.languages || [navigator.language]) {
      const match = String(language).toLowerCase().match(/^(en|es)(?:-|$)/);
      if (match) return match[1];
    }
    return 'en';
  }
  const browserTheme = () => media.matches ? 'dark' : 'light';
  const validTheme = value => value === 'dark' || value === 'light';
  const validLang = value => value === 'en' || value === 'es';
  const oldLang = read('themis-lang');
  if (oldLang !== null) {
    if (!validLang(read(prefix + 'lang')) && validLang(oldLang) && oldLang !== browserLang()) {
      save(prefix + 'lang', oldLang);
    }
    save('themis-lang', null);
  }
  let themeChoice = read(prefix + 'theme');
  let langChoice = read(prefix + 'lang');
  if (!validTheme(themeChoice)) themeChoice = null;
  if (!validLang(langChoice)) langChoice = null;
  let transitionTimer;
  function applyTheme(theme, animate) {
    if (animate && html.dataset.theme !== theme) {
      html.classList.add('theme-changing');
      clearTimeout(transitionTimer);
      transitionTimer = setTimeout(() => html.classList.remove('theme-changing'), 160);
    }
    html.dataset.theme = theme;
    for (const meta of document.querySelectorAll('meta[name="theme-color"][data-theme]')) {
      meta.media = meta.dataset.theme === theme ? 'all' : 'not all';
    }
    document.dispatchEvent(new CustomEvent('suite:theme'));
  }
  function applyLang(lang) {
    html.lang = lang;
    document.dispatchEvent(new CustomEvent('suite:lang'));
  }
  function setLang(lang) {
    if (!validLang(lang)) return;
    langChoice = lang === browserLang() ? null : lang;
    save(prefix + 'lang', langChoice);
    applyLang(lang);
  }
  function toggleTheme() {
    const theme = html.dataset.theme === 'dark' ? 'light' : 'dark';
    themeChoice = theme === browserTheme() ? null : theme;
    save(prefix + 'theme', themeChoice);
    applyTheme(theme, true);
  }
  window.SuitePreferences = { setLang, toggleTheme };
  media.addEventListener('change', () => { if (!themeChoice) applyTheme(browserTheme(), true); });
  window.addEventListener('languagechange', () => { if (!langChoice) applyLang(browserLang()); });
  applyTheme(themeChoice || browserTheme(), false);
  applyLang(langChoice || browserLang());
})();
