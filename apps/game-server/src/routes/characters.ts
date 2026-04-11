import { Router, type Request, type Response, type IRouter } from 'express';
import { pool } from '../db/pool.js';
import { ensureCharacterColumns } from '../db/CharacterRepository.js';
import { verifyToken } from '../auth/jwt.js';
import {
  CreateCharacterRequest,
  CharacterSummary,
  ApiError,
  Race,
  CharacterClass,
} from '@ao/shared-types';
import {
  SAFE_SPAWN_X,
  SAFE_SPAWN_Y,
  CHARACTER_APPEARANCE_PRESETS,
  DEFAULT_APPEARANCE_PRESET_BY_CLASS,
  resolveCharacterAppearance,
} from '@ao/shared-constants';

const VALID_RACES: Race[] = ['human', 'elf', 'dwarf', 'nomad'];
const VALID_CLASSES: CharacterClass[] = ['warrior', 'mage', 'explorer'];
const MAX_CHARACTERS_PER_ACCOUNT = 3;
const NAME_REGEX = /^[a-zA-Z0-9_ ]{3,30}$/;

interface AuthenticatedRequest extends Request {
  accountId: number;
}

export const characterRouter: IRouter = Router();

/** Middleware: extract accountId from JWT */
function requireAuth(req: Request, res: Response, next: () => void) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid token.' });
    return;
  }

  try {
    const payload = verifyToken(header.slice(7));
    (req as AuthenticatedRequest).accountId = payload.accountId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

characterRouter.use(requireAuth);

function isValidAppearanceSelection(idBody?: number, idHead?: number, idHelmet?: number): boolean {
  if (idBody == null || idHead == null || idHelmet == null) return true;
  return CHARACTER_APPEARANCE_PRESETS.some(
    (preset) => preset.idBody === idBody && preset.idHead === idHead && preset.idHelmet === idHelmet,
  );
}

/** GET /characters — list characters for the authenticated account */
characterRouter.get('/', async (req: Request, res: Response<CharacterSummary[] | ApiError>) => {
  const accountId = (req as AuthenticatedRequest).accountId;

  try {
    await ensureCharacterColumns();
    const result = await pool.query(
      `SELECT id, name, race, class AS "characterClass", level,
              COALESCE(id_body, 56) AS "idBody",
              COALESCE(id_head, 1) AS "idHead",
              COALESCE(id_helmet, 4) AS "idHelmet"
       FROM characters
       WHERE account_id = $1
       ORDER BY created_at`,
      [accountId],
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[Characters] List error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** POST /characters — create a new character */
characterRouter.post('/', async (req: Request, res: Response<CharacterSummary | ApiError>) => {
  const accountId = (req as AuthenticatedRequest).accountId;
  const { name, race, characterClass, idBody, idHead, idHelmet } = req.body as CreateCharacterRequest;

  if (!name || !NAME_REGEX.test(name)) {
    res.status(400).json({ error: 'Name must be 3-30 alphanumeric characters, underscores or spaces.' });
    return;
  }
  if (!VALID_RACES.includes(race)) {
    res.status(400).json({ error: `Invalid race. Valid: ${VALID_RACES.join(', ')}` });
    return;
  }
  if (!VALID_CLASSES.includes(characterClass)) {
    res.status(400).json({ error: `Invalid class. Valid: ${VALID_CLASSES.join(', ')}` });
    return;
  }
  if (!isValidAppearanceSelection(idBody, idHead, idHelmet)) {
    res.status(400).json({ error: 'Invalid character appearance.' });
    return;
  }

  try {
    await ensureCharacterColumns();
    // Check character limit
    const countResult = await pool.query('SELECT COUNT(*) FROM characters WHERE account_id = $1', [accountId]);
    if (Number(countResult.rows[0].count) >= MAX_CHARACTERS_PER_ACCOUNT) {
      res.status(400).json({ error: `Maximum ${MAX_CHARACTERS_PER_ACCOUNT} characters per account.` });
      return;
    }

    // Check name uniqueness
    const nameCheck = await pool.query('SELECT id FROM characters WHERE name = $1', [name]);
    if (nameCheck.rows.length > 0) {
      res.status(409).json({ error: 'Character name already taken.' });
      return;
    }

    const defaultPresetId = DEFAULT_APPEARANCE_PRESET_BY_CLASS[characterClass];
    const appearance = (idBody != null && idHead != null && idHelmet != null)
      ? { idBody, idHead, idHelmet }
      : resolveCharacterAppearance(defaultPresetId, characterClass);

    const result = await pool.query(
      `INSERT INTO characters (account_id, name, race, class, pos_x, pos_y, id_body, id_head, id_helmet)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, name, race, class AS "characterClass", level,
                 id_body AS "idBody", id_head AS "idHead", id_helmet AS "idHelmet"`,
      [
        accountId,
        name,
        race,
        characterClass,
        SAFE_SPAWN_X,
        SAFE_SPAWN_Y,
        appearance.idBody,
        appearance.idHead,
        appearance.idHelmet,
      ],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[Characters] Create error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/** DELETE /characters/:id */
characterRouter.delete('/:id', async (req: Request, res: Response<{ ok: true } | ApiError>) => {
  const accountId = (req as AuthenticatedRequest).accountId;
  const charId = Number(req.params.id);

  if (isNaN(charId)) {
    res.status(400).json({ error: 'Invalid character id.' });
    return;
  }

  try {
    const result = await pool.query('DELETE FROM characters WHERE id = $1 AND account_id = $2', [charId, accountId]);
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Character not found.' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[Characters] Delete error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});
