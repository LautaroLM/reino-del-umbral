// Config — placeholder for shared configuration
export const config = {
  gameServer: {
    port: Number(process.env.GAME_SERVER_PORT) || 2567,
  },
  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT) || 5432,
    user: process.env.DATABASE_USER || 'ao',
    password: process.env.DATABASE_PASSWORD || 'ao_dev',
    name: process.env.DATABASE_NAME || 'ao',
  },
};
