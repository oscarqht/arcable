/**
 * Initializes light/dark theme attributes on the document element.
 * Moving this out of inline scripts avoids CSP violations in Manifest V3.
 */
export function initTheme(): void {
  try {
    const isOsDark = (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ||
      localStorage.getItem('arcable_os_theme') === 'dark';

    let isDark = false;
    const stored = localStorage.getItem('arcable_config');
    if (stored) {
      const cfg = JSON.parse(stored);
      if (cfg.theme === 'dark') isDark = true;
      else if (cfg.theme === 'light') isDark = false;
      else if (isOsDark) isDark = true;
    } else if (localStorage.getItem('arcable_theme') === 'dark') {
      isDark = true;
    } else if (localStorage.getItem('arcable_theme') === 'light') {
      isDark = false;
    } else if (isOsDark) {
      isDark = true;
    }

    if (typeof document !== 'undefined') {
      if (isDark) {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.style.colorScheme = 'dark';
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
        document.documentElement.setAttribute('data-theme', 'light');
        document.documentElement.style.colorScheme = 'light';
      }
    }
  } catch {}
}

initTheme();
