import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "src-tauri/target",
      "public/wasm",
      "node_modules",
      "coverage",
      // Build/setup scripts and Vite config are Node-side and not part of the
      // type-checked app program.
      "vite.config.ts",
      "scripts/**",
      "eslint.config.js",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Hard requirements from the product spec's coding standards.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/consistent-type-imports": "warn",
      // Our typed SpineIqError union is intentionally a plain object, not an
      // Error subclass, so allow rejecting/using it directly.
      "@typescript-eslint/prefer-promise-reject-errors": "off",
    },
  },
  {
    files: ["tests/**/*.ts", "tests/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
