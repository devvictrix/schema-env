// File: tests/index.test.ts (Adding v1.2.0 Test Suite)

import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "@jest/globals";
import { z } from "zod";
import { createEnv } from "../src/index.js"; // Keep .js extension
import type {
  DotenvConfigOptions,
  DotenvConfigOutput,
  DotenvParseOutput,
} from "dotenv";

// --- Type Aliases ---
type DotenvConfigFunction = (
  options?: DotenvConfigOptions
) => DotenvConfigOutput;
type DotenvExpandFunction = (config: DotenvConfigOutput) => DotenvConfigOutput;

// --- Mocks ---
const mockedDotenvConfig = jest.fn<DotenvConfigFunction>();

// --- Test Schema (Ensure it includes vars for new tests) ---
const testSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  API_URL: z.string().url(), // Required
  SECRET_KEY: z.string().min(10), // Required
  OPTIONAL_VAR: z.string().optional(),
  BOOLEAN_VAR: z.coerce.boolean().default(false),
  // For expansion tests
  BASE_URL: z.string().default("http://localhost"),
  FULL_API_URL: z.string().optional(), // e.g., ${BASE_URL}/api
  VAR_A: z.string().optional(),
  VAR_B: z.string().optional(),
  VAR_C: z.string().optional(),
  EMPTY_VAR_EXPANDED: z.string().optional(),
  // For multiple file tests
  FROM_BASE: z.string().optional(),
  FROM_LOCAL: z.string().optional(),
  FROM_ENV_SPECIFIC: z.string().optional(),
  OVERRIDDEN: z.string().optional(),
});

// --- Environment Setup Helper ---
let originalProcessEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  mockedDotenvConfig.mockReset();
  originalProcessEnv = { ...process.env };
  const keysToClear = [
    ...Object.keys(testSchema.shape),
    "NODE_ENV",
    "MISSING_VAR",
  ];
  new Set(keysToClear).forEach((key) => delete process.env[key]);
  delete process.env.NODE_ENV;
});

afterEach(() => {
  process.env = originalProcessEnv;
});

// --- Helpers ---
const setupProcessEnv = (envVars: Record<string, string | undefined>) => {
  for (const key in envVars) {
    if (envVars[key] !== undefined) {
      process.env[key] = envVars[key];
    } else {
      delete process.env[key];
    }
  }
};

const mockDotenvFiles = (
  files: Record<
    string,
    Record<string, string> | NodeJS.ErrnoException | "ENOENT"
  >
) => {
  mockedDotenvConfig.mockImplementation((options) => {
    const filePathMaybe = options?.path;
    let pathKey: string | undefined = undefined;

    if (typeof filePathMaybe === "string") {
      pathKey = filePathMaybe;
    } else {
      pathKey = "./.env"; // Default path if options.path is undefined
    }

    const data = files[pathKey];

    if (data === "ENOENT") {
      const error = new Error(
        `ENOENT: no such file or directory, open '${pathKey}' (mocked)`
      );
      (error as NodeJS.ErrnoException).code = "ENOENT";
      return { error };
    } else if (data instanceof Error) {
      return { error: data };
    } else if (data !== undefined) {
      return { parsed: { ...data } };
    } else {
      const error = new Error(
        `ENOENT: no such file or directory, open '${pathKey}' (default mock)`
      );
      (error as NodeJS.ErrnoException).code = "ENOENT";
      return { error };
    }
  });
};

const createLocalMockExpander = (): DotenvExpandFunction => {
  return (config: DotenvConfigOutput): DotenvConfigOutput => {
    if (config.error || !config.parsed) {
      return config;
    }
    const parsedCopy: DotenvParseOutput = { ...config.parsed };
    const lookupValues = { ...config.parsed };
    const expandValue = (value: string, processing: Set<string>): string => {
      return value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
        if (processing.has(varName)) {
          return "";
        }
        if (lookupValues[varName] !== undefined) {
          processing.add(varName);
          const expanded = expandValue(lookupValues[varName], processing);
          processing.delete(varName);
          return expanded;
        }
        return "";
      });
    };
    for (const key in parsedCopy) {
      if (
        Object.prototype.hasOwnProperty.call(parsedCopy, key) &&
        typeof parsedCopy[key] === "string"
      ) {
        const processing = new Set<string>([key]);
        parsedCopy[key] = expandValue(parsedCopy[key], processing);
      }
    }
    return { parsed: parsedCopy };
  };
};

// --- v1.0.0 Core Functionality Tests ---
describe("createEnv (v1.0.0 Functionality)", () => {
  /* ... unchanged ... */
  it("should return validated env with defaults when no sources provide values", () => {
    setupProcessEnv({
      API_URL: "https://test.com",
      SECRET_KEY: "longenoughsecretkey",
    });
    mockDotenvFiles({});
    const env = createEnv({
      schema: testSchema,
      _internalDotenvConfig: mockedDotenvConfig,
    });
    expect(env).toEqual(
      expect.objectContaining({
        NODE_ENV: "development",
        PORT: 8080,
        API_URL: "https://test.com",
        SECRET_KEY: "longenoughsecretkey",
        BOOLEAN_VAR: false,
        BASE_URL: "http://localhost",
      })
    );
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env" });
  });
  it("should return validated env with values from .env overriding defaults", () => {
    setupProcessEnv({});
    const mockDotEnvData = {
      NODE_ENV: "production",
      PORT: "3000",
      API_URL: "https://from-dotenv.com",
      SECRET_KEY: "secretkeyfromdotenv",
      BOOLEAN_VAR: "true",
      BASE_URL: "https://api.prod.com",
    };
    mockDotenvFiles({ "./.env": mockDotEnvData });
    const env = createEnv({
      schema: testSchema,
      _internalDotenvConfig: mockedDotenvConfig,
    });
    expect(env).toEqual(
      expect.objectContaining({
        NODE_ENV: "production",
        PORT: 3000,
        API_URL: "https://from-dotenv.com",
        SECRET_KEY: "secretkeyfromdotenv",
        BOOLEAN_VAR: true,
        BASE_URL: "https://api.prod.com",
      })
    );
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env" });
  });
  it("should return validated env with process.env overriding .env and defaults", () => {
    setupProcessEnv({
      PORT: "9999",
      SECRET_KEY: "processenvsecret",
      OPTIONAL_VAR: "hello from process",
    });
    const mockDotEnvData = {
      PORT: "3000",
      API_URL: "https://from-dotenv.com",
      SECRET_KEY: "dotenvsecret",
      BOOLEAN_VAR: "1",
    };
    mockDotenvFiles({ "./.env": mockDotEnvData });
    const env = createEnv({
      schema: testSchema,
      _internalDotenvConfig: mockedDotenvConfig,
    });
    expect(env).toEqual(
      expect.objectContaining({
        NODE_ENV: "development",
        PORT: 9999,
        API_URL: "https://from-dotenv.com",
        SECRET_KEY: "processenvsecret",
        OPTIONAL_VAR: "hello from process",
        BOOLEAN_VAR: true,
        BASE_URL: "http://localhost",
      })
    );
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env" });
  });
  it("should throw validation error if required variables are missing", () => {
    setupProcessEnv({ SECRET_KEY: "onlythesecretisprovided" });
    mockDotenvFiles({});
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    expect(() => {
      createEnv({
        schema: testSchema,
        _internalDotenvConfig: mockedDotenvConfig,
      });
    }).toThrow("Environment validation failed. Check console output.");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("❌ Invalid environment variables:")
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("- API_URL: Required")
    );
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("- SECRET_KEY")
    );
    consoleErrorSpy.mockRestore();
  });
  it("should not load any .env files if dotEnvPath is false", () => {
    setupProcessEnv({
      API_URL: "https://no-dotenv.com",
      SECRET_KEY: "thiskeyislongenough",
    });
    const env = createEnv({
      schema: testSchema,
      dotEnvPath: false,
      _internalDotenvConfig: mockedDotenvConfig,
    });
    expect(env.API_URL).toBe("https://no-dotenv.com");
    expect(env.SECRET_KEY).toBe("thiskeyislongenough");
    expect(env.PORT).toBe(8080);
    expect(mockedDotenvConfig).not.toHaveBeenCalled();
  });
  it("should THROW error if .env file fails to load (other than ENOENT)", () => {
    setupProcessEnv({});
    const loadError = new Error("Permission denied");
    (loadError as NodeJS.ErrnoException).code = "EACCES";
    mockDotenvFiles({ "./.env": loadError });
    expect(() => {
      createEnv({
        schema: testSchema,
        _internalDotenvConfig: mockedDotenvConfig,
      });
    }).toThrow(
      `❌ Failed to load environment file from ./.env: ${loadError.message}`
    );
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env" });
  });
});

// --- v1.1.0 Environment-Specific File Loading Tests ---
describe("createEnv (v1.1.0 - Environment-Specific Files)", () => {
  /* ... unchanged ... */
  it("should load .env only if NODE_ENV is not set (using default path)", () => {
    mockDotenvFiles({
      "./.env": {
        API_URL: "https://base.com",
        SECRET_KEY: "base-secret-key-123",
      },
    });
    const env = createEnv({
      schema: testSchema,
      _internalDotenvConfig: mockedDotenvConfig,
    });
    expect(env.API_URL).toBe("https://base.com");
    expect(env.SECRET_KEY).toBe("base-secret-key-123");
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(1);
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env" });
  });
  it("should load .env and .env.development if NODE_ENV=development", () => {
    setupProcessEnv({ NODE_ENV: "development" });
    mockDotenvFiles({
      "./.env": {
        API_URL: "https://base.com",
        SECRET_KEY: "base-secret-key-123",
        PORT: "1111",
      },
      "./.env.development": {
        API_URL: "https://dev.com",
        SECRET_KEY: "dev-secret-key-456",
      },
    });
    const env = createEnv({
      schema: testSchema,
      _internalDotenvConfig: mockedDotenvConfig,
    });
    expect(env.API_URL).toBe("https://dev.com");
    expect(env.SECRET_KEY).toBe("dev-secret-key-456");
    expect(env.PORT).toBe(1111);
    expect(env.NODE_ENV).toBe("development");
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(2);
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env" });
    expect(mockedDotenvConfig).toHaveBeenCalledWith({
      path: "./.env.development",
    });
  });
  it("should load base .env only if environment-specific file is not found (ENOENT)", () => {
    setupProcessEnv({ NODE_ENV: "test" });
    mockDotenvFiles({
      "./.env": {
        API_URL: "https://base.com",
        SECRET_KEY: "base-secret-key-123",
      },
      "./.env.test": "ENOENT",
    });
    const env = createEnv({
      schema: testSchema,
      _internalDotenvConfig: mockedDotenvConfig,
    });
    expect(env.API_URL).toBe("https://base.com");
    expect(env.SECRET_KEY).toBe("base-secret-key-123");
    expect(env.NODE_ENV).toBe("test");
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(2);
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env" });
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env.test" });
  });
  it("should correctly merge: Defaults < Base .env < Env-specific .env < process.env (single base path)", () => {
    setupProcessEnv({
      NODE_ENV: "production",
      SECRET_KEY: "process-secret-key-final",
      PORT: "5555",
      OPTIONAL_VAR: "from-process",
    });
    mockDotenvFiles({
      "./.env": {
        API_URL: "https://base.com",
        SECRET_KEY: "base-secret-key-123",
        BOOLEAN_VAR: "true",
        BASE_URL: "https://base.url",
        OVERRIDDEN: "from-base",
      },
      "./.env.production": {
        API_URL: "https://prod.com",
        SECRET_KEY: "prod-secret-key-456",
        PORT: "9000",
        BASE_URL: "https://prod.url",
        OVERRIDDEN: "from-prod",
      },
    });
    const env = createEnv({
      schema: testSchema,
      _internalDotenvConfig: mockedDotenvConfig,
    });
    expect(env).toEqual(
      expect.objectContaining({
        NODE_ENV: "production",
        PORT: 5555,
        API_URL: "https://prod.com",
        SECRET_KEY: "process-secret-key-final",
        OPTIONAL_VAR: "from-process",
        BOOLEAN_VAR: true,
        BASE_URL: "https://prod.url",
        OVERRIDDEN: "from-prod",
      })
    );
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(2);
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env" });
    expect(mockedDotenvConfig).toHaveBeenCalledWith({
      path: "./.env.production",
    });
  });
});

// --- v1.1.0 Variable Expansion Tests ---
describe("createEnv (v1.1.0 - Variable Expansion)", () => {
  /* ... unchanged ... */
  it("should perform expansion when expandVariables is true (single .env)", () => {
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "some-secret-key-that-is-long",
    });
    mockDotenvFiles({
      "./.env": {
        BASE_URL: "https://api.example.com",
        FULL_API_URL: "${BASE_URL}/v1",
      },
    });
    const localMockExpander = createLocalMockExpander();
    const env = createEnv({
      schema: testSchema,
      expandVariables: true,
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: localMockExpander,
    });
    expect(env.FULL_API_URL).toBe("https://api.example.com/v1");
    expect(env.BASE_URL).toBe("https://api.example.com");
  });
  it("should NOT perform expansion when expandVariables is false (default)", () => {
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "a-valid-secret-key",
    });
    mockDotenvFiles({
      "./.env": {
        BASE_URL: "https://api.example.com",
        FULL_API_URL: "${BASE_URL}/v1",
      },
    });
    const localMockExpander = createLocalMockExpander();
    const env = createEnv({
      schema: testSchema,
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: localMockExpander,
    });
    expect(env.FULL_API_URL).toBe("${BASE_URL}/v1");
    expect(env.BASE_URL).toBe("https://api.example.com");
  });
  it("should expand variables drawing values from both base and env-specific files", () => {
    setupProcessEnv({
      NODE_ENV: "development",
      API_URL: "https://required.com",
      SECRET_KEY: "dev-secret-is-long-enough",
    });
    mockDotenvFiles({
      "./.env": {
        BASE_URL: "https://base.api",
        SECRET_KEY: "base-secret-key-123",
      },
      "./.env.development": {
        FULL_API_URL: "${BASE_URL}/dev",
        SECRET_KEY: "dev-secret-key-456",
      },
    });
    const localMockExpander = createLocalMockExpander();
    const env = createEnv({
      schema: testSchema,
      expandVariables: true,
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: localMockExpander,
    });
    expect(env.FULL_API_URL).toBe("https://base.api/dev");
    expect(env.BASE_URL).toBe("https://base.api");
    expect(env.SECRET_KEY).toBe("dev-secret-is-long-enough");
  }); // Corrected assertion
  it("should NOT expand variables from process.env", () => {
    setupProcessEnv({
      NODE_ENV: "production",
      BASE_URL: "https://process-base.url",
      API_URL: "https://required.com",
      SECRET_KEY: "process-secret-is-long",
    });
    mockDotenvFiles({
      "./.env": { FULL_API_URL: "${BASE_URL}/v1" },
      "./.env.production": {},
    });
    const localMockExpander = createLocalMockExpander();
    const env = createEnv({
      schema: testSchema,
      expandVariables: true,
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: localMockExpander,
    });
    expect(env.FULL_API_URL).toBe("/v1");
    expect(env.BASE_URL).toBe("https://process-base.url");
  });
  it("should handle multi-level expansion", () => {
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "long-enough-secret-key",
    });
    mockDotenvFiles({
      "./.env": {
        VAR_A: "${VAR_B}/pathA",
        VAR_B: "${VAR_C}",
        VAR_C: "https://final.value",
      },
    });
    const localMockExpander = createLocalMockExpander();
    const env = createEnv({
      schema: testSchema,
      expandVariables: true,
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: localMockExpander,
    });
    expect(env.VAR_C).toBe("https://final.value");
    expect(env.VAR_B).toBe("https://final.value");
    expect(env.VAR_A).toBe("https://final.value/pathA");
  });
  it("should handle simple circular dependencies by returning empty string", () => {
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "long-enough-secret-key",
    });
    mockDotenvFiles({ "./.env": { VAR_A: "${VAR_B}", VAR_B: "${VAR_A}" } });
    const localMockExpander = createLocalMockExpander();
    const env = createEnv({
      schema: testSchema,
      expandVariables: true,
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: localMockExpander,
    });
    expect(env.VAR_A).toBe("");
    expect(env.VAR_B).toBe("");
  });
});

// --- v1.2.0 Multiple .env Path Tests (NEW SUITE) ---
describe("createEnv (v1.2.0 - Multiple .env Paths)", () => {
  it("should load multiple files sequentially from array, later files overriding", () => {
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "longenoughsecretkey",
    });
    mockDotenvFiles({
      "./.env.base": {
        FROM_BASE: "yes",
        OVERRIDDEN: "base-value",
        PORT: "1000",
      },
      "./.env.local": {
        FROM_LOCAL: "yes",
        OVERRIDDEN: "local-value",
        PORT: "2000",
      },
    });
    const env = createEnv({
      schema: testSchema,
      dotEnvPath: ["./.env.base", "./.env.local"], // Array input
      _internalDotenvConfig: mockedDotenvConfig,
    });

    expect(env.FROM_BASE).toBe("yes");
    expect(env.FROM_LOCAL).toBe("yes");
    expect(env.OVERRIDDEN).toBe("local-value"); // .env.local overrides .env.base
    expect(env.PORT).toBe(2000); // .env.local overrides .env.base
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(2);
    expect(mockedDotenvConfig).toHaveBeenNthCalledWith(1, {
      path: "./.env.base",
    });
    expect(mockedDotenvConfig).toHaveBeenNthCalledWith(2, {
      path: "./.env.local",
    });
  });

  it("should load multiple files AND environment-specific file, with env-specific overriding array files", () => {
    setupProcessEnv({
      NODE_ENV: "development",
      API_URL: "https://required.com",
      SECRET_KEY: "longenoughsecretkey",
    });
    mockDotenvFiles({
      "./.env.base": {
        FROM_BASE: "yes",
        OVERRIDDEN: "base-value",
        PORT: "1000",
      },
      "./.env.local": {
        FROM_LOCAL: "yes",
        OVERRIDDEN: "local-value",
        PORT: "2000",
      },
      "./.env.development": {
        FROM_ENV_SPECIFIC: "yes",
        OVERRIDDEN: "dev-value",
        PORT: "3000",
      }, // Env-specific file
    });
    const env = createEnv({
      schema: testSchema,
      dotEnvPath: ["./.env.base", "./.env.local"],
      _internalDotenvConfig: mockedDotenvConfig,
    });

    expect(env.FROM_BASE).toBe("yes");
    expect(env.FROM_LOCAL).toBe("yes");
    expect(env.FROM_ENV_SPECIFIC).toBe("yes");
    expect(env.OVERRIDDEN).toBe("dev-value"); // .env.development overrides .env.local
    expect(env.PORT).toBe(3000); // .env.development overrides .env.local
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(3);
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env.base" });
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env.local" });
    expect(mockedDotenvConfig).toHaveBeenCalledWith({
      path: "./.env.development",
    });
  });

  it("should ignore ENOENT for files within the array path and continue loading", () => {
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "longenoughsecretkey",
    });
    mockDotenvFiles({
      "./.env.base": { FROM_BASE: "yes", OVERRIDDEN: "base-value" },
      "./.env.missing": "ENOENT", // Mock this file as not found
      "./.env.local": { FROM_LOCAL: "yes", OVERRIDDEN: "local-value" },
    });
    const env = createEnv({
      schema: testSchema,
      dotEnvPath: ["./.env.base", "./.env.missing", "./.env.local"],
      _internalDotenvConfig: mockedDotenvConfig,
    });

    expect(env.FROM_BASE).toBe("yes");
    expect(env.FROM_LOCAL).toBe("yes");
    expect(env.OVERRIDDEN).toBe("local-value"); // local still overrides base
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(3);
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env.base" });
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env.missing" });
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env.local" });
  });

  it("should THROW error if a file in the array fails to load (non-ENOENT)", () => {
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "longenoughsecretkey",
    });
    const loadError = new Error("Read error");
    (loadError as NodeJS.ErrnoException).code = "EIO"; // Example non-ENOENT code
    mockDotenvFiles({
      "./.env.base": { FROM_BASE: "yes", OVERRIDDEN: "base" },
      "./.env.bad": loadError, // Mock specific error
      "./.env.local": { FROM_LOCAL: "yes", OVERRIDDEN: "local" },
    });

    expect(() => {
      createEnv({
        schema: testSchema,
        dotEnvPath: ["./.env.base", "./.env.bad", "./.env.local"],
        _internalDotenvConfig: mockedDotenvConfig,
      });
    }).toThrow(
      `❌ Failed to load environment file from ./.env.bad: ${loadError.message}`
    );

    // Verify loading stopped at the failing file
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env.base" });
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env.bad" });
    expect(mockedDotenvConfig).not.toHaveBeenCalledWith({
      path: "./.env.local",
    });
  });

  it("should load array paths, env-specific, and process.env with correct full precedence", () => {
    setupProcessEnv({
      NODE_ENV: "development",
      API_URL: "https://required.com/from/process",
      SECRET_KEY: "process-secret-key-very-long",
      OVERRIDDEN: "process-value",
      FROM_ENV_SPECIFIC: "process-override",
      PORT: "9999", // process.env override for port
    });
    mockDotenvFiles({
      "./.env.base": {
        FROM_BASE: "yes",
        OVERRIDDEN: "base",
        SECRET_KEY: "base-secret-too-short",
        FROM_ENV_SPECIFIC: "base",
        API_URL: "https://base.url",
        PORT: "1000",
      },
      "./.env.local": {
        FROM_LOCAL: "yes",
        OVERRIDDEN: "local",
        SECRET_KEY: "local-secret-long-enough",
        FROM_ENV_SPECIFIC: "local",
        API_URL: "https://local.url",
        PORT: "2000",
      },
      "./.env.development": {
        OVERRIDDEN: "dev",
        FROM_ENV_SPECIFIC: "dev-real",
        API_URL: "https://dev.url",
        PORT: "3000",
      },
    });
    const env = createEnv({
      schema: testSchema,
      dotEnvPath: ["./.env.base", "./.env.local"],
      _internalDotenvConfig: mockedDotenvConfig,
    });

    expect(env).toEqual(
      expect.objectContaining({
        FROM_BASE: "yes",
        FROM_LOCAL: "yes",
        OVERRIDDEN: "process-value", // process.env
        FROM_ENV_SPECIFIC: "process-override", // process.env
        SECRET_KEY: "process-secret-key-very-long", // process.env
        API_URL: "https://required.com/from/process", // process.env
        NODE_ENV: "development", // process.env
        PORT: 9999, // process.env
        BOOLEAN_VAR: false, // default
        BASE_URL: "http://localhost", // default
      })
    );
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(3); // base, local, dev attempted
  });

  it("should perform expansion correctly when using multiple .env paths and env-specific", () => {
    setupProcessEnv({
      NODE_ENV: "development",
      API_URL: "https://required.com",
      SECRET_KEY: "longenoughsecretkey",
    });
    mockDotenvFiles({
      "./.env.base": { BASE_URL: "https://base.url", VAR_A: "base-A" },
      "./.env.local": { VAR_B: "${BASE_URL}/local-B", VAR_A: "local-A" }, // Uses BASE_URL from base, overrides VAR_A
      "./.env.development": { VAR_C: "${VAR_A}-dev" }, // Uses VAR_A from local
    });
    const localMockExpander = createLocalMockExpander();

    const env = createEnv({
      schema: testSchema,
      dotEnvPath: ["./.env.base", "./.env.local"],
      expandVariables: true, // Enable expansion
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: localMockExpander,
    });

    expect(env.BASE_URL).toBe("https://base.url"); // From base
    expect(env.VAR_A).toBe("local-A"); // From local (overrides base)
    expect(env.VAR_B).toBe("https://base.url/local-B"); // Expanded using base BASE_URL
    expect(env.VAR_C).toBe("local-A-dev"); // Expanded using local VAR_A after merge, then dev VAR_C definition
  });

  it("should skip non-string paths in dotEnvPath array", () => {
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "longenoughsecretkey",
    });
    mockDotenvFiles({
      "./.env.valid": { FROM_BASE: "yes" },
    });
    const consoleWarnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => {});

    const env = createEnv({
      schema: testSchema,
      // @ts-expect-error - Deliberately testing invalid input type
      dotEnvPath: ["./.env.valid", 123, null, undefined],
      _internalDotenvConfig: mockedDotenvConfig,
    });

    expect(env.FROM_BASE).toBe("yes");
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(1); // Only called for the valid path
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env.valid" });
    expect(consoleWarnSpy).toHaveBeenCalledTimes(3); // Warnings for 123, null, undefined
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("123"));
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("null")
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("undefined")
    );

    consoleWarnSpy.mockRestore();
  });
});
