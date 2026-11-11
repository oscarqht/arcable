// Builds must exist. Uses an isolated Chromium profile and the real extension.
// CHROME_BIN=/path/to/brave node apps/extension/tests/options.browser.test.mjs
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const chrome = process.env.CHROME_BIN;
const harnessName = `arcable-options-${process.pid}`;
if (!chrome)
  throw new Error(
    "Set CHROME_BIN to an extension-capable Chromium executable (e.g. Brave).",
  );
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "arcable-options-"));
const extension = path.join(profile, 'extension');
fs.cpSync(fileURLToPath(new URL('../dist/chrome', import.meta.url)), extension, { recursive: true });
// Only the disposable test copy mocks auth and provider responses.
const bootstrap = fs.readFileSync(new URL('./options.browser.bootstrap.js', import.meta.url), 'utf8');
const worker = path.join(extension, 'background.js');
fs.writeFileSync(worker, bootstrap + '\n' + fs.readFileSync(worker, 'utf8'));
const proc = spawn(
  chrome,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--no-first-run",
    "--disable-background-networking",
    "--disable-features=BraveShields",
    `--user-data-dir=${profile}`,
    "--remote-debugging-port=0",
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try {
      port = fs
        .readFileSync(path.join(profile, "DevToolsActivePort"), "utf8")
        .split("\n")[0];
      break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!port) throw new Error("Browser did not start");
  const script = fs.readFileSync(
    new URL("./options.browser.py", import.meta.url),
    "utf8",
  );
  const harness = spawn("browser-harness", [], {
    env: {
      ...process.env,
      BU_NAME: harnessName,
      BU_CDP_URL: `http://127.0.0.1:${port}`,
      BH_TAB_MARKER: "0",
    },
    stdio: ["pipe", "inherit", "inherit"],
  });
  harness.stdin.end(script);
  const exit = await new Promise((resolve) => harness.once("exit", resolve));
  if (exit !== 0) throw new Error(`Browser assertions failed (${exit})`);
} finally {
  try {
    execFileSync("browser-harness", ["--reload"], {
      env: { ...process.env, BU_NAME: harnessName },
      stdio: "ignore",
    });
  } catch {}
  proc.kill();
  await new Promise((resolve) =>
    proc.exitCode !== null || proc.signalCode !== null
      ? resolve()
      : proc.once("exit", resolve),
  );
  fs.rmSync(profile, { recursive: true, force: true });
}
