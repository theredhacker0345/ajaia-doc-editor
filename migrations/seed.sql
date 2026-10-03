-- Seeded demo accounts (mock auth: reviewers sign in with one click, no passwords).
-- Fixed IDs keep automated smoke tests deterministic.
-- All statements are idempotent, so re-running is safe.

INSERT OR IGNORE INTO users (id, name, email, color) VALUES
  ('u-ubaid',  'Ubaid ur Rehman', 'ubaid@aajaia.dev',  '#4f46e5'),
  ('u-aisha',  'Aisha Khan',      'aisha@aajaia.dev',  '#e8710a'),
  ('u-carlos', 'Carlos Mendez',   'carlos@aajaia.dev', '#188038'),
  ('u-priya',  'Priya Sharma',    'priya@aajaia.dev',  '#9334e6');
