// Requires a Chrome extension build. Tests both the renderer fixture and real extension.
// CHROME_BIN=/path/to/brave node apps/extension/tests/panelAnchoring.browser.test.mjs
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fixture } from "./floatingPanels.fixture.mjs";
const chrome = process.env.CHROME_BIN;
const harnessName = `arcable-${process.pid}`;
if (!chrome)
  throw new Error("Set CHROME_BIN to a Chromium executable (e.g. Brave).");
const server = http.createServer((req, res) => {
  res.setHeader(
    "Content-Type",
    req.url === "/fixture.js" ? "text/javascript" : "text/html",
  );
  res.end(
    req.url === "/fixture.js"
      ? fixture
      : req.url === "/host"
        ? "<!doctype html><h1>Real extension host</h1>"
        : '<!doctype html><body><script src="/fixture.js"></script></body>',
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "arcable-anchoring-"));

const extension = fileURLToPath(new URL("../dist/chrome", import.meta.url));
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
    new URL("./panelAnchoring.browser.py", import.meta.url),
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
