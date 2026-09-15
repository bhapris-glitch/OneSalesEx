(() => {
  // Browsers cannot reliably block operating-system screenshots, but these controls
  // prevent common page actions and browser zoom gestures.
  document.addEventListener('contextmenu', event => event.preventDefault());
  document.addEventListener('dragstart', event => event.preventDefault());
  document.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    const zoomShortcut = (event.ctrlKey || event.metaKey) && ['+', '=', '-', '_', '0'].includes(key);
    const screenshotShortcut = key === 'printscreen' || (event.metaKey && event.shiftKey && ['3', '4', '5'].includes(key));
    if (zoomShortcut || screenshotShortcut) event.preventDefault();
  }, { passive: false });
  document.addEventListener('wheel', event => {
    if (event.ctrlKey) event.preventDefault();
  }, { passive: false });
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(type => {
    document.addEventListener(type, event => event.preventDefault(), { passive: false });
  });
})();
