(() => {
  const STORAGE_KEY = 'zavokaCookieConsent';
  const MAX_AGE = 180 * 24 * 60 * 60 * 1000;
  let preferenceConsent = false;
  let savedChoice = false;

  const readChoice = () => {
    try {
      const choice = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!choice) return null;
      if (Date.now() - Number(choice.savedAt) > MAX_AGE) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return choice;
    } catch {
      return null;
    }
  };
  const existing = readChoice();
  if (existing) {
    savedChoice = true;
    preferenceConsent = existing.preferences === true;
  }

  const publish = () => window.dispatchEvent(new CustomEvent('zavoka:consentchange', {
    detail: { necessary: true, preferences: preferenceConsent }
  }));
  window.ZavokaConsent = {
    allowsPreferences: () => preferenceConsent,
    openSettings: () => showBanner(true)
  };

  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = 'css/cookie-consent.css';
  document.head.append(stylesheet);

  const banner = document.createElement('section');
  banner.className = 'cookie-consent';
  banner.hidden = true;
  banner.setAttribute('aria-label', 'Cookie and storage preferences');
  banner.innerHTML = `
    <div class="cookie-consent-copy">
      <strong>Your privacy choices</strong>
      <p>Essential browser storage keeps the site working. With your permission, we can also remember your currency choice and cache exchange rates. We don’t use advertising or analytics cookies. <a href="cookies.html">Cookie policy</a></p>
    </div>
    <div class="cookie-consent-actions">
      <button type="button" data-cookie-choice="necessary">Essential only</button>
      <button type="button" data-cookie-choice="all">Accept all</button>
      <button type="button" class="cookie-customize">Customize</button>
    </div>
    <div class="cookie-consent-options" hidden>
      <label><input type="checkbox" checked disabled> Essential storage <span>Always on</span></label>
      <label><input class="cookie-preferences-toggle" type="checkbox"> Optional preferences <span>Remember currency and cached rates</span></label>
      <button type="button" class="cookie-save">Save choices</button>
    </div>`;
  document.body.append(banner);

  const showBanner = (openOptions = false) => {
    banner.hidden = false;
    const options = banner.querySelector('.cookie-consent-options');
    options.hidden = !openOptions;
    banner.querySelector('.cookie-preferences-toggle').checked = preferenceConsent;
    if (openOptions) banner.querySelector('.cookie-preferences-toggle').focus();
  };
  const saveChoice = allowPreferences => {
    preferenceConsent = allowPreferences;
    savedChoice = true;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ necessary: true, preferences: allowPreferences, savedAt: Date.now() }));
    } catch { /* Keep the current-tab choice if browser storage is unavailable. */ }
    banner.hidden = true;
    publish();
  };

  banner.addEventListener('click', event => {
    const choice = event.target.closest('[data-cookie-choice]');
    if (choice) {
      saveChoice(choice.dataset.cookieChoice === 'all');
      return;
    }
    if (event.target.closest('.cookie-customize')) {
      const options = banner.querySelector('.cookie-consent-options');
      options.hidden = !options.hidden;
      if (!options.hidden) banner.querySelector('.cookie-preferences-toggle').focus();
    }
    if (event.target.closest('.cookie-save')) {
      saveChoice(banner.querySelector('.cookie-preferences-toggle').checked);
    }
  });
  document.addEventListener('click', event => {
    if (event.target.closest('.cookie-settings-trigger')) showBanner(true);
  });

  if (!savedChoice) showBanner();
  publish();
})();
