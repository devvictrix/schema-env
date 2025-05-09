# schema-env: Your App's Smart Instruction Checker!

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
  <a href="https://app.codecov.io/gh/devvictrix/schema-env">
    <img src="https://img.shields.io/codecov/c/github/devvictrix/schema-env?style=flat-square" alt="Test Coverage" />
  </a>
  <img src="https://img.shields.io/badge/types-TypeScript-blue.svg" alt="TypeScript Support" />
  <a href="https://github.com/devvictrix/schema-env/blob/main/ai/AI_INSTRUCTIONS.md">
    <img src="https://img.shields.io/badge/Developed%20with-AI%20Assistance-blueviolet?style=flat-square" alt="Developed with AI Assistance" />
  </a>
</p>

Ever tried to build a LEGO set without the right pieces or with confusing instructions? Your app can feel the same way if its "environment variables" (special settings it needs to run) are wrong!

**`schema-env` is like a super-helpful assistant that checks these settings for your Node.js app _before_ it even starts.** It makes sure everything is A-OK, so your app can run smoothly and reliably.

---

## TL;DR (Too Long; Didn't Read)

> `schema-env` makes your app safer by checking its settings (like API keys, port numbers) against a rulebook (your Zod schema or custom adapter) right at the start. It can read settings from `.env` files, special files for development/production, and even secret vaults! If something's wrong, it tells you immediately.

---

## DX Highlights (Developer Experience Wins!)

- ✅ **Peace of Mind:** No more "Oops, I forgot that setting!" errors in production.
- 📖 **Clear Rules:** Define exactly what your app needs, in one place.
- 🤝 **Team-Friendly:** Everyone knows what settings are required.
- 🤖 **Async & Flexible:** Works with modern setups, including fetching secrets.
- 🧩 **Use Your Favorite Tools:** Zod is built-in, but you can plug in Joi, Yup, etc.
- 💡 **Smart & Simple API:** Easy to get started, powerful when you need it.

---

## What's an "Environment Variable"? And Why Check Them?

Think of environment variables as little notes you give your app:

- `PORT=3000` (Tells your app which door to use for web traffic)
- `API_KEY=supersecret123` (A secret password to talk to another service)
- `NODE_ENV=development` (Tells your app if it's in "practice mode" or "live mode")

If these notes are missing, misspelled, or have the wrong kind of info (like text where a number should be), your app might get confused, crash, or even worse, do something unexpected!

**`schema-env` helps by:**

1.  **Reading a "Rulebook" (Schema):** You tell `schema-env` what notes your app expects and what they should look like.
2.  **Checking the "Notes" (.env files & system):** It looks at the notes you've provided.
3.  **Giving a Thumbs Up or Down:** If all notes match the rulebook, great! If not, it stops your app and tells you exactly what's wrong.

This makes your app:

- 👍 **More Reliable:** Fewer surprise crashes.
- 🔒 **More Secure:** Helps ensure secret keys are present and correctly formatted.
- 🛠️ **Easier to Debug:** Find configuration problems instantly.

## Features - What Can This Assistant Do?

- 🔍 **Checks Your Settings (Validation):** Makes sure settings are the right type (text, number, URL, etc.) and follow your rules. Uses the popular [Zod](https://zod.dev/) library by default, but you can bring your own!
- 📄 **Reads `.env` Files:** Automatically loads settings from `.env` files – a common way to store them.
- 🌳 **Understands Different "Moods" (Environments):** Can load different settings for "development" (`.env.development`), "production" (`.env.production`), etc.
- ➕ **Handles Multiple Instruction Sheets:** You can have a base set of settings and then override them with local ones.
- 🔗 **Smart Links in Settings (Variable Expansion):** Lets one setting use the value of another (e.g., `FULL_URL = ${BASE_URL}/api`).
- 🤫 **Fetches Secret Settings (Asynchronous):** Can get super-secret settings from secure vaults _before_ checking everything.
- 🥇 **Knows Who's Boss (Clear Precedence):** If a setting is defined in multiple places, `schema-env` knows which one to use.
- 🛡️ **Doesn't Change Global Settings:** It won't mess with your computer's main settings.
- 🗣️ **Clear Error Messages:** Tells you _all_ the problems at once, not one by one.
- 🤖 **AI-Powered Helper:** This library was built with the help of an AI assistant!

## Let's Get Started! (Basic Magic)

**1. Install `schema-env` and `zod` (our default rulebook maker):**

```bash
npm install schema-env zod
# or
yarn add schema-env zod
```

**2. Create Your Rulebook (`envSchema.ts`):**
Tell `schema-env` what settings your app needs.

```typescript
// envSchema.ts
import { z } from "zod"; // Zod helps us make the rules!

export const envSchema = z.object({
  // Rule 1: NODE_ENV should be "development" or "production". Default to "development".
  NODE_ENV: z.enum(["development", "production"]).default("development"),

  // Rule 2: PORT should be a number. If not given, use 3000.
  PORT: z.coerce.number().default(3000),

  // Rule 3: GREETING_MESSAGE must be text, and you *must* provide it!
  GREETING_MESSAGE: z.string().min(1, "Oops! You forgot the greeting message!"),
});

// This creates a TypeScript type for our validated settings - super handy!
export type Env = z.infer<typeof envSchema>;
```

**3. Write Down Your App's Settings (`.env` file):**
Create a file named `.env` in the main folder of your project.

```ini
# .env
GREETING_MESSAGE="Hello from schema-env!"
PORT="8080"
```

_(Notice we didn't put `NODE_ENV` here? Our rulebook says it defaults to "development"!)_

**4. Tell `schema-env` to Check Everything (in your app's main file, like `index.ts` or `server.ts`):**

```typescript
// index.ts
import { createEnv } from "schema-env";
import { envSchema, Env } from "./envSchema.js"; // Use .js for modern JavaScript modules

let settings: Env; // This will hold our correct settings

try {
  // Time for the magic check!
  settings = createEnv({ schema: envSchema });
  console.log("✅ Hooray! All settings are correct!");
} catch (error) {
  console.error("❌ Oh no! Something's wrong with the settings.");
  // schema-env already printed the detailed error messages for us!
  process.exit(1); // Stop the app, because settings are bad.
}

// Now you can safely use your settings!
console.log(`The app says: ${settings.GREETING_MESSAGE}`);
console.log(`Running in ${settings.NODE_ENV} mode on port ${settings.PORT}.`);

// Go ahead and start your amazing app!
// startMyApp(settings);
```

If you run this and your `.env` file is missing `GREETING_MESSAGE` or `PORT` is not a number, `schema-env` will tell you!

## Doing More Cool Things!

### Different Settings for Different "Moods" (e.g., Development vs. Production)

If you have a setting `NODE_ENV` (like in our example), `schema-env` is extra smart:

- If `NODE_ENV=development`, it will also try to load settings from a file named `.env.development`.
- If `NODE_ENV=production`, it will look for `.env.production`.

Settings in these specific files will _override_ settings from the main `.env` file.

### Settings That Depend on Other Settings (Variable Expansion)

Want `API_URL` to be `${HOSTNAME}/api`? Easy!
First, tell `schema-env` you want to do this:

```typescript
settings = createEnv({
  schema: envSchema, // Your usual rulebook
  expandVariables: true, // Set this to true!
});
```

Then, in your `.env` file:

```ini
HOSTNAME="http://mycoolsite.com"
API_URL="${HOSTNAME}/v1/data"
```

`schema-env` will figure out `API_URL` should be `http://mycoolsite.com/v1/data`.

### Using Multiple `.env` Files

Sometimes you want a base set of settings and then some local ones that only you use.

```typescript
settings = createEnv({
  schema: envSchema,
  dotEnvPath: [".env.defaults", ".env.local"], // Checks .env.defaults, then .env.local
});
```

Later files in the list override earlier ones. And the "mood" specific file (like `.env.development`) still gets checked _after_ all of these!

## For the Pros: Super Secret Settings & Your Own Rules!

### Getting Secrets from a Secure Vault (Async Magic with `createEnvAsync`)

Some settings, like database passwords, are too secret for `.env` files. You might keep them in a "secrets manager" (like AWS Secrets Manager, HashiCorp Vault, etc.). `schema-env` can fetch these _before_ it checks all your rules!

```typescript
// mySecretFetcher.ts
import type { SecretSourceFunction } from "schema-env";

export const fetchMyDatabasePassword: SecretSourceFunction = async () => {
  console.log("🤫 Asking the secret vault for the DB password...");
  // In real life, you'd use a library here to talk to your secrets manager.
  // We'll pretend it takes a moment:
  await new Promise((resolve) => setTimeout(resolve, 50));
  return {
    DB_PASSWORD: "ultra-secret-password-from-vault",
  };
};
```

Then, in your app:

```typescript
// index.ts
import { createEnvAsync } from "schema-env"; // Note: createEnvAsync!
import { envSchema, Env } from "./envSchema.js"; // Your schema needs to expect DB_PASSWORD
import { fetchMyDatabasePassword } from "./mySecretFetcher.js";

async function startAppSafely() {
  let settings: Env;
  try {
    settings = await createEnvAsync({
      // await is important here!
      schema: envSchema,
      secretsSources: [fetchMyDatabasePassword], // Add your secret fetchers here
    });
    console.log("✅ Secrets fetched and all settings are correct!");
    // console.log(`DB Password's first letter: ${settings.DB_PASSWORD[0]}`); // Be careful logging secrets!
  } catch (error) {
    console.error(
      "❌ Oh no! Something went wrong with settings (maybe secrets?)."
    );
    process.exit(1);
  }
  // startMyApp(settings);
}

startAppSafely();
```

### Don't Like Zod? Bring Your Own Rulebook Checker! (Custom Adapters)

If your team already uses another library like Joi or Yup to define rules, you can tell `schema-env` to use that instead of Zod!

You'll need to create a small "adapter" that teaches `schema-env` how to talk to your chosen library. This involves implementing the `ValidatorAdapter` interface provided by `schema-env`.

<details>
<summary><strong>Advanced: More on Custom Validation Adapters</strong></summary>

To use a custom validation library (like Joi, Yup, or your own):

1.  **Define your environment type and schema** using your chosen library.
2.  **Implement the `ValidatorAdapter<TResult>` interface** from `schema-env`. This adapter will:
    - Take the merged environment data as input.
    - Use your chosen library to validate this data.
    - Return a `ValidationResult<TResult>` object, which tells `schema-env` if validation succeeded (and the typed data) or failed (with standardized error details).
3.  **Pass an instance of your adapter** to `createEnv` or `createEnvAsync` using the `validator` option. You'll also need to provide the expected result type as a generic argument (e.g., `createEnv<undefined, MyCustomEnvType>({ validator: myAdapter })`).

For a complete, runnable example showing how to create and use a custom adapter with **Joi**, please see the [`examples/custom-adapter-joi/`](https://github.com/devvictrix/schema-env/tree/main/examples/custom-adapter-joi) directory in this repository. It includes:
_ A Joi schema definition (`env.joi.ts`).
_ The Joi adapter implementation (`joi-adapter.ts`). \* An example of how to use it (`index.ts`).

This demonstrates the flexibility of `schema-env` in integrating with various validation workflows.

</details>

## Who Wins? The Order of Settings (Precedence)

If a setting is defined in multiple places, here's who wins (highest number wins):

**For `createEnv` (the simpler one):**

1.  Default values in your rulebook (schema).
2.  Values from your `.env` file(s) (and expanded if you turned that on).
3.  Values from your computer's actual environment (these are like global settings).

**For `createEnvAsync` (the one for secrets):**

1.  Default values in your rulebook (schema).
2.  Values from your `.env` file(s) (expanded if on).
3.  Values fetched from your `secretsSources` (the secret vaults).
4.  Values from your computer's actual environment.

## Quick Look at the Main Tools (API Reference)

### `createEnv(options)`

- Checks settings right away.
- If something is wrong, it stops and tells you (throws an error).
- Returns your perfectly validated settings.

### `async createEnvAsync(options)`

- Can fetch secrets from vaults first.
- Then checks all settings.
- If something is wrong, it tells you by rejecting its Promise.
- If all good, its Promise gives you the validated settings.

### Key Options (for both tools):

- `schema`: Your Zod rulebook. (Use this OR `validator`)
- `validator`: Your custom rulebook checker. (Use this OR `schema`)
- `dotEnvPath`: Which `.env` file(s) to read. (e.g., `'./.env.custom'` or `['./.env.base', './.env.local']`). Defaults to just `./.env`. Can be `false` to load no `.env` files.
- `expandVariables`: `true` or `false` to turn on smart links in `.env` files. (Defaults to `false`)
- `secretsSources`: (Only for `createEnvAsync`) A list of functions that go fetch your secrets.

---

## Want to Help or Have Ideas? (Contributing)

That's awesome! We'd love your help.

- Check out `docs/ROADMAP.md` to see what's planned.
- New ideas, bug reports, and improvements are always welcome.

## License

[MIT](LICENSE) © [devvictrix (AI Assisted)](https://github.com/devvictrix)
