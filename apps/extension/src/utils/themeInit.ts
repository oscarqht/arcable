/**
 * Initializes light/dark theme attributes on the document element.
 * Moving this out of inline scripts avoids CSP violations in Manifest V3.
 */
export function initTheme(): void {
  try {
    let isDark = false;
    const stored = localStorage.getItem('arcable_config');
    if (stored) {
      const cfg = JSON.parse(stored);
      if (cfg.theme === 'dark') isDark = true;
      else if (cfg.theme === 'light') isDark = false;
      else if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) isDark = true;
    } else if (localStorage.getItem('arcable_theme') === 'dark') {
      isDark = true;
    } else if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      isDark = true;
    }

    if (isDark && typeof document !== 'undefined') {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.style.colorScheme = 'dark';
    }
  } catch {}
}

initTheme();
