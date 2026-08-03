import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // All generated, none of it hand-edited: next-env.d.ts by Next, .open-next
  // by the Cloudflare adapter, cloudflare-env.d.ts by `wrangler types`, and
  // public/data staged from /data by scripts/stage-data.ts.
  {
    ignores: [
      ".next/**",
      ".open-next/**",
      ".wrangler/**",
      "node_modules/**",
      "public/data/**",
      "next-env.d.ts",
      "cloudflare-env.d.ts",
    ],
  },
];

export default eslintConfig;
