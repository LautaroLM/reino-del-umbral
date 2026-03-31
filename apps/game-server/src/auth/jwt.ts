import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'ao-dev-secret-change-in-prod';
const JWT_EXPIRES_IN = '24h';

export interface JwtPayload {
  accountId: number;
  username: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}
