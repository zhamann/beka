-- Keys an AI agent uses to reach the app over MCP. Only a hash is stored.
CREATE TABLE agent_keys (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_used_at TEXT
) STRICT;
