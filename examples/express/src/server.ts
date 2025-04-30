import express from "express";
import cors from "cors";
// This import relies on the main library being built (npm run build in root)
// and the file:../.. link working after npm install in examples/express
import { createEnv } from "schema-env";
// Use .ts extension for local import when using ts-node
import { envSchema, Env } from "./env.ts";

let env: Env;

try {
  // Validate environment at the very start
  // This example uses the default behavior (loads .env, then .env.${NODE_ENV})
  // You could explicitly specify paths like in the basic example:
  // dotEnvPath: ['./.env.base', './.env.local']
  env = createEnv({
    schema: envSchema,
    // dotEnvPath: ['./.env.base', './.env.local'], // Example using array paths
    // expandVariables: true, // Example enabling expansion
  });
  console.log(
    `[schema-env] Environment validated successfully for NODE_ENV=${env.NODE_ENV}`
  );
} catch (error: any) {
  // Use any for error type safety
  console.error("❌ Fatal: Environment validation failed.");
  // Error details are already logged by createEnv
  process.exit(1);
}

const app = express();

// Middleware
if (env.CORS_ORIGIN) {
  app.use(cors({ origin: env.CORS_ORIGIN }));
  console.log(`[Server] CORS enabled for origin: ${env.CORS_ORIGIN}`);
} else {
  console.log(`[Server] CORS not configured.`);
}

app.use(express.json());

if (env.REQUEST_LOGGING) {
  app.use((req, res, next) => {
    console.log(`[Request] ${req.method} ${req.path}`);
    next();
  });
  console.log(`[Server] Request logging enabled.`);
}

// Routes
app.get("/", (req, res) => {
  res.json({
    message: "Hello from schema-env Express example!",
    environment: env.NODE_ENV,
    overridden_example: env.OVERRIDDEN, // Show the overridden value
  });
});

app.get("/health", (req, res) => {
  // Here you might check database connection using env.DATABASE_URL
  res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

// Start server
app.listen(env.PORT, env.HOST, () => {
  console.log(`🚀 Server listening at http://${env.HOST}:${env.PORT}`);
  console.log(`Database URL configured: ${env.DATABASE_URL}`); // Be cautious logging sensitive URLs
  console.log(`Session Secret Loaded: ${env.SESSION_SECRET ? "Yes" : "No"}`);
});
