import { createEnv } from "schema-env";
import { joiEnvSchema, JoiEnv } from "./env.joi.js"; // Use .js extension
import { JoiValidatorAdapter } from "./joi-adapter.js"; // Use .js extension

// Define the expected return type explicitly, as schema-env cannot infer it
// from a custom adapter. This should match the type definition in env.joi.ts.
type ExpectedEnv = JoiEnv;

function main() {
  console.log("--- Validating environment using Joi Adapter ---");
  try {
    // Set some process env vars for demonstration
    process.env.API_HOST = "api.example.com";
    // API_PORT will use default from Joi schema
    // NODE_ENV will use default from Joi schema
    process.env.ENABLE_FEATURE_X = "true"; // Will be coerced by Joi

    if (process.env.FAIL_VALIDATION === "true") {
      console.log("Intentionally causing validation failure...");
      delete process.env.API_HOST; // Remove required host
    }

    // 1. Instantiate the custom adapter with the Joi schema
    const joiAdapter = new JoiValidatorAdapter(joiEnvSchema);

    // 2. Call createEnv, passing the adapter via the 'validator' option
    //    Provide the expected result type <ExpectedEnv> via the generic parameter.
    //    Since we are using 'validator', the first generic TSchema should be 'undefined'.
    const env = createEnv<undefined, ExpectedEnv>({
      validator: joiAdapter,
      // dotEnvPath option still works as usual for loading files before validation
      dotEnvPath: "./.env", // Load variables from .env file
    });

    console.log("\n--- Environment Validation Successful (Joi) ---");
    console.log(`NODE_ENV: ${env.NODE_ENV}`);
    console.log(`API Host: ${env.API_HOST}`);
    console.log(`API Port: ${env.API_PORT}`);
    console.log(`API Timeout: ${env.API_TIMEOUT_MS ?? "Not Set (Optional)"}`);
    console.log(`Feature X Enabled: ${env.ENABLE_FEATURE_X}`);

    console.log("\nValidated Environment Object:");
    console.dir(env);
  } catch (error) {
    console.error("\n❌❌❌ Application Initialization Failed (Joi) ❌❌❌");
    // createEnv rejects on validation failure
    // Error details (already formatted by the adapter and logged by schema-env)
    // console.error(error); // Optionally log the raw error
    process.exit(1);
  }
}

main();
