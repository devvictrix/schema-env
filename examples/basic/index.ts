import { createEnv } from "schema-env";
import { envSchema } from "./env.js"; // Use .js extension for ESM compatibility

function main() {
  try {
    // Load and validate environment variables on startup
    // Demonstrates loading multiple .env files from an array path.
    // The library will automatically attempt to load .env.${NODE_ENV} AFTER these files.
    const env = createEnv({
      schema: envSchema,
      dotEnvPath: ["./.env.base", "./.env.local"],
      expandVariables: true, // Enable expansion for variables like FULL_API_URL or VAR_B
    });

    // Now use the validated and typed 'env' object
    console.log(`---> Running in ${env.NODE_ENV} mode <---`);
    console.log(`${env.GREETING}, ${env.TARGET}!`);
    console.log(`Server running on Port: ${env.PORT}`);
    console.log(`Log Level: ${env.LOG_LEVEL}`);
    console.log(`Retries configured: ${env.RETRIES}`);
    console.log(`Secret Key Loaded: ${env.SECRET_KEY ? "Yes" : "No"}`);

    console.log("\n--- Multi-file/Expansion Examples ---");
    console.log(`FROM_BASE: ${env.FROM_BASE}`);
    console.log(`FROM_LOCAL: ${env.FROM_LOCAL}`);
    console.log(`FROM_ENV_SPECIFIC: ${env.FROM_ENV_SPECIFIC}`); // Loaded automatically if NODE_ENV matches
    console.log(`OVERRIDDEN: ${env.OVERRIDDEN}`); // Shows final value based on precedence
    console.log(`BASE_URL: ${env.BASE_URL}`); // Base URL from .env.base or overrides
    console.log(`FULL_API_URL (Expanded): ${env.FULL_API_URL}`); // Expanded using BASE_URL
    console.log(`VAR_B (Expanded): ${env.VAR_B}`); // Expanded using BASE_URL

    console.log("\nEnvironment object:", env);

    // Simulate application logic
    console.log("\nPerforming action...");
    for (let i = 0; i < env.RETRIES; i++) {
      // Application logic using env vars...
    }
    console.log("Action complete.");
  } catch (error: any) {
    // Use any for error type safety, or a more specific error type if defined
    // createEnv throws on validation failure
    console.error("Application failed to start:", error.message);
    // createEnv itself logs the detailed Zod errors to console.error already
    process.exit(1); // Exit with error code
  }
}

main();
