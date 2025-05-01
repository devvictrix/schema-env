import { createEnvAsync } from "schema-env";
import { asyncEnvSchema, AsyncEnv } from "./env.js";
import {
    getDatabaseSecrets,
    getApiServiceSecrets,
    getFailingSecrets,
    getEmptySecrets,
} from "./secret-fetchers.js"; // Import mock fetchers

// Main async function to initialize
async function main() {
    console.log("--- Starting Async Environment Validation ---");
    try {
        // Set some process.env variables for testing precedence
        process.env.PORT = "8080"; // Override default
        process.env.FEATURE_FLAG_X = "false"; // Override secret source

        const env: AsyncEnv = await createEnvAsync({
            schema: asyncEnvSchema,
            // Load regular .env files first (optional)
            // dotEnvPath: '.env',
            secretsSources: [
                getDatabaseSecrets, // Provides DATABASE_URL and FEATURE_FLAG_X
                getApiServiceSecrets, // Provides THIRD_PARTY_API_KEY
                getFailingSecrets, // This one will fail, a warning should be logged
                getEmptySecrets, // This one succeeds but returns no relevant secrets
            ],
        });

        console.log("\n--- Environment Validation Successful ---");
        console.log(`NODE_ENV: ${env.NODE_ENV}`);
        console.log(`Port: ${env.PORT}`); // Should be 8080 from process.env
        console.log(`Log Level: ${env.LOG_LEVEL}`);
        console.log(
            `Database URL Loaded: ${env.DATABASE_URL ? "Yes" : "No"}`
        );
        console.log(
            `API Key Loaded: ${env.THIRD_PARTY_API_KEY ? "Yes" : "No"}`
        );
        console.log(
            `Feature Flag X: ${env.FEATURE_FLAG_X}`
        ); // Should be false from process.env

        console.log("\nValidated Environment Object:");
        console.dir(env);

        // Start application logic here
        // e.g., connectToDatabase(env.DATABASE_URL);
        // setupApiService(env.THIRD_PARTY_API_KEY);

    } catch (error) {
        console.error("\n❌❌❌ Application Initialization Failed ❌❌❌");
        // createEnvAsync rejects on validation failure or fatal sync errors
        // Error details are already logged to console by the library
        // console.error(error); // Optionally log the error object itself
        process.exit(1);
    }
}

main();