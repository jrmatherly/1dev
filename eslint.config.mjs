import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";

export default [
  // Global ignores
  {
    ignores: [
      "out/**",
      "dist/**",
      "node_modules/**",
      "drizzle/**",
      ".scratchpad/**",
      "docs/**",
      "**/*.d.ts",
    ],
  },

  // TypeScript + JSX files — SonarJS recommended with project-specific overrides
  {
    files: ["src/**/*.{ts,tsx}"],
    linterOptions: {
      // Source code has eslint-disable comments referencing rules from plugins
      // we don't use (react-hooks, @typescript-eslint, deprecation). Don't
      // error on those — they're harmless and may be needed if those plugins
      // are added later.
      reportUnusedDisableDirectives: "off",
      reportUnusedInlineConfigs: "off",
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
        // Note: projectService is intentionally NOT enabled. Type-aware rules
        // add ~40s to lint time and overlap with tsgo (our primary type checker).
        // The non-type-aware SonarJS rules catch the issues we care about.
      },
    },
    plugins: { sonarjs },
    rules: {
      ...sonarjs.configs.recommended.rules,

      // ── Suppress: Electron/React patterns ──────────────────────────
      // React components nest closures for event handlers, hooks, memoized
      // callbacks — this is idiomatic React, not a code smell.
      "sonarjs/no-nested-functions": "off",

      // React JSX uses conditional ternaries extensively for rendering.
      "sonarjs/no-nested-conditional": "off",

      // Cognitive complexity thresholds are too low for normalizer/dispatch
      // functions that handle many tool types with flat if/else chains.
      "sonarjs/cognitive-complexity": "off",

      // Semantic type aliases (e.g. `type MessagePart = AnyObj`) serve as
      // documentation — removing them hurts readability.
      "sonarjs/redundant-type-aliases": "off",

      // CSS class names, IPC channel names, test strings repeat constantly.
      "sonarjs/no-duplicate-string": "off",

      // TODO/FIXME tags are normal during active development.
      "sonarjs/todo-tag": "off",
      "sonarjs/fixme-tag": "off",

      // Math.random() used for UI element IDs and keys, not cryptography.
      "sonarjs/pseudo-random": "off",

      // Terminal ANSI escape processing uses intentional control regex.
      "sonarjs/no-control-regex": "off",

      // `void fn()` fire-and-forget pattern is intentional in React effects.
      "sonarjs/void-use": "off",

      // SVG icon components legitimately repeat identical path render functions.
      "sonarjs/no-identical-functions": "off",

      // Intentional same-handling for different conditions (switch fallthrough patterns).
      "sonarjs/no-all-duplicated-branches": "off",
      "sonarjs/no-duplicated-branches": "off",

      // Empty catch blocks are intentional fallbacks in shim/adapter code.
      "sonarjs/no-ignored-exceptions": "off",

      // Regex patterns operate on trusted app data, not user-supplied strings.
      "sonarjs/slow-regex": "off",

      // ── Suppress: TS/ESLint overlap ────────────────────────────────
      // These overlap with tsgo (our primary type checker) or produce
      // false positives with TypeScript patterns.
      "sonarjs/no-dead-store": "off", // React destructuring: const [_, setter]
      "sonarjs/unused-import": "off", // Type-only imports stripped at build
      "sonarjs/no-unused-vars": "off", // Same — handled by tsgo
      "sonarjs/use-type-alias": "off", // Disagrees with TS convention

      // ── Suppress: Security false positives ─────────────────────────
      // Spawning CLI binaries (claude, codex) requires PATH lookup;
      // these use execFile not exec and inputs are not user-supplied.
      "sonarjs/no-os-command-from-path": "off",
      "sonarjs/os-command": "off",

      // Platform temp directories are standard Electron patterns.
      "sonarjs/publicly-writable-directories": "off",

      // Template literal nesting is readable for URL/path construction.
      "sonarjs/no-nested-template-literals": "off",

      // Single boolean return is fine when the if/else has side effects.
      "sonarjs/prefer-single-boolean-return": "off",

      // Redundant jumps (continue/return) sometimes clarify intent.
      "sonarjs/no-redundant-jump": "off",

      // target="_blank" without rel="noopener" is safe in modern browsers
      // and Electron's webview security model.
      "sonarjs/link-with-target-blank": "off",

      // Single switch case is fine for future-proofing discriminated unions.
      "sonarjs/max-switch-cases": "off",

      // Commented code during active development is acceptable.
      "sonarjs/no-commented-code": "off",

      // ── Suppress: Type-aware rules that are noise ──────────────────
      // React props are passed as object literals — marking every prop
      // interface Readonly<> adds boilerplate without safety benefit.
      "sonarjs/prefer-read-only-props": "off",

      // Flags use of deprecated APIs (e.g. Node.js, React). We track
      // deprecations via version pin upgrades, not lint warnings.
      "sonarjs/deprecation": "off",

      // We already fixed String.match→RegExp.exec in targeted files.
      // The remaining 48 are in upstream-inherited code — bulk fix later.
      "sonarjs/prefer-regexp-exec": "off",

      // Strict about === with different types; produces false positives
      // when comparing values from external APIs (tRPC, Jotai).
      "sonarjs/different-types-comparison": "off",

      // Flags Array.sort() without comparator. Upstream code uses this
      // for string arrays where default lexicographic sort is correct.
      "sonarjs/no-alphabetical-sort": "off",

      // Wants explicit return types on exported functions. Too noisy for
      // React components where return type is inferred as JSX.Element.
      "sonarjs/function-return-type": "off",

      // Array.reverse() / Array.sort() mutation warnings — these operate
      // on local copies, not shared state.
      "sonarjs/no-misleading-array-reverse": "off",

      // Async constructors in upstream utility classes — intentional pattern.
      "sonarjs/no-async-constructor": "off",

      // CSS selector specificity warnings — not applicable to our usage.
      "sonarjs/no-selector-parameter": "off",

      // Invariant return — some functions intentionally return undefined
      // in certain branches.
      "sonarjs/no-invariant-returns": "off",

      // Subresource integrity for CDN scripts — not applicable to Electron.
      "sonarjs/disabled-resource-integrity": "off",

      // Gratuitous expressions — false positives with guard patterns.
      "sonarjs/no-gratuitous-expressions": "off",

      // Empty collection usage — fork has dead upstream code paths.
      "sonarjs/no-empty-collection": "off",

      // Regex simplification suggestions — readability preference.
      "sonarjs/concise-regex": "off",

      // Optional parameter after required — upstream API shapes.
      "sonarjs/no-redundant-optional": "off",
    },
  },

  // Plain JS files (electron-shim.js)
  {
    files: ["electron-shim.js"],
    plugins: { sonarjs },
    rules: {
      ...sonarjs.configs.recommended.rules,
      "sonarjs/no-ignored-exceptions": "off",
      "sonarjs/no-dead-store": "off",
      "sonarjs/no-unused-vars": "off",
      "sonarjs/cognitive-complexity": "off",
    },
  },
];
