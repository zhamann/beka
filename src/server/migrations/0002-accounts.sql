-- Every account the household tracks. Loans and credit cards are accounts too;
-- their extra details live in their own tables.
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(name)) > 0),
  kind TEXT NOT NULL CHECK (
    kind IN ('checking', 'savings', 'brokerage', 'retirement', 'hsa', 'asset', 'loan', 'credit_card')
  ),
  -- A finer description, like "Roth IRA", "Home", or "Vehicle".
  subtype TEXT NOT NULL DEFAULT '',
  institution TEXT NOT NULL DEFAULT '',
  last4 TEXT NOT NULL DEFAULT '' CHECK (last4 = '' OR (length(last4) = 4 AND last4 NOT GLOB '*[^0-9]*')),
  -- No owner means the account is joint.
  owner_id INTEGER REFERENCES members (id) ON DELETE RESTRICT,
  notes TEXT NOT NULL DEFAULT '',
  -- Closed accounts and paid-off loans are archived, not deleted.
  archived_at TEXT
) STRICT;

-- Balances are entered by hand and every update is kept. Debts (loans and
-- cards) store the amount owed as a positive number.
CREATE TABLE balances (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  as_of TEXT NOT NULL,
  recorded_at TEXT NOT NULL
) STRICT;

CREATE INDEX balances_by_account ON balances (account_id, as_of DESC, id DESC);
