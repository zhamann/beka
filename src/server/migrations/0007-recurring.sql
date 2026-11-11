-- Payments that repeat on a schedule. Their transactions keep their own
-- categories; being linked here is what flags them as recurring.
CREATE TABLE recurring (
  id INTEGER PRIMARY KEY,
  -- Transactions from this merchant (case-insensitive) belong to it.
  merchant TEXT NOT NULL CHECK (length(trim(merchant)) > 0),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  frequency TEXT NOT NULL CHECK (
    frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'yearly')
  ),
  -- 'near' takes only charges near `reference_amount`, for merchants that also
  -- have one-off purchases; 'any' takes every charge, for bills that swing.
  match_mode TEXT NOT NULL CHECK (match_mode IN ('any', 'near')),
  reference_amount INTEGER CHECK (reference_amount > 0),
  -- The amount counted: the latest charge, or the last year's average.
  amount_mode TEXT NOT NULL CHECK (amount_mode IN ('latest', 'average')),
  -- For payments entered by hand, which may have no transactions.
  manual_amount INTEGER CHECK (manual_amount > 0),
  -- A date it's charged, for payments entered by hand.
  anchor_date TEXT,
  category_id INTEGER REFERENCES categories (id) ON DELETE SET NULL,
  account_id INTEGER REFERENCES accounts (id) ON DELETE SET NULL,
  -- A card's annual fee follows the card.
  card_id INTEGER UNIQUE REFERENCES cards (account_id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('suggested', 'active', 'ended', 'dismissed')),
  -- When someone last said it's still going, to quiet "did it end?".
  checked_at TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX recurring_by_merchant ON recurring (merchant COLLATE NOCASE);

ALTER TABLE transactions ADD COLUMN recurring_id INTEGER REFERENCES recurring (id) ON DELETE SET NULL;
-- Set when someone unflags a charge, so it isn't linked again.
ALTER TABLE transactions ADD COLUMN not_recurring INTEGER NOT NULL DEFAULT 0 CHECK (not_recurring IN (0, 1));

CREATE INDEX transactions_by_recurring ON transactions (recurring_id);
