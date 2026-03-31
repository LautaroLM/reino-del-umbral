import { Router, type Request, type Response, type IRouter } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db/pool.js';
import { signToken } from '../auth/jwt.js';
import type { RegisterRequest, LoginRequest, AuthResponse, ApiError } from '@ao/shared-types';

const SALT_ROUNDS = 10;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;
const MIN_PASSWORD_LENGTH = 6;

export const authRouter: IRouter = Router();

authRouter.post('/register', async (req: Request, res: Response<AuthResponse | ApiError>) => {
  const { username, password } = req.body as RegisterRequest;

  if (!username || !USERNAME_REGEX.test(username)) {
    res.status(400).json({ error: 'Username must be 3-30 alphanumeric characters or underscores.' });
    return;
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    return;
  }

  try {
    const existing = await pool.query('SELECT id FROM accounts WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'Username already taken.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await pool.query(
      'INSERT INTO accounts (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [username, passwordHash],
    );

    const account = result.rows[0];
    const token = signToken({ accountId: account.id, username: account.username });

    res.status(201).json({ token, account: { id: account.id, username: account.username } });
  } catch (err) {
    console.error('[Auth] Register error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

authRouter.post('/login', async (req: Request, res: Response<AuthResponse | ApiError>) => {
  const { username, password } = req.body as LoginRequest;

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required.' });
    return;
  }

  try {
    const result = await pool.query('SELECT id, username, password_hash FROM accounts WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    const account = result.rows[0];
    const valid = await bcrypt.compare(password, account.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    const token = signToken({ accountId: account.id, username: account.username });
    res.json({ token, account: { id: account.id, username: account.username } });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});
