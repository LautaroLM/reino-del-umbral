import pg from 'pg';
const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DATABASE_HOST || 'localhost',
  port: Number(process.env.DATABASE_PORT) || 5432,
  user: process.env.DATABASE_USER || 'ao',
  password: process.env.DATABASE_PASSWORD || 'ao_dev',
  database: process.env.DATABASE_NAME || 'ao',
});
