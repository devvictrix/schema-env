<p align="center">
  <a href="https://www.npmjs.com/package/schema-env">
    <img src="https://img.shields.io/npm/v/schema-env.svg" alt="npm version" />
  </a>
  <a href="https://img.shields.io/npm/dm/schema-env.svg">
    <img src="https://img.shields.io/npm/dm/schema-env.svg" alt="Downloads per month" />
  </a>
  <a href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License: MIT" />
  </a>
  <img src="https://img.shields.io/badge/coverage-97%25-brightgreen.svg" alt="Coverage" />
  <img src="https://img.shields.io/badge/types-TypeScript-blue.svg" alt="TypeScript Support" />
</p>

> **TL;DR** Stop booting your app with missing/invalid env vars. `schema-env` validates them _before_ your code runs and gives you a fully-typed object to consume.

---

## ✨ DX Highlights

- **Fully type-safe** – Zod schema ➜ inferred TS types.
- **Fail-fast** – throw on first mis-configuration (sync) or reject (async).
- **Zero-magic loading** – predictable precedence & opt-in variable expansion.
- **Secrets-ready** – `createEnvAsync` fetches from Vault, AWS Secrets Manager, etc.
- **Tiny footprint** – only `dotenv`, `dotenv-expand` (runtime) + peer `zod`.

---

## Installation

```bash
# pick your favourite package manager
npm i schema-env zod dotenv dotenv-expand   # npm
# yarn add schema-env zod dotenv dotenv-expand
# pnpm add schema-env zod dotenv dotenv-expand
```

> **Peer dep notice** — `zod` is declared as a _peer_ dependency; make sure it is installed in your project.

---

## Quick Start (60 sec)

```ts title="src/env.ts"
import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  API_KEY: z.string().min(10),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});
export type Env = z.infer<typeof envSchema>;
```

```dotenv title=".env"
DATABASE_URL=postgresql://user:password@host:5432/db
API_KEY=super‑secret‑api‑key
PORT=8080
```

```ts title="src/index.ts"
import { createEnv } from "schema-env";
import { envSchema, type Env } from "./env.js";

const env: Env = createEnv({ schema: envSchema });

console.info(`Running in ${env.NODE_ENV} mode on :${env.PORT}`);
```

That’s it – your app will **exit immediately** with a helpful Zod error report if anything is missing or malformed.

---

## Secrets? Use `createEnvAsync`

<details>
<summary>Example (click to expand)</summary>

```ts
import { createEnvAsync, SecretSourceFunction } from "schema-env";
import { z } from "zod";

const schema = z.object({
  DB_PASSWORD: z.string(),
  STRIPE_KEY: z.string().startsWith("sk_"),
});

const fromAws: SecretSourceFunction = async () => ({ DB_PASSWORD: "aws‑pwd" });
const fromVault: SecretSourceFunction = async () => ({
  STRIPE_KEY: "sk_test_123",
});

(async () => {
  const env = await createEnvAsync({
    schema,
    secretsSources: [fromAws, fromVault],
  });
  console.log(env);
})();
```

</details>

---

## API Overview

| Function                  | Sync? | Description                                                                   |
| ------------------------- | ----- | ----------------------------------------------------------------------------- |
| `createEnv(options)`      | ✅    | Load `.env` → merge → validate → return typed config. Throws on error.        |
| `createEnvAsync(options)` | ❌    | Same as above + concurrent `secretsSources`. Resolves with config or rejects. |

### Shared `options`

| Option            | Type                          | Default  | Notes                                        |
| ----------------- | ----------------------------- | -------- | -------------------------------------------- |
| `schema`          | `ZodObject`                   | —        | **Required**. Your contract.                 |
| `dotEnvPath`      | `string \| string[] \| false` | `".env"` | Disable with `false`; array = load in order. |
| `expandVariables` | `boolean`                     | `false`  | Uses `dotenv-expand` on files only.          |

### Async-only

| Option           | Type                     | Default | Notes                                                    |
| ---------------- | ------------------------ | ------- | -------------------------------------------------------- |
| `secretsSources` | `SecretSourceFunction[]` | `[]`    | Fetched **in parallel**; later sources win on key clash. |

---

## Loading Precedence

1. **Schema defaults**
2. **.env files** (order as loaded) → optional expansion
3. **Secrets** (`createEnvAsync` only)
4. **process.env** (highest wins)

---

## Error Handling

- Validation issues ➜ _pretty Zod report_ + throw/reject.
- Missing file (`ENOENT`) is ignored; other I/O errors are fatal.
- A failing `secretsSource` logs a warning; proceeds unless _all_ sources fail.

---

## Examples & Recipes

Browse `/examples` for runnable snippets:

- **basic** – multiple files & expansion
- **express** – plug into an Express server
- **async-secrets** – mock secret stores

---

## License

[MIT](https://opensource.org/licenses/MIT) – use, modify, profit. ✌️
