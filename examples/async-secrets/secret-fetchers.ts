import type { SecretSourceFunction } from "schema-env";

// --- Mock Secret Fetcher Implementations ---
// Replace these with your actual logic using appropriate SDKs (AWS, Vault, etc.)

export const getDatabaseSecrets: SecretSourceFunction = async () => {
  console.log("📞 [Mock] Fetching database secrets...");
  await new Promise((res) => setTimeout(res, 60)); // Simulate network delay
  // Assume success
  console.log("✅ [Mock] Database secrets fetched.");
  return {
    DATABASE_URL: "postgresql://user:simulated_pw@mock-db:5432/app_db",
    // This source might also provide other vars
    FEATURE_FLAG_X: "true",
  };
};

export const getApiServiceSecrets: SecretSourceFunction = async () => {
  console.log("📞 [Mock] Fetching API service secrets...");
  await new Promise((res) => setTimeout(res, 40)); // Simulate network delay
  // Assume success
  console.log("✅ [Mock] API service secrets fetched.");
  return {
    THIRD_PARTY_API_KEY: "mock-api-key-1234567890abcde",
  };
};

export const getFailingSecrets: SecretSourceFunction = async () => {
  console.log("📞 [Mock] Attempting to fetch from a failing source...");
  await new Promise((res) => setTimeout(res, 20)); // Simulate network delay
  console.error("🔥 [Mock] Failing source encountered an error!");
  throw new Error("Simulated network failure fetching secrets");
  // Return {} will not be reached
};

export const getEmptySecrets: SecretSourceFunction = async () => {
  console.log("📞 [Mock] Fetching from a source with no relevant secrets...");
  await new Promise((res) => setTimeout(res, 10)); // Simulate network delay
  console.log("✅ [Mock] Empty source finished.");
  return {}; // No secrets found here
};
