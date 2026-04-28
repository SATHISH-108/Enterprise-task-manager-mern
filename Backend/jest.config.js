/** @type {import('jest').Config} */
// `.js` is auto-treated as ESM because package.json sets "type": "module",
// so we don't list it under extensionsToTreatAsEsm — newer Jest versions
// reject the redundant entry as a validation error.
export default {
  testEnvironment: "node",
  testMatch: ["**/src/tests/**/*.test.js"],
  transform: {},
  moduleNameMapper: {},
  verbose: true,
};
