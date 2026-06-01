import { defineConfig } from "vitest/config"
import tsconfigPaths from "vite-tsconfig-paths"

// Plain node test env — the pure domain/service logic under test has no DOM or
// Worker dependency. `tsconfigPaths` resolves the `~/*` alias from tsconfig.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["app/**/*.test.ts"],
    environment: "node",
  },
})
