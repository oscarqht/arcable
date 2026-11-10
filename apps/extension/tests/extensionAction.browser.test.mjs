// Builds must exist. Uses an isolated Chromium profile and the real extension.
// CHROME_BIN=/path/to/brave node apps/extension/tests/extensionAction.browser.test.mjs
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const chrome = process.env.CHROME_BIN;
const harnessName = `arcable-action-${process.pid}`;
if (!chrome)
  throw new Error(
    "Set CHROME_BIN to an extension-capable Chromium executable (e.g. Brave).",
  );
const server = http.createServer((_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end('<!doctype html><body style="margin:40px;background:#eff6ff;font:24px system-ui"><h1>Screenshot regression fixture</h1><p>Capture this page, then annotate it.</p><div style="width:500px;height:200px;background:#0284c7;border-radius:24px"></div>');
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "arcable-action-editor-"));
const extension = path.join(profile, 'extension');
fs.cpSync(fileURLToPath(new URL('../dist/chrome', import.meta.url)), extension, { recursive: true });
// Only the disposable test copy exposes a click dispatcher and mocks the provider.
const bootstrap = fs.readFileSync(new URL('./extensionAction.browser.bootstrap.js', import.meta.url), 'utf8');
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
    new URL("./extensionAction.browser.py", import.meta.url),
    "utf8",
  );
  const harness = spawn("browser-harness", [], {
    env: {
      ...process.env,
      BU_NAME: harnessName,
      BU_CDP_URL: `http://127.0.0.1:${port}`,
      BH_TAB_MARKER: "0",
      ARCABLE_FIXTURE: `http://127.0.0.1:${server.address().port}`,
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
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(profile, { recursive: true, force: true });
}
