import { defineConfig } from 'tsdown';

const LOADER_ID = 'dsh-task-assist';

/**
 * Browser-loader wrapper — mirrors @linxin666/dsh-client-ui-skill-explorer/lib/client.js.
 * The factory declares `module`/`exports` and RETURNS module.exports, exactly like the
 * official client bundle. DSH's client loader fails with "loaded without registering"
 * if the factory throws (e.g. a bare `exports` ReferenceError) or never returns.
 *
 * NOTE ON BRACE COUNT — the banner opens TWO blocks:
 *   `load(` `{`            <- the options object literal
 *          `factory: (require) =>` `{`   <- the factory body
 * so the footer MUST close both, i.e. end with `}});` (factory `}`, object `}`, call `)`).
 * A footer of `});` leaves the object literal unterminated and the browser throws
 * `Uncaught SyntaxError: Unexpected token ')'` at the last line, which surfaces as
 * `web boot: 1 entry did not activate` / `<plugin>: import failed`.
 * Reference (skill-explorer) ends with `\t}\n});` — same two-brace shape.
 */
const CLIENT_BANNER = `window.__ModuleLoader__.load({ id: ${JSON.stringify(LOADER_ID)}, factory: (require) => {
var module = { exports: {} };
var exports = module.exports;
`;
const CLIENT_FOOTER = `
return module.exports;
}});
`;

/**
 * `banner`/`footer` are applied to every chunk of a build, declarations included.
 * The client half therefore disables declaration output outright (see below)
 * rather than relying on a name-gated addon: a declaration file that opens with
 * `window.__ModuleLoader__` is not valid TypeScript.
 */

/** Both entries ship as `.js` (not `.mjs`/`.cjs`) to match DSH's client-loader contract. */
const outExtension = () => ({ js: '.js', dts: '.d.ts' });

export default defineConfig([
  // ---- Host bundle (Node): pure ESM, no wrapper. ----
  {
    entry: { index: 'src/server/index.ts' },
    format: ['esm'],
    target: 'es2022',
    outDir: 'lib',
    outExtension,
    clean: true,
    deps: {
      // Host runs inside the DSH cordis runtime; keep framework out of the bundle.
      neverBundle: [/^@deepseek-ai\//, /^react($|\/)/],
    },
  },
  // ---- Client bundle (browser): CJS factory wrapped for __ModuleLoader__. ----
  {
    entry: { client: 'src/client/index.ts' },
    format: ['cjs'],
    target: 'es2022',
    outDir: 'lib',
    outExtension,
    banner: CLIENT_BANNER,
    footer: CLIENT_FOOTER,
    // No `.d.ts` for the client half. The `__ModuleLoader__` banner is applied to
    // every chunk of a build including declarations, and a `.d.ts` that opens with
    // `window.__ModuleLoader__` is not valid TypeScript — editors flag it and it
    // inlines the whole transitive type tree (58 kB of cosmokit types). The client
    // half is consumed by the loader's `factory(require)`, never by a type
    // resolver, so its declaration file has no consumer to begin with.
    dts: false,
    deps: {
      // react is provided by the loader's `require`; the `@deepseek-ai/*`
      // references are all `import type` (erased), so nothing else is external.
      neverBundle: [/^react($|\/)/],
    },
  },
]);
