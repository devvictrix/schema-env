import { createEnv } from "schema-env";
import { envSchema } from "./env.js"; // Use .js extension for ESM compatibility

function main() {
  try {
    // Load and validate environment variables on startup
    const env = createEnv({ schema: envSchema });

    // Now use the validated and typed 'env' object
    console.log(`---> Running in ${env.NODE_ENV} mode <---`);
    console.log(`${env.GREETING}, ${env.TARGET}!`);
    console.log(`Log Level: ${env.LOG_LEVEL}`);
    console.log(`Retries configured: ${env.RETRIES}`);

    console.log("\nEnvironment object:", env);

    // Simulate application logic
    console.log("\nPerforming action...");
    for (let i = 0; i < env.RETRIES; i++) {
      // Application logic using env vars...
    }
    console.log("Action complete.");
  } catch (error) {
    // createEnv throws on validation failure
    console.error("Application failed to start:", error.message);
    process.exit(1); // Exit with error code
  }
}

main();
