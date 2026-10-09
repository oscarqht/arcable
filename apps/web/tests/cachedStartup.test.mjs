import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = await readFile(new URL('../src/app/page.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;

function renderPage({ authLoading = true, authenticated = false } = {}) {
  let workspaceProps;
  const module = { exports: {} };
  const react = {
    ...React,
    useState(initial) {
      if (initial === true) initial = authLoading;
      if (initial?.isAuthenticated === false) initial = { isAuthenticated: authenticated };
      return React.useState(initial);
    },
  };
  const components = new Proxy({
    WorkspaceManager: (props) => {
      workspaceProps = props;
      return React.createElement('div', null, 'Cached workspace');
    },
  }, { get: (target, key) => target[key] || (() => null) });
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require: (name) => {
      if (name === 'react') return react;
      if (name === 'next/dynamic') return () => components.WorkspaceManager;
      if (name === '@arcable/shared/components') return components;
      if (name === '@arcable/shared/hooks') return { useSystemTheme: () => ({ isDark: false }) };
      return {};
    },
  });
  const html = renderToStaticMarkup(React.createElement(module.exports.default));
  return { html, workspaceProps };
}

const pending = renderPage();
assert.match(pending.html, /Cached workspace/, 'Mount the cache reader before the auth request settles');
assert.doesNotMatch(pending.html, /Checking Raindrop login|Log in to Raindrop.io/);
assert.equal(pending.workspaceProps.isInitialLoading, true, 'An empty cache must retain its loading indicator');
assert.equal(pending.workspaceProps.autoSync, false, 'Do not upload cached data before authentication and hydration');
assert.equal(pending.workspaceProps.onSyncRaindrop, undefined);
assert.equal(pending.workspaceProps.onSearchRaindrop, undefined);

const signedOut = renderPage({ authLoading: false });
assert.match(signedOut.html, /Log in to Raindrop.io/, 'Confirmed signed-out users must still see login');
assert.equal(signedOut.workspaceProps, undefined);

const signedIn = renderPage({ authLoading: false, authenticated: true });
assert.match(signedIn.html, /Cached workspace/);
assert.equal(signedIn.workspaceProps.autoSync, false, 'Authentication alone must not enable uploads before remote hydration');
assert.equal(signedIn.workspaceProps.isInitialLoading, true);
console.log('Cached web startup tests passed.');
