-- Initial schema for Reino del Umbral
-- This runs automatically on first `docker compose up`

CREATE TABLE IF NOT EXISTS accounts (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  active_game_session_id VARCHAR(100),
  active_game_session_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS characters (
  id            SERIAL PRIMARY KEY,
  account_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name          VARCHAR(50) UNIQUE NOT NULL,
  race          VARCHAR(20) NOT NULL,
  class         VARCHAR(20) NOT NULL,
  level         INTEGER DEFAULT 1,
  experience    INTEGER DEFAULT 0,
  hp_current    INTEGER DEFAULT 100,
  hp_max        INTEGER DEFAULT 100,
  map_id        VARCHAR(50) DEFAULT 'town',
  pos_x         INTEGER DEFAULT 0,
  pos_y         INTEGER DEFAULT 0,
  id_body             INTEGER NOT NULL DEFAULT 56,
  id_head             INTEGER NOT NULL DEFAULT 1,
  id_helmet           INTEGER NOT NULL DEFAULT 4,
  gold                INTEGER DEFAULT 0,
  equipped_weapon_id  INTEGER DEFAULT NULL,
  quest_slime_kills   INTEGER NOT NULL DEFAULT 0,
  quest_slime_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS item_templates (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  type          VARCHAR(30) NOT NULL,
  stackable     BOOLEAN DEFAULT FALSE,
  max_stack     INTEGER DEFAULT 1,
  sell_value    INTEGER DEFAULT 0,
  metadata_json JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS inventory_slots (
  id                SERIAL PRIMARY KEY,
  character_id      INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  slot_index        INTEGER NOT NULL,
  item_template_id  INTEGER NOT NULL REFERENCES item_templates(id),
  quantity          INTEGER DEFAULT 1,
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (character_id, slot_index)
);

-- Seed item templates (IDs match ITEM_DEFINITIONS in shared-constants)
INSERT INTO item_templates (id, name, type, stackable, max_stack, sell_value, metadata_json)
VALUES
  (1, 'Poción de vida',  'consumable', TRUE,  99, 10,  '{"hpRestore": 50}'),
  (2, 'Poción mayor',    'consumable', TRUE,  99, 25,  '{"hpRestore": 150}'),
  (3, 'Espada corta',    'weapon',     FALSE,  1, 50,  '{}'),
  (4, 'Daga',            'weapon',     FALSE,  1, 30,  '{}'),
  (5, 'Hueso de lobo',   'misc',       TRUE,  50,  5,  '{}'),
  (6, 'Fragmento',       'misc',       TRUE,  50,  3,  '{}')
ON CONFLICT (id) DO NOTHING;

-- Keep the sequence in sync after manual inserts
SELECT setval('item_templates_id_seq', (SELECT MAX(id) FROM item_templates));
