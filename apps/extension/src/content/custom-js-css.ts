import browser from 'webextension-polyfill';
import { CustomCodeRule } from '@arcable/shared/types';
import { matchUrlPattern } from '@arcable/shared/utils';

const STORAGE_KEY = 'customCodeRules';
const INJECTED_CSS_PREFIX = 'arcable-custom-css-';
const INJECTED_JS_PREFIX = 'arcable-custom-js-';

export class CustomCodeInjector {
  private rules: CustomCodeRule[] = [];
  private injectedStyles = new Set<string>();
  private injectedScripts = new Set<string>();

  constructor() {
    void this.init();
  }

  async init(): Promise<void> {
    try {
      // A Google session is backed by Supabase, not Raindrop. Ask the worker to
      // refresh the shared code stores before matching the current page.
      try {
        const hydration = await browser.runtime.sendMessage({ type: 'SUPABASE_HYDRATE_CUSTOM_CODE' }) as {
          success?: boolean;
          error?: string;
        };
        if (hydration?.success === false) {
          console.warn('[CustomCodeInjector] Failed to refresh cloud rules:', hydration.error);
        }
      } catch (err) {
        // Existing local rules should still run if the worker is restarting.
        console.warn('[CustomCodeInjector] Could not contact background worker:', err);
      }
      await this.loadRules();
      this.applyMatchingRules();
      this.setupStorageListener();
    } catch (err) {
      console.warn('[CustomCodeInjector] Failed to initialize:', err);
    }
  }

  async loadRules(): Promise<void> {
    try {
      const res = await browser.storage.local.get(STORAGE_KEY);
      this.rules = (res[STORAGE_KEY] as CustomCodeRule[]) || [];
    } catch (err) {
      console.warn('[CustomCodeInjector] Failed to load rules:', err);
    }
  }

  injectCSS(ruleId: string, css: string): void {
    if (!css || !css.trim()) return;

    const styleId = INJECTED_CSS_PREFIX + ruleId;
    const existing = document.getElementById(styleId);
    if (existing) {
      existing.remove();
    }

    const styleEl = document.createElement('style');
    styleEl.id = styleId;
    styleEl.textContent = css;
    styleEl.setAttribute('data-arcable-custom', 'true');

    if (document.head) {
      document.head.appendChild(styleEl);
    } else if (document.body) {
      document.body.appendChild(styleEl);
    } else if (document.documentElement) {
      document.documentElement.appendChild(styleEl);
    }

    this.injectedStyles.add(styleId);
  }

  async injectJS(ruleId: string, js: string): Promise<void> {
    if (!js || !js.trim()) return;

    const scriptKey = INJECTED_JS_PREFIX + ruleId;
    if (this.injectedScripts.has(scriptKey)) {
      return;
    }

    try {
      const res = (await browser.runtime.sendMessage({
        type: 'INJECT_CUSTOM_JS',
        payload: {
          ruleId,
          code: js,
        },
      })) as { success: boolean; error?: string };

      if (res?.success) {
        this.injectedScripts.add(scriptKey);
      } else {
        console.warn('[CustomCodeInjector] Failed to inject JS for rule:', ruleId, res?.error);
      }
    } catch (err) {
      console.warn('[CustomCodeInjector] Injection error:', ruleId, err);
    }
  }

  removeCSS(ruleId: string): void {
    const styleId = INJECTED_CSS_PREFIX + ruleId;
    const el = document.getElementById(styleId);
    if (el) {
      el.remove();
    }
    this.injectedStyles.delete(styleId);
  }

  applyMatchingRules(): void {
    const currentUrl = window.location.href;
    const activeRuleIds = new Set<string>();

    this.rules.forEach((rule) => {
      if (!rule.disabled && matchUrlPattern(rule.pattern, currentUrl)) {
        activeRuleIds.add(rule.id);
        this.injectCSS(rule.id, rule.css);
        void this.injectJS(rule.id, rule.js);
      }
    });

    // Clean up stale CSS
    this.injectedStyles.forEach((styleId) => {
      const ruleId = styleId.replace(INJECTED_CSS_PREFIX, '');
      if (!activeRuleIds.has(ruleId)) {
        this.removeCSS(ruleId);
      }
    });
  }

  setupStorageListener(): void {
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[STORAGE_KEY]) {
        this.rules = (changes[STORAGE_KEY].newValue as CustomCodeRule[]) || [];
        this.applyMatchingRules();
      }
    });
  }
}

export function initCustomCodeInjector(): CustomCodeInjector {
  return new CustomCodeInjector();
}
