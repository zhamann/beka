// @ts-check

import node from "@astrojs/node"
import react from "@astrojs/react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "astro/config"

// https://astro.build/config
export default defineConfig({
  output: "server",
  // Room for the largest backup a restore accepts.
  adapter: node({ mode: "standalone", bodySizeLimit: 201 * 1024 * 1024 }),
  integrations: [react()],
  security: {
    // Trust the Host and X-Forwarded-* headers, so origin checks and secure
    // cookies follow the address people open Beka at, behind a reverse proxy
    // too. Middleware decides which hosts are answered without a password.
    allowedDomains: [{ protocol: "http" }, { protocol: "https" }],
    // A year of transactions, or a whole backup, goes up in one action call.
    actionBodySizeLimit: 16 * 1024 * 1024,
  },
  vite: {
    plugins: [tailwindcss()],
  },
})
