import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setupTests.js"],
    css: false,
    // Pre-bundle these because their ESM exports trip up the default loader
    // when used inside vitest's transform pipeline.
    server: {
      deps: {
        inline: ["@testing-library/react"],
      },
    },
  },
});
