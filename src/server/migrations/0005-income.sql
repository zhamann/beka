-- Jobs paid through payroll. Pay settings the calculator reads are stored as
-- JSON in the shapes of `src/lib/paycheck/paycheck.ts`.
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members (id) ON DELETE RESTRICT,
  employer TEXT NOT NULL CHECK (length(trim(employer)) > 0),
  -- {"type":"salary","annual":…} or {"type":"hourly","rate":…,"hoursPerPeriod":…,"overtimeHours":…}
  pay TEXT NOT NULL,
  schedule TEXT NOT NULL,
  business_day_rule TEXT NOT NULL CHECK (business_day_rule IN ('previous', 'next', 'none')),
  w4 TEXT NOT NULL,
  state_tax TEXT,
  local_tax TEXT,
  deductions TEXT NOT NULL DEFAULT '[]',
  employer_contributions TEXT NOT NULL DEFAULT '[]',
  bonus TEXT,
  -- Where the paycheck lands, after any splits.
  deposit_account_id INTEGER REFERENCES accounts (id) ON DELETE RESTRICT
) STRICT;

-- Parts of a paycheck sent to other accounts, applied in position order.
CREATE TABLE job_splits (
  id INTEGER PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  account_id INTEGER NOT NULL REFERENCES accounts (id) ON DELETE RESTRICT,
  mode TEXT NOT NULL CHECK (mode IN ('percent', 'amount')),
  value REAL NOT NULL CHECK (value > 0)
) STRICT;

-- Income outside payroll, entered as the amount deposited:
-- pensions, Social Security, rent, side work.
CREATE TABLE other_income (
  id INTEGER PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members (id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  amount INTEGER NOT NULL CHECK (amount > 0),
  schedule TEXT NOT NULL,
  business_day_rule TEXT NOT NULL CHECK (business_day_rule IN ('previous', 'next', 'none')),
  taxable INTEGER NOT NULL CHECK (taxable IN (0, 1)),
  account_id INTEGER REFERENCES accounts (id) ON DELETE RESTRICT
) STRICT;
