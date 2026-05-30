import type { Config } from "@react-router/dev/config"

export default {
  ssr: true,
  future: {
    unstable_optimizeDeps: true,
    v8_viteEnvironmentApi: true,
  },
  // Match the Cloudflare vite plugin's output directory.
  buildDirectory: "dist",
} satisfies Config
