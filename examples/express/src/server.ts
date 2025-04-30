import express from "express";
import cors from "cors";
import { createEnv } from "schema-env";
import { envSchema, Env } from "./env.js"; // Use .js

let env: Env;

try {
    // Validate environment at the very start
    env = createEnv({ schema: envSchema });
    console.log(`[schema-env] Environment validated successfully for NODE_ENV=${env.NODE_ENV}`);
} catch (error) {
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
    res.json({ message: "Hello from schema-env Express example!", environment: env.NODE_ENV });
});

app.get("/health", (req, res) => {
    // Here you might check database connection using env.DATABASE_URL
    res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

// Start server
app.listen(env.PORT, env.HOST, () => {
    console.log(`🚀 Server listening at http://${env.HOST}:${env.PORT}`);
    console.log(`Database URL configured: ${env.DATABASE_URL}`); // Be cautious logging sensitive URLs
    console.log(`Session Secret Loaded: ${env.SESSION_SECRET ? 'Yes' : 'No'}`);
});