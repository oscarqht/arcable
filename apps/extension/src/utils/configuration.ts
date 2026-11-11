import browser from "webextension-polyfill";

/** Serialize Options writes with background reconciliation. */
export async function updateConfiguration(patch: Record<string, unknown>): Promise<void> {
  const response = await browser.runtime.sendMessage({ type: "ARCABLE_UPDATE_CONFIGURATION", patch }) as { success?: boolean; error?: string };
  if (!response?.success) throw new Error(response?.error || "Could not save configuration");
}
