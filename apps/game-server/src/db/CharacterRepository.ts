import { pool } from './pool.js';

let schemaReadyPromise: Promise<void> | null = null;

export async function ensureCharacterColumns(): Promise<void> {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      await pool.query(
        'ALTER TABLE characters ADD COLUMN IF NOT EXISTS quest_slime_kills INTEGER NOT NULL DEFAULT 0',
      );
      await pool.query(
        'ALTER TABLE characters ADD COLUMN IF NOT EXISTS quest_slime_completed BOOLEAN NOT NULL DEFAULT FALSE',
      );
      await pool.query(
        'ALTER TABLE characters ADD COLUMN IF NOT EXISTS is_ghost BOOLEAN NOT NULL DEFAULT FALSE',
      );
      await pool.query(
        'ALTER TABLE characters ADD COLUMN IF NOT EXISTS current_map_id INTEGER NOT NULL DEFAULT 1',
      );
      await pool.query(
        'ALTER TABLE characters ADD COLUMN IF NOT EXISTS id_body INTEGER NOT NULL DEFAULT 56',
      );
      await pool.query(
        'ALTER TABLE characters ADD COLUMN IF NOT EXISTS id_head INTEGER NOT NULL DEFAULT 1',
      );
      await pool.query(
        'ALTER TABLE characters ADD COLUMN IF NOT EXISTS id_helmet INTEGER NOT NULL DEFAULT 4',
      );
    })();
  }
  return schemaReadyPromise;
}

export interface CharacterRow {
  id: number;
  name: string;
  race: string;
  class: string;
  level: number;
  experience: number;
  hp_current: number;
  hp_max: number;
  pos_x: number;
  pos_y: number;
  gold: number;
  equipped_weapon_id: number | null;
  quest_slime_kills: number;
  quest_slime_completed: boolean;
  is_ghost: boolean;
  current_map_id: number;
  id_body: number;
  id_head: number;
  id_helmet: number;
}

export interface CharacterSaveData {
  x: number;
  y: number;
  hp: number;
  hpMax: number;
  xp: number;
  level: number;
  gold: number;
  equippedWeaponId: number | null;
  questSlimeKills: number;
  questSlimeCompleted: boolean;
  ghost: boolean;
  currentMapId: number;
}

export const CharacterRepository = {
  async findByIdAndAccount(characterId: number, accountId: number): Promise<CharacterRow | null> {
    await ensureCharacterColumns();

    const result = await pool.query<CharacterRow>(
      `SELECT id, name, race, class, level, experience, hp_current, hp_max, pos_x, pos_y, gold, equipped_weapon_id,
              COALESCE(quest_slime_kills, 0) AS quest_slime_kills,
              COALESCE(quest_slime_completed, FALSE) AS quest_slime_completed,
              COALESCE(is_ghost, FALSE) AS is_ghost,
              COALESCE(current_map_id, 1) AS current_map_id,
              COALESCE(id_body, 56) AS id_body,
              COALESCE(id_head, 1) AS id_head,
              COALESCE(id_helmet, 4) AS id_helmet
       FROM characters
       WHERE id = $1 AND account_id = $2`,

      [characterId, accountId],
    );
    return result.rows[0] ?? null;
  },

  async save(characterId: number, data: CharacterSaveData): Promise<void> {
    await ensureCharacterColumns();

    await pool.query(
      `UPDATE characters
       SET pos_x = $1, pos_y = $2, hp_current = $3, hp_max = $4,
           experience = $5, level = $6, gold = $7, equipped_weapon_id = $8,
           quest_slime_kills = $9, quest_slime_completed = $10, is_ghost = $11,
           current_map_id = $12, updated_at = NOW()
       WHERE id = $13`,
      [
        Math.round(data.x),
        Math.round(data.y),
        data.hp,
        data.hpMax,
        data.xp,
        data.level,
        data.gold,
        data.equippedWeaponId ?? null,
        data.questSlimeKills,
        data.questSlimeCompleted,
        data.ghost,
        data.currentMapId,
        characterId,
      ],
    );
  },
};
