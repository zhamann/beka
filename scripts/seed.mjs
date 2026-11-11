// Loads a seed file into a running dev server: `pnpm dev`, then
// `pnpm seed sample/seed.json` (add --replace to start over).
// A seed's "transactions" may name a CSV file next to it.
import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

const args = process.argv.slice(2)
const file = args.find((arg) => !arg.startsWith("--"))
const replace = args.includes("--replace")
const url = args.find((arg) => arg.startsWith("--url="))?.slice(6) ?? "http://localhost:4321"
if (!file) {
  console.error("Usage: pnpm seed <seed.json> [--replace] [--url=http://localhost:4321]")
  process.exit(1)
}

const seed = JSON.parse(readFileSync(file, "utf8"))
if (typeof seed.transactions === "string") {
  const csv = resolve(dirname(file), seed.transactions)
  if (existsSync(csv)) seed.transactions = readFileSync(csv, "utf8")
}

const response = await fetch(`${url}/dev/seed${replace ? "?replace=1" : ""}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: url },
  body: JSON.stringify(seed),
})
const body = await response.text()
if (!response.ok) {
  console.error(`Seeding failed: ${body}`)
  process.exit(1)
}
console.log(`Seeded ${JSON.parse(body).steps.join(", ")}.`)
