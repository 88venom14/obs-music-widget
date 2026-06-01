const js = require("@eslint/js");
const globals = require("globals");
const importX = require("eslint-plugin-import-x");

// ESLint covers the browser JavaScript under docs/ (the GitHub Pages app).
// The TypeScript test suite is type-checked separately via `npm run lint`
// (tsc --noEmit), so it is not linted here.
//
// Most of docs/ are ES modules (the app, entered via main.js). import-x
// statically verifies that every import resolves and that imported names are
// actually exported — the main safety net for the module split, since ESM
// cannot be syntax-checked with `node --check`.
const sharedRules = {
  // Allow intentionally unused catch bindings / args prefixed with "_".
  "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }]
};

module.exports = [
  {
    ignores: ["dist/**", "node_modules/**"]
  },
  // ES modules: the app graph (everything except the two classic scripts below).
  {
    files: ["docs/**/*.js"],
    ignores: ["docs/js/core/widget-core.js", "docs/site-config.js"],
    ...js.configs.recommended,
    plugins: { "import-x": importX },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser }
    },
    rules: {
      ...sharedRules,
      "import-x/no-unresolved": "error",
      "import-x/named": "error",
      "import-x/default": "error",
      "import-x/no-duplicates": "error"
    }
  },
  // Classic scripts loaded via plain <script>: UMD helpers + deploy config.
  {
    files: ["docs/js/core/widget-core.js", "docs/site-config.js"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        // widget-core.js uses a UMD wrapper, so it touches module/globalThis.
        module: "writable",
        globalThis: "readonly"
      }
    },
    rules: sharedRules
  }
];
