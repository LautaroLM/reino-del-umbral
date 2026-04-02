import pg from 'pg';
const { Pool } = pg;

// Detect whether TLS/SSL should be enabled. Neon (and many managed PGs)
// require SSL; either set DATABASE_SSL=true or provide a DATABASE_URL
// that includes `sslmode=require`.
const useSsl = process.env.DATABASE_SSL === 'true' || !!(process.env.DATABASE_URL && process.env.DATABASE_URL.includes('sslmode=require'));

function makePool() {
  if (process.env.DATABASE_URL) {
    return new Pool({
      connectionString: process.env.DATABASE_URL,
      // In some CI/platform certs are not presented as a CA chain; rejectUnauthorized:false
      // allows connections to Neon with `sslmode=require`.
      ssl: useSsl ? { rejectUnauthorized: false } : false,
    } as any);
  }

  return new Pool({
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT) || 5432,
    user: process.env.DATABASE_USER || 'ao',
    password: process.env.DATABASE_PASSWORD || 'ao_dev',
    database: process.env.DATABASE_NAME || 'ao',
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  } as any);
}

export const pool = makePool();
