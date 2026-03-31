import { pool } from './pool.js';

let schemaReadyPromise: Promise<void> | null = null;

async function ensureQuestColumns(): Promise<void> {
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
}

export const CharacterRepository = {
  async findByIdAndAccount(characterId: number, accountId: number): Promise<CharacterRow | null> {
    await ensureQuestColumns();

    const result = await pool.query<CharacterRow>(
      `SELECT id, name, race, class, level, experience, hp_current, hp_max, pos_x, pos_y, gold, equipped_weapon_id,
              COALESCE(quest_slime_kills, 0) AS quest_slime_kills,
              COALESCE(quest_slime_completed, FALSE) AS quest_slime_completed,
              COALESCE(is_ghost, FALSE) AS is_ghost
       FROM characters
       WHERE id = $1 AND account_id = $2`,

      [characterId, accountId],
    );
    return result.rows[0] ?? null;
  },

  async save(characterId: number, data: CharacterSaveData): Promise<void> {
    await ensureQuestColumns();

    await pool.query(
      `UPDATE characters
       SET pos_x = $1, pos_y = $2, hp_current = $3, hp_max = $4,
           experience = $5, level = $6, gold = $7, equipped_weapon_id = $8,
           quest_slime_kills = $9, quest_slime_completed = $10, is_ghost = $11, updated_at = NOW()
       WHERE id = $12`,
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
        characterId,
      ],
    );
  },
};
