/**
 * Kept in lock-step with the workspace package version by scripts/bump-version.mjs.
 * This is deliberately a source constant rather than a package.json import so it
 * is available in both the Next.js server bundle and extension service worker.
 */
export const ARCABLE_VERSION = '0.115.0';
