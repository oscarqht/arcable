import browser from 'webextension-polyfill';

export { browser };

/**
 * Helper to query active tab across Chrome and Firefox.
 */
export async function getActiveTab(): Promise<browser.Tabs.Tab | undefined> {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
  } catch (error) {
    console.error('Error getting active tab:', error);
    return undefined;
  }
}

/**
 * Storage wrapper for cross-browser storage sync/local.
 */
export const storage = {
  async get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    try {
      const result = await browser.storage.local.get(key);
      return result[key] !== undefined ? (result[key] as T) : defaultValue;
    } catch (error) {
      console.error(`Error reading key "${key}" from storage:`, error);
      return defaultValue;
    }
  },

  async set<T>(key: string, value: T): Promise<void> {
    try {
      await browser.storage.local.set({ [key]: value });
    } catch (error) {
      console.error(`Error saving key "${key}" to storage:`, error);
    }
  },

  async remove(key: string): Promise<void> {
    try {
      await browser.storage.local.remove(key);
    } catch (error) {
      console.error(`Error removing key "${key}" from storage:`, error);
    }
  },
};
