-- The terms of each loan account. The balance owed lives in `balances`.
CREATE TABLE loans (
  account_id INTEGER PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  loan_type TEXT NOT NULL CHECK (loan_type IN ('mortgage', 'auto', 'student', 'personal', 'other')),
  -- A yearly rate as a fraction, like 0.0924 for 9.24%.
  interest_rate REAL NOT NULL CHECK (interest_rate >= 0 AND interest_rate < 1),
  minimum_payment INTEGER NOT NULL CHECK (minimum_payment >= 0),
  due_day INTEGER CHECK (due_day BETWEEN 1 AND 31),
  original_amount INTEGER CHECK (original_amount >= 0),
  -- The part of a mortgage payment that goes to taxes and insurance.
  escrow INTEGER CHECK (escrow >= 0)
) STRICT;
