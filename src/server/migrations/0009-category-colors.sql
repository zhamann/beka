-- The color a category wears in spending lists and charts: one of the eight
-- `category-N` theme colors.
ALTER TABLE categories
  ADD COLUMN color INTEGER NOT NULL DEFAULT 1 CHECK (color BETWEEN 1 AND 8);

-- Hand the colors out in turn, biggest spending first, so the categories a
-- household uses most start out distinct. Before there are transactions, the
-- usual big ones go first, each on a color that suits it.
UPDATE categories SET color = (
  SELECT (ranked.position - 1) % 8 + 1
  FROM (
    SELECT c.id, row_number() OVER (
      ORDER BY
        c.type = 'spending' DESC,
        coalesce(
          (SELECT -sum(t.amount) FROM transactions t WHERE t.category_id = c.id),
          0
        ) DESC,
        CASE c.name
          WHEN 'Auto & Transport' THEN 1
          WHEN 'Dining & Drinks' THEN 2
          WHEN 'Groceries' THEN 3
          WHEN 'Bills & Utilities' THEN 4
          WHEN 'Shopping' THEN 5
          WHEN 'Home & Garden' THEN 6
          WHEN 'Travel & Vacation' THEN 7
          WHEN 'Health & Wellness' THEN 8
          ELSE 9
        END,
        c.id
    ) AS position
    FROM categories c
  ) ranked
  WHERE ranked.id = categories.id
);
