// .eslintrc.js
module.exports = {
  parser: "@typescript-eslint/parser", // Specifies the ESLint parser
  parserOptions: {
    ecmaVersion: 2022, // Allows for the parsing of modern ECMAScript features
    sourceType: "module", // Allows for the use of imports
    project: "./tsconfig.json", // Important: Point ESLint to your tsconfig.json
  },
  env: {
    node: true, // Enables Node.js global variables and Node.js scoping.
    es2022: true, // Adds all ECMAScript 2022 globals and automatically sets ecmaVersion parser option to 13.
    jest: true, // Adds Jest global variables.
  },
  extends: [
    "eslint:recommended", // Uses the recommended rules from ESLint
    "plugin:@typescript-eslint/recommended", // Uses the recommended rules from @typescript-eslint/eslint-plugin
    // 'plugin:@typescript-eslint/recommended-requiring-type-checking', // Optional: More intense rules that require type information
    "plugin:prettier/recommended", // Enables eslint-plugin-prettier and eslint-config-prettier. Displays prettier errors as ESLint errors. Make sure this is always the last configuration in the extends array.
  ],
  plugins: ["@typescript-eslint", "prettier"],
  rules: {
    // Place to specify ESLint rules. Can be used to overwrite rules specified from the extended configs
    // e.g. "@typescript-eslint/explicit-function-return-type": "off",
    "prettier/prettier": "warn", // Show Prettier issues as warnings
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }], // Warn about unused vars, except those starting with _
    "@typescript-eslint/no-explicit-any": "warn", // Warn about usage of 'any' type
    "no-console": ["warn", { allow: ["warn", "error"] }], // Allow console.warn and console.error, but warn on console.log etc.
  },
  ignorePatterns: [
    ".eslintrc.js", // Don't lint the ESLint config itself
    "dist/",
    "node_modules/",
    "coverage/",
    "*.cjs", // Assuming you might generate CJS types/files not meant for linting
  ],
};
