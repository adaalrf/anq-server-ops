(() => {
  const key = 'anq-server-ops-theme';
  const system = matchMedia('(prefers-color-scheme: dark)');
  let preference = 'system';
  let transitionTimer;
  const valid = (value) => (['light', 'dark'].includes(value) ? value : 'system');
  try {
    preference = valid(localStorage.getItem(key));
  } catch {
    // The control still works for this page when storage is unavailable.
  }
  function apply() {
    const theme = preference === 'system' ? (system.matches ? 'dark' : 'light') : preference;
    const root = document.documentElement;
    if (root.dataset.theme && root.dataset.theme !== theme) {
      root.classList.add('theme-changing');
      clearTimeout(transitionTimer);
      transitionTimer = setTimeout(() => root.classList.remove('theme-changing'), 180);
    }
    root.dataset.theme = theme;
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      meta.content = theme === 'dark' ? '#141d18' : '#f6f8f6';
    });
    dispatchEvent(new Event('server-ops-theme-change'));
  }
  apply();
  system.addEventListener('change', apply);
  addEventListener('storage', (event) => {
    if (event.key === key || event.key === null) {
      preference = valid(event.newValue);
      apply();
    }
  });
  addEventListener('server-ops-theme-set', (event) => {
    preference = valid(event.detail);
    try {
      localStorage.setItem(key, preference);
    } catch {
      /* Page-local choice still works. */
    }
    apply();
  });
})();
