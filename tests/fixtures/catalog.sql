-- TEST FIXTURE ONLY. Invented stores and products for automated tests (tests/support/d1.ts).
-- Never load this into a real database (AGENTS.md rule 11). Real stores come only from real sellers.
-- Gate 4 seed: two demo stores for the Try page and tests. Runs on local and sandbox only.
-- The payee emails are placeholders until the founder creates the US sandbox seller accounts (deferred-setup S-05);
-- replace them with: UPDATE sellers SET paypal_email = '<sandbox email>' WHERE id = 'sel_demo_maya';
-- Prices are confirmed (INV-03). Photos are added in task T-23 with photos the founders own.

INSERT INTO sellers (id, paypal_account_id, paypal_email, display_name, created_at) VALUES
  ('sel_demo_maya',  'DEMO-MAYA',  'sb-maya-seller@example.com',  'Maya (demo)',  '2026-11-11T00:00:00Z'),
  ('sel_demo_river', 'DEMO-RIVER', 'sb-river-seller@example.com', 'River (demo)', '2026-11-11T00:00:00Z');

INSERT INTO stores (id, seller_id, slug, name, refund_policy, shipping_cents, currency, is_demo, created_at) VALUES
  ('sto_demo_maya',  'sel_demo_maya',  'maya-mugs',    'Maya Mugs',    'Refunds within 14 days.', 600, 'USD', 1, '2026-11-11T00:00:00Z'),
  ('sto_demo_river', 'sel_demo_river', 'river-prints', 'River Prints', 'Refunds within 30 days if unframed.', 800, 'USD', 1, '2026-11-11T00:00:00Z');

INSERT INTO products (id, store_id, title, description, category, state, ai_fields_json, search_text, created_at, updated_at) VALUES
  ('prd_demo_mug',     'sto_demo_maya',  'Blue speckled mug', 'Hand-thrown stoneware, glazed in speckled blue. Holds about 350 ml. Dishwasher safe.', 'ceramics', 'published', '[]', 'blue speckled mug hand-thrown stoneware ceramics small large', '2026-11-11T00:00:00Z', '2026-11-11T00:00:00Z'),
  ('prd_demo_espresso','sto_demo_maya',  'Cobalt espresso cup, set of 2', 'Two small cups in a deep cobalt glaze.', 'ceramics', 'published', '[]', 'cobalt espresso cup set blue ceramics', '2026-11-11T00:00:00Z', '2026-11-11T00:00:00Z'),
  ('prd_demo_bowl',    'sto_demo_maya',  'Small bowl', 'A small bowl for olives or rings, speckled blue.', 'ceramics', 'published', '[]', 'small bowl speckled blue ceramics', '2026-11-11T00:00:00Z', '2026-11-11T00:00:00Z'),
  ('prd_demo_pourover','sto_demo_maya',  'Pour-over set', 'Dripper and cup in natural clay.', 'ceramics', 'published', '[]', 'pour-over set coffee dripper natural ceramics', '2026-11-11T00:00:00Z', '2026-11-11T00:00:00Z'),
  ('prd_demo_river',   'sto_demo_river', 'Riverbend print, A3, signed', 'Risograph print in two blues on 170 gsm paper.', 'prints', 'published', '[]', 'riverbend print a3 signed risograph blue prints', '2026-11-11T00:00:00Z', '2026-11-11T00:00:00Z'),
  ('prd_demo_heron',   'sto_demo_river', 'Heron print, A4', 'Risograph print, one colour.', 'prints', 'published', '[]', 'heron print a4 risograph prints', '2026-11-11T00:00:00Z', '2026-11-11T00:00:00Z');

INSERT INTO variants (id, product_id, sku, options_json, price_cents, stock, position) VALUES
  ('var_demo_mug_s',  'prd_demo_mug',      'MUG-BLUE-S', '{"Size":"Small"}', 2400, 8, 0),
  ('var_demo_mug_l',  'prd_demo_mug',      'MUG-BLUE-L', '{"Size":"Large"}', 3200, 5, 1),
  ('var_demo_esp',    'prd_demo_espresso', 'ESP-COB-2',  '{"Set":"2 cups"}', 3600, 4, 0),
  ('var_demo_bowl',   'prd_demo_bowl',     'BOWL-S',     '{"Glaze":"Speckled blue"}', 1800, 10, 0),
  ('var_demo_pour',   'prd_demo_pourover', 'POUR-NAT',   '{"Clay":"Natural"}', 5800, 0, 0),
  ('var_demo_river',  'prd_demo_river',    'RIV-A3',     '{"Size":"A3"}', 4500, 20, 0),
  ('var_demo_heron',  'prd_demo_heron',    'HER-A4',     '{"Size":"A4"}', 2800, 20, 0);
