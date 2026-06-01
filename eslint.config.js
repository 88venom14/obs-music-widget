const js = require("@eslint/js");
const globals = require("globals");
const importX = require("eslint-plugin-import-x");

const sharedRules = {
  "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }]
};

module.exports = [
  {
    ignores: ["dist/**", "node_modules/**"]
  },
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
  {
    files: ["docs/js/core/widget-core.js", "docs/site-config.js"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        module: "writable",
        globalThis: "readonly"
      }
    },
    rules: sharedRules
  }
];
