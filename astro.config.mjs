// @ts-check

import node from "@astrojs/node"
import react from "@astrojs/react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, fontProviders } from "astro/config"

/**
 * The Unicode range Fontsource gives its latin-ext files.
 * @type {[string, ...string[]]}
 */
const latinExt = [
  "U+0100-02BA",
  "U+02BD-02C5",
  "U+02C7-02CC",
  "U+02CE-02D7",
  "U+02DD-02FF",
  "U+0304",
  "U+0308",
  "U+0329",
  "U+1D00-1DBF",
  "U+1E00-1E9F",
  "U+1EF2-1EFF",
  "U+2020",
  "U+20A0-20AB",
  "U+20AD-20C0",
  "U+2113",
  "U+2C60-2C7F",
  "U+A720-A7FF",
]

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
  // Preloaded in the layout and `optional`, so text never changes font after it's
  // drawn. Files come from the installed packages, so builds download nothing.
  // latin-ext is a family of its own because preloading can't pick one file
  // from several of the same weight and style.
  fonts: [
    {
      name: "Figtree",
      cssVariable: "--font-figtree",
      provider: fontProviders.local(),
      display: "optional",
      fallbacks: ["sans-serif"],
      options: {
        variants: [
          {
            src: [
              "@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2",
            ],
            weight: "300 900",
            style: "normal",
          },
        ],
      },
    },
    {
      name: "Figtree Extended",
      cssVariable: "--font-figtree-extended",
      provider: fontProviders.local(),
      display: "optional",
      fallbacks: [],
      options: {
        variants: [
          {
            src: [
              "@fontsource-variable/figtree/files/figtree-latin-ext-wght-normal.woff2",
            ],
            weight: "300 900",
            style: "normal",
            unicodeRange: latinExt,
          },
        ],
      },
    },
    {
      name: "Gabarito",
      cssVariable: "--font-gabarito",
      provider: fontProviders.local(),
      display: "optional",
      fallbacks: ["sans-serif"],
      options: {
        variants: [
          {
            src: [
              "@fontsource-variable/gabarito/files/gabarito-latin-wght-normal.woff2",
            ],
            weight: "400 900",
            style: "normal",
          },
        ],
      },
    },
    {
      name: "Gabarito Extended",
      cssVariable: "--font-gabarito-extended",
      provider: fontProviders.local(),
      display: "optional",
      fallbacks: [],
      options: {
        variants: [
          {
            src: [
              "@fontsource-variable/gabarito/files/gabarito-latin-ext-wght-normal.woff2",
            ],
            weight: "400 900",
            style: "normal",
            unicodeRange: latinExt,
          },
        ],
      },
    },
  ],
  vite: {
    plugins: [tailwindcss()],
  },
})
