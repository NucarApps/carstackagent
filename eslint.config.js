import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Lenient flat config: lint TypeScript for genuine correctness issues (the
 * eslint:recommended set) parsed by typescript-eslint, while leaving type-aware
 * concerns to `tsc` (strict mode). Rules that conflict with TS syntax are off.
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/*.config.{js,cjs,mjs,ts}",
      "**/vite.config.ts",
      "web/dist/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": "off", // tsc (noUnusedLocals) and review cover this
      "no-undef": "off", // TS resolves globals/types
      "no-redeclare": "off", // TS function overloads
      "no-dupe-class-members": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
);
