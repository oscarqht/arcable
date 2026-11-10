import { createRequire, Module } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";
export const require = createRequire(import.meta.url);
for (const ext of [".ts", ".tsx"])
  Module._extensions[ext] = (module, filename) =>
    module._compile(
      ts.transpileModule(readFileSync(filename, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      }).outputText,
      filename,
    );
export function mockModules(mocks) {
  const original = Module._load;
  Module._load = function (name, ...args) {
    if (name in mocks) return mocks[name];
    if (name === "@arcable/shared/utils")
      return require("../../../packages/shared/src/utils/index.ts");
    return original.call(this, name, ...args);
  };
}
export function event() {
  const listeners = [];
  return {
    addListener: (fn) => listeners.push(fn),
    removeListener: (fn) => listeners.splice(listeners.indexOf(fn), 1),
    emit: (...args) => listeners.forEach((fn) => fn(...args)),
  };
}
export function storage(data, changed = event(), area = "local") {
  return {
    get: async (keys) =>
      Object.fromEntries(
        (typeof keys === "string" ? [keys] : keys).map((key) => [
          key,
          structuredClone(data[key]),
        ]),
      ),
    set: async (patch) => {
      const changes = Object.fromEntries(
        Object.entries(patch)
          .filter(
            ([key, value]) =>
              JSON.stringify(data[key]) !== JSON.stringify(value),
          )
          .map(([key, value]) => [
            key,
            {
              oldValue: structuredClone(data[key]),
              newValue: structuredClone(value),
            },
          ]),
      );
      Object.assign(data, structuredClone(patch));
      if (Object.keys(changes).length) changed.emit(changes, area);
    },
    remove: async (key) => {
      delete data[key];
    },
  };
}
