-- Spending categories. The type decides where a category's transactions
-- count: in Spend, as income, or nowhere (transfers, card payments, …).
CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(name)) > 0),
  type TEXT NOT NULL CHECK (type IN ('spending', 'income', 'excluded')),
  hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
  -- Built-in categories (Uncategorized) can't be renamed or deleted.
  builtin INTEGER NOT NULL DEFAULT 0 CHECK (builtin IN (0, 1))
) STRICT;

INSERT INTO categories (name, type) VALUES
  ('Auto & Transport', 'spending'),
  ('Bills & Utilities', 'spending'),
  ('Business', 'spending'),
  ('Cash & Checks', 'spending'),
  ('Charitable Donations', 'spending'),
  ('Credit Card Payment', 'excluded'),
  ('Dining & Drinks', 'spending'),
  ('Education', 'spending'),
  ('Entertainment & Rec.', 'spending'),
  ('Family Care', 'spending'),
  ('Fees', 'spending'),
  ('Gifts', 'spending'),
  ('Groceries', 'spending'),
  ('Health & Wellness', 'spending'),
  ('Home & Garden', 'spending'),
  ('Ignore', 'excluded'),
  ('Income', 'income'),
  ('Internal Transfers', 'excluded'),
  ('Investment', 'excluded'),
  ('Legal', 'spending'),
  ('Loan Payment', 'spending'),
  ('Medical', 'spending'),
  ('Personal Care', 'spending'),
  ('Pets', 'spending'),
  ('Reimbursement', 'excluded'),
  ('Savings Transfer', 'excluded'),
  ('Shopping', 'spending'),
  ('Software & Tech', 'spending'),
  ('Taxes', 'spending'),
  ('Travel & Vacation', 'spending');

-- Uncategorized counts as spending, so Net isn't overstated before it's sorted.
INSERT INTO categories (name, type, builtin) VALUES ('Uncategorized', 'spending', 1);

-- Each upload, so it can be undone.
CREATE TABLE imports (
  id INTEGER PRIMARY KEY,
  imported_at TEXT NOT NULL,
  actor TEXT NOT NULL CHECK (actor IN ('app', 'agent')),
  file_name TEXT NOT NULL DEFAULT '',
  added INTEGER NOT NULL,
  skipped INTEGER NOT NULL
) STRICT;

CREATE TABLE transactions (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  account_id INTEGER NOT NULL REFERENCES accounts (id) ON DELETE RESTRICT,
  -- A clean name like "Walmart" that groups a merchant's transactions.
  merchant TEXT NOT NULL CHECK (length(trim(merchant)) > 0),
  -- The original text from the bank.
  description TEXT NOT NULL,
  -- Cents: negative is money out, positive is money in.
  amount INTEGER NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  notes TEXT NOT NULL DEFAULT '',
  -- Undoing an import deletes its transactions.
  import_id INTEGER REFERENCES imports (id) ON DELETE CASCADE
) STRICT;

CREATE INDEX transactions_by_date ON transactions (date);
CREATE INDEX transactions_by_merchant ON transactions (merchant COLLATE NOCASE);
CREATE INDEX transactions_by_category ON transactions (category_id, date);
CREATE INDEX transactions_for_duplicates ON transactions (account_id, date, amount);
