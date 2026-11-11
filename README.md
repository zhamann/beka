# Beka

A self-hosted app that shows your household's current financial picture: what each paycheck deposits, what you spend by category each month, your recurring payments, accounts and net worth, loans ranked by interest rate, and which credit card earns the most where.

Beka shows where things stand today; it doesn't plan or forecast. Its data is available to an AI agent so you can ask questions about your finances.

The name is the beka of Exodus 38:26, half a shekel paid by "every one that went to be numbered": money for counting a household.

## What it tracks

- **Dashboard**: your month at a glance. Income (take-home a month) minus Recurring and Spend (a 12-month average) equals what's left over, with a strip showing how your take-home splits; this month's spending in each category against its average and an even pace for the day; net worth from your latest balances; deposits and recurring charges in the next two weeks; and anything that needs updating, like an old balance, a month of transactions not imported yet, or a recurring payment that may have ended.
- **Income**: each job's pay, pay schedule, Form W-4, state and local tax, deductions (401(k), HSA, insurance premiums, …), employer contributions, bonus, and deposit splits. Beka works out federal withholding, Social Security, and Medicare the way payroll does, so you see exactly what each paycheck deposits and where the rest of your gross goes, with a calendar of every deposit this year that checks each one against the deposits you've uploaded, matching each payer's deposit to its own transaction. Income outside payroll, like a pension or rent, is entered as the amount deposited.
- **Transactions**: upload a CSV of already-categorized transactions (date, merchant, description, amount, category, account, notes). A preview flags problems and rows categorized differently than usual before anything is saved, transactions already imported are skipped, and any import can be undone. Something no upload will carry, like a cash purchase, can be added by hand. The Import page gives you instructions for the AI that prepares your uploads, including how you've categorized each merchant so far. Categories start from Rocket Money's list and are each counted as spending, income, or excluded (transfers, card payments, investing); manage them in Settings → Categories.
- **Spending**: what you spend in each category each month over the last 12 complete months (or any calendar year), with each category's monthly average and share, a chart of monthly totals, and this month so far shown apart. Recurring payments are left out so the numbers match the Dashboard; a toggle adds them back. Click any amount to see its transactions.
- **Recurring**: payments that repeat, like subscriptions, utilities, insurance, and loan payments. Beka spots merchants charging on a steady schedule and asks once whether each is recurring; after that their charges are flagged automatically (they keep their categories). Bills that swing count at their yearly average, yearly payments count a twelfth a month, card annual fees are added for you, and Beka asks when an expected charge stops showing up. You can add payments your uploads won't show by hand.
- **Accounts**: checking, savings, brokerage, retirement, HSA, and property like your home or vehicles. You enter balances by hand with the date they were true; every update is kept as history, and closed accounts can be archived. Each group shows its total, and together they add up to your net worth.
- **Loans**: interest rate, minimum payment, and balance owed for each loan, ranked by interest rate (or smallest balance) so you know where extra cash should go, with each loan's monthly interest cost.
- **Cards**: each card's rewards (cash back or points at the value you choose, bonus categories with caps and conditions, rotating quarterly categories), fees, and credits, with a "Which card?" guide showing the best card for each category. Cards that carry a balance join the loan ranking at their APR.
- **Light and dark themes**: follow the device, or pick one in Settings → Appearance. Each device remembers its choice.

## Development

Requires Node 26 and pnpm.

```sh
pnpm install
pnpm dev
```

## License

[AGPL-3.0](LICENSE)
