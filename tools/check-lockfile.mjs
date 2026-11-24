// Two things `bun ci` lets through: a bun.lock that no longer matches package.json
// exactly, and newly locked versions younger than bunfig.toml's minimumReleaseAge.
import { spawnSync } from "node:child_process"
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const problems = []

const { workspaces = [] } = JSON.parse(readFileSync("package.json", "utf8"))
const scratch = mkdtempSync(join(tmpdir(), "lockfile-"))
try {
  for (const file of [
    "package.json",
    "bun.lock",
    "bunfig.toml",
    ...workspaces.map((path) => `${path}/package.json`),
  ])
    cpSync(file, join(scratch, file))
  const install = spawnSync(
    process.execPath,
    ["install", "--lockfile-only", "--ignore-scripts"],
    { cwd: scratch, encoding: "utf8" }
  )
  if (install.status !== 0) problems.push(install.stderr.trim())
  else if (
    readFileSync(join(scratch, "bun.lock"), "utf8") !==
    readFileSync("bun.lock", "utf8")
  )
    problems.push("bun.lock doesn't match package.json. Run `bun install`.")
} finally {
  rmSync(scratch, { recursive: true })
}

// CI checks out a pull request merged into its base, so the first parent is the base.
const base = process.env.CI ? "HEAD^" : "origin/main"
if (spawnSync("git", ["rev-parse", "--verify", base]).status !== 0)
  problems.push(`Can't compare bun.lock with ${base}: no such commit here.`)
const before = spawnSync("git", ["show", `${base}:bun.lock`], {
  encoding: "utf8",
  maxBuffer: 1e8,
})
const { minimumReleaseAge, minimumReleaseAgeExcludes = [] } = Bun.TOML.parse(
  readFileSync("bunfig.toml", "utf8")
).install

if (before.status === 0) {
  const known = versions(before.stdout)
  const added = [...versions(readFileSync("bun.lock", "utf8"))].filter(
    (id) => !known.has(id)
  )
  await Promise.all(added.map(checkAge))
}

if (problems.length > 0) {
  console.error(problems.join("\n"))
  process.exit(1)
}

/** Every registry package in a lockfile, as `name@version`. */
function versions(lockfile) {
  const { packages } = JSON.parse(lockfile.replace(/,(\s*[}\]])/g, "$1"))
  return new Set(
    Object.values(packages)
      .map(([id]) => id)
      .filter((id) => /@\d+\.\d+\.\d+[^/:]*$/.test(id))
  )
}

async function checkAge(id) {
  const at = id.lastIndexOf("@")
  const name = id.slice(0, at)
  if (minimumReleaseAgeExcludes.includes(name)) return
  const response = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(name)}`
  )
  const published = response.ok
    ? (await response.json()).time?.[id.slice(at + 1)]
    : undefined
  if (!published) problems.push(`Can't find when ${id} was published.`)
  else if (Date.now() - Date.parse(published) < minimumReleaseAge * 1000)
    problems.push(`${id} is too new: it was published ${published}.`)
}
