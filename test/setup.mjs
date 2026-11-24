import { plugin } from "bun"

// `astro:actions` exists only inside Astro's build, so load the module it resolves to.
plugin({
  name: "astro:actions",
  setup(build) {
    build.module("virtual:astro:actions/options", () => ({
      exports: { shouldAppendTrailingSlash: false },
      loader: "object",
    }))
    build.module("astro:actions", async () => ({
      exports: await import("astro/actions/runtime/entrypoints/server.js"),
      loader: "object",
    }))
  },
})

// The app runs on Node, so the process `query_database` starts does here too.
process.execPath = "node"
