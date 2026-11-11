-- Categories card issuers pay bonus rewards on. They're separate from spending
-- categories because issuers group purchases by merchant type.
CREATE TABLE reward_categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(name)) > 0)
) STRICT;

INSERT INTO reward_categories (name) VALUES
  ('Dining'), ('Groceries'), ('Gas'), ('Travel'), ('Streaming'), ('Drugstores'),
  ('Online shopping'), ('Transit'), ('Entertainment'), ('Home improvement');

-- The rewards and terms of each credit card account.
CREATE TABLE cards (
  account_id INTEGER PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  rewards_currency TEXT NOT NULL CHECK (rewards_currency IN ('cash', 'points', 'miles')),
  -- Cents each point or mile is worth; cash back is always 1.
  point_value REAL NOT NULL CHECK (point_value > 0),
  -- Rewards per dollar on everything else: 1.5 is 1.5% cash back or 1.5 points.
  base_rate REAL NOT NULL CHECK (base_rate >= 0),
  annual_fee INTEGER NOT NULL DEFAULT 0 CHECK (annual_fee >= 0),
  -- The month the annual fee posts, 1–12.
  annual_fee_month INTEGER CHECK (annual_fee_month BETWEEN 1 AND 12),
  foreign_transaction_fee INTEGER NOT NULL DEFAULT 0 CHECK (foreign_transaction_fee IN (0, 1)),
  credit_limit INTEGER CHECK (credit_limit >= 0),
  -- A yearly rate as a fraction.
  apr REAL CHECK (apr >= 0 AND apr < 1),
  statement_due_day INTEGER CHECK (statement_due_day BETWEEN 1 AND 31),
  -- Carrying a balance month to month puts the card in the loan ranking.
  carries_balance INTEGER NOT NULL DEFAULT 0 CHECK (carries_balance IN (0, 1))
) STRICT;

-- Bonus rewards in a category. A year and quarter make it a rotating
-- category that only applies then.
CREATE TABLE card_bonuses (
  id INTEGER PRIMARY KEY,
  card_id INTEGER NOT NULL REFERENCES cards (account_id) ON DELETE CASCADE,
  reward_category_id INTEGER NOT NULL REFERENCES reward_categories (id) ON DELETE RESTRICT,
  rate REAL NOT NULL CHECK (rate >= 0),
  -- Spending the bonus applies to per period, in cents; above it the base rate applies.
  cap INTEGER CHECK (cap > 0),
  cap_period TEXT CHECK (cap_period IN ('month', 'quarter', 'year')),
  condition TEXT NOT NULL DEFAULT '',
  year INTEGER CHECK (year BETWEEN 2000 AND 2100),
  quarter INTEGER CHECK (quarter BETWEEN 1 AND 4),
  CHECK ((cap IS NULL) = (cap_period IS NULL)),
  CHECK ((year IS NULL) = (quarter IS NULL))
) STRICT;

CREATE INDEX card_bonuses_by_card ON card_bonuses (card_id);

-- Statement credits that offset the annual fee, like a yearly dining credit.
CREATE TABLE card_credits (
  id INTEGER PRIMARY KEY,
  card_id INTEGER NOT NULL REFERENCES cards (account_id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  annual_value INTEGER NOT NULL CHECK (annual_value >= 0)
) STRICT;
