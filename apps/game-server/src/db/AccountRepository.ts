import { pool } from './pool.js';

let schemaReadyPromise: Promise<void> | null = null;

async function ensureAccountSessionColumns(): Promise<void> {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      await pool.query(
        'ALTER TABLE accounts ADD COLUMN IF NOT EXISTS active_game_session_id VARCHAR(100)',
      );
      await pool.query(
        'ALTER TABLE accounts ADD COLUMN IF NOT EXISTS active_game_session_at TIMESTAMPTZ',
      );
    })();
  }

  return schemaReadyPromise;
}

const ACTIVE_SESSION_TTL_SECONDS = 45;

export const AccountRepository = {
  async claimGameSession(accountId: number, sessionId: string): Promise<boolean> {
    await ensureAccountSessionColumns();

    const result = await pool.query(
      `UPDATE accounts
       SET active_game_session_id = $2,
           active_game_session_at = NOW()
       WHERE id = $1
         AND (
           active_game_session_id IS NULL
           OR active_game_session_id = $2
           OR active_game_session_at IS NULL
           OR active_game_session_at < NOW() - INTERVAL '${ACTIVE_SESSION_TTL_SECONDS} seconds'
         )
       RETURNING id`,
      [accountId, sessionId],
    );

    return (result.rowCount ?? 0) > 0;
  },

  async touchGameSession(accountId: number, sessionId: string): Promise<void> {
    await ensureAccountSessionColumns();

    await pool.query(
      `UPDATE accounts
       SET active_game_session_at = NOW()
       WHERE id = $1 AND active_game_session_id = $2`,
      [accountId, sessionId],
    );
  },

  async releaseGameSession(accountId: number, sessionId: string): Promise<void> {
    await ensureAccountSessionColumns();

    await pool.query(
      `UPDATE accounts
       SET active_game_session_id = NULL,
           active_game_session_at = NULL
       WHERE id = $1 AND active_game_session_id = $2`,
      [accountId, sessionId],
    );
  },
};