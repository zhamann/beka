# Security

Beka holds a household's financial details, so security reports are welcome.

## Reporting a vulnerability

Report it privately through [GitHub's vulnerability reporting](https://github.com/zhamann/beka/security/advisories/new) rather than in a public issue. Include what you found, how to reproduce it, and which version or commit you tested. You'll get a reply within a week.

## Supported versions

Fixes go into the latest release. Upgrade with `docker compose pull && docker compose up -d`.

## How Beka is meant to be run

Beka is built for one household on a private network. See [Keeping it private](README.md#keeping-it-private) for what the password, host check, and agent keys protect. Reports about running it on the open internet without `BEKA_PASSWORD` or HTTPS are still useful, but that setup isn't supported.
