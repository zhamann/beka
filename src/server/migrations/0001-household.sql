-- App-wide settings as key/value pairs.
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

-- The people in the household. Income belongs to one member; accounts belong
-- to a member or, with no member, to the whole household (joint).
CREATE TABLE members (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(name)) > 0),
  -- Raises 401(k) and HSA limits at catch-up ages.
  birth_year INTEGER CHECK (birth_year BETWEEN 1900 AND 2100)
) STRICT;

-- Every change, made in the app or by the agent, with before and after values
-- as JSON.
CREATE TABLE activity (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  actor TEXT NOT NULL CHECK (actor IN ('app', 'agent')),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  summary TEXT NOT NULL,
  before TEXT,
  after TEXT
) STRICT;

CREATE INDEX activity_at ON activity (at DESC, id DESC);
