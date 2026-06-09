import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Don't fail the suite before any package has tests yet.
    passWithNoTests: true,
    include: ["packages/**/*.{test,spec}.ts", "workers/**/*.{test,spec}.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.wrangler/**", "workers/ui/web/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: ["**/dist/**", "**/*.config.*", "**/*.{test,spec}.ts"],
    },
  },
});
