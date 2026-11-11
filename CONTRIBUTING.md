# Contributing

Thanks for helping with Beka. Bug reports, ideas, and pull requests are all welcome.

## Getting started

Requires Node 26 and pnpm.

```sh
pnpm install
pnpm dev
pnpm seed sample/seed.json   # in another terminal: a made-up household to work with
```

## Before opening a pull request

- Read [AGENTS.md](AGENTS.md). It's written for AI coding agents, but it's also the project's conventions for everyone: the stack, UI rules, how data is stored, and how changes are made.
- Run the checks CI runs: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, and `pnpm test`.
- Add tests with your change, and update the README when behavior changes.
- Title the PR in [Conventional Commits](https://www.conventionalcommits.org) style (`feat:`, `fix:`, `docs:`, …). PRs are squash-merged, so the title becomes the commit message and the release notes entry.
- Never include real financial data. Use made-up values, like the household in `sample/`.

## Releasing

1. Set `version` in `package.json` and merge that change.
2. Tag the merge commit `v<version>` and push the tag.

The release workflow runs CI, publishes a multi-platform image to `ghcr.io/zhamann/beka`, and creates a GitHub release with generated notes.
