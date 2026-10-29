export const STORAGE_KEY_ACTION_MODE = 'arcable_extension_action_mode';
export type ExtensionActionMode = 'sidepanel' | 'popup';

export function getActionMode(value: unknown): ExtensionActionMode {
  return value === 'popup' ? 'popup' : 'sidepanel';
}
