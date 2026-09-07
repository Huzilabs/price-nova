import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integration tests against Supabase in eu-west-1: a single assertion can
    // involve a dozen sequential round-trips, and setup/teardown cleans up
    // after every suite. Generous on purpose — a timeout here means "the
    // network was slow", not "the code is wrong", and a false failure is worse
    // than a slow pass.
    testTimeout: 180_000,
    hookTimeout: 240_000,
    // These tests share one database; running files in parallel would let them
    // interfere through the settings table.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
      // `server-only` throws unless resolved under the react-server condition,
      // which Vitest does not apply. The guard is a build-time concern; under
      // test the modules genuinely are running on the server.
      "server-only": path.resolve(process.cwd(), "tests/stubs/server-only.ts"),
    },
  },
});
