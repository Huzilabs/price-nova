import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  {
    ignores: [
      ".next/**", "node_modules/**", "out/**",
      "next-env.d.ts", "scripts/**", "prisma/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Prisma models legitimately produce long union types; the codebase is
      // strict-typed and `any` is not used, so this adds noise without value.
      "@typescript-eslint/no-explicit-any": "error",
      // Unused args prefixed with _ are deliberate (server action prev-state).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },
];

export default config;
