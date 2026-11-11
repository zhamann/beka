# Beka

Beka is a self-hosted app that shows a household's current financial state: what each paycheck deposits, monthly spending by category, recurring payments, accounts and net worth, loans ranked by interest rate, and which credit card to use where. It doesn't plan or forecast; a separate AI agent answers questions using the data stored here. It must work well on phones, tablets, and desktops.

The app is built for any household that self-hosts it, so every optional detail (HSA, bonuses, employer match, …) stays optional.

## Stack

- Astro 7 with server rendering (`@astrojs/node`, standalone) and React 19 islands for interactive UI.
- shadcn/ui, `base-luma` style (Base UI primitives), Tabler icons, Tailwind CSS 4.
- Node 26 (see `.node-version`), pnpm.

## Commands

- `pnpm dev`: start the dev server.
- `pnpm build` / `pnpm start`: build and run the production server.
- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`: the checks CI runs.

## UI conventions

- Build UI from shadcn components. Add them with `pnpm dlx shadcn@latest add <name>`.
- Never edit files in `src/components/ui/` or `src/hooks/use-mobile.ts`; they must stay updatable through the CLI, so lint and Prettier skip them.
- App components compose shadcn components. Their own classes are limited to layout, spacing, and text size; no hand-built controls, menus, dialogs, or one-off colors.
- To style a link as a button, use `cn(buttonVariants({ ... }))`. `buttonVariants` alone doesn't resolve conflicting classes, so variants like `outline` lose their border.
- Theme changes belong in `src/styles/global.css` as tokens. Use theme tokens (`primary`, `muted-foreground`, …), never raw colors.
- Every screen must work at phone, tablet, and desktop widths.
- The look is a household statement in greenback ink: cool paper with the sidebar in a note's deep green in light mode, a note's back at night in dark mode. Cards and tables are sheets (`bg-card`) laid on the page (`background`). Headings and big figures use `font-heading` (Spectral); everything else the default sans (Public Sans).
- A page's answer is set as a sum with `Statement` (Income − Recurring − Spend = Left over on the Dashboard, Assets − Debts = Net worth on Accounts), and `Strip` shows how a whole splits into parts, toned `chart-1` (darkest) to `chart-4`. Totals sit over a double rule (`ledger-total`), subtotals under a single one (`ledger-subtotal`). Figures that aren't a sum are `Stat`s, unboxed, separated by a rule.
- Phones get a tab bar along the bottom (`MobileTabs`), with More opening the sidebar; tablets and desktops get the sidebar, which collapses to icons. Pages under another page get a back link from their `breadcrumb`.
- Show money with `formatMoney`, which writes negatives with a true minus sign. Money coming in (deposits, paychecks, income transactions) is `text-primary`; money going out stays in the foreground color. Join details with commas, not middle dots.
- Text that carries information is at least `text-sm`; keep `text-xs` for code and incidental detail.
- The logo is `src/components/beka-mark.tsx`, mirrored in `public/favicon.svg`; keep them in sync.
- Forms live in a `FormDialog` (`src/components/form-dialog.tsx`) built from the field helpers in `src/components/form-fields.tsx`; destructive actions go through `ConfirmDelete`.
- In `.astro` files, shadcn's `render` prop doesn't work (Astro JSX isn't React). Put anything that needs it in a React component, like `LinkItem`.

## Data

- SQLite through Node's built-in `node:sqlite`, stored at `$DATA_DIR/beka.db` (default `./data`).
- Each domain has a module in `src/server/` that owns its reads and writes. The schema enforces the rules; modules translate violations into `BekaError`s with messages a person can read.
- Every change runs in a transaction and calls `logChange` so it shows up in the activity log. `runAs("agent", …)` marks changes the agent makes.
- Money is stored as integer cents. Dates are `YYYY-MM-DD` text.
- Schema changes are new numbered files in `src/server/migrations/`, applied in order at startup. Never edit a shipped migration.
- Mutations are operations in `src/actions/` (`op({ description, input, handler })`), validated with `astro/zod` and wrapped in `run`, which maps `BekaError`s to action errors. `src/actions/index.ts` turns each into an Astro Action for the app and lists them in `operations`, which the agent's MCP tools reuse, so every new operation needs a description written for an AI agent. After a successful mutation the client reloads, so pages always render from the database.
- Tests use Vitest against an in-memory database (`openDatabase(":memory:")`).

## Paycheck calculator

- `src/lib/paycheck/` is a pure library (no database) that turns a job's settings into every paycheck of a year: federal withholding by the IRS percentage method for 2020-or-later Forms W-4, Social Security up to the wage base, Medicare with the additional 0.9%, state and local tax as a percent or flat amount, deductions with their tax treatment, and 401(k)/HSA limits with catch-up ages.
- Figures by tax year live in `tax-years.ts`. Add each new year from Publication 15-T and the IRS limit notices, copying the tables verbatim; tests check withholding against hand-worked examples.
- Paydays come from `schedule.ts`: weekend and Federal Reserve holiday paydays move to the previous (or next) business day.

## Transactions

- Amounts are cents with negative meaning money out. A category's type (`spending`, `income`, `excluded`) decides where its transactions count; `Uncategorized` is built in and counts as spending.
- Uploads go through `previewImport` (nothing saved) and then `importTransactions`. Duplicates are rows already stored with the same account, date, amount, and description; repeats inside one file are kept.
- `aiInstructions` builds the guide for the AI that prepares uploads from the current categories, accounts, and each merchant's category history.

## Recurring

- A recurring payment is one merchant charging on a schedule. Linking a transaction to it (`transactions.recurring_id`) is what flags it; its category doesn't change. `not_recurring` records charges someone unflagged so they aren't linked again.
- Imports call `linkRecurring` and then `suggestRecurring`, which saves `suggested` rows for people to confirm or dismiss. Detection takes every charge for bills that swing (one per period) and amount clusters otherwise, and passes `on` (today) so tests don't depend on the clock.
- Card annual fees are kept in step by `syncCardFee` whenever a card is saved.

## Agent access

- `/mcp` is a stateless MCP endpoint (JSON-RPC over HTTP POST) protected by agent keys from Settings; it skips the household password. Tools are in `src/server/agent/tools.ts`: read tools for computed views (overview, income, spending, recurring, debts, which card), a read-only `query_database` (run in its own process by `query.ts`, with an authorizer that allows only reads and a 5-second limit), `import_transactions_csv`, and every operation as a snake_case tool. Tools run inside `runAs("agent")`.

## Access

- Setting `BEKA_PASSWORD` makes every device sign in once (`src/middleware.ts`). The session cookie is derived from the password, so changing it signs everyone out.
- Without a password, the middleware answers only at hosts `isTrustedHost` accepts (private names, IP addresses, and `BEKA_HOSTS`), so another site can't reach the app through DNS rebinding.

## Git and pull requests

- All changes land through pull requests; never push to `main`.
- Branch names: `<type>/<short-description>`, e.g. `feat/spending-page`.
- PR titles and commit messages follow Conventional Commits (`feat:`, `fix:`, `chore:`, `build:`, `docs:`, `test:`, `refactor:`).
- PRs are squash-merged once CI passes.
- Each PR carries its own tests and README updates.
- Never commit real financial data. Personal seed files go in `local/`, which git ignores; `sample/` holds the made-up household for development and screenshots (`pnpm seed sample/seed.json` against `pnpm dev`). Don't add Playwright as a dependency.
