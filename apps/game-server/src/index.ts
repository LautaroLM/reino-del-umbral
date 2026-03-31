import express from 'express';
import cors from 'cors';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { createServer } from 'http';
import { GameRoom } from './rooms/GameRoom.js';
import { authRouter } from './routes/auth.js';
import { characterRouter } from './routes/characters.js';

const port = Number(process.env.PORT || process.env.GAME_SERVER_PORT) || 2567;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001')
  .split(',')
  .map((o) => o.trim());

const app = express();
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// REST API
app.use('/api/auth', authRouter);
app.use('/api/characters', characterRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const httpServer = createServer(app);

const server = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

server.define('game', GameRoom);

server.listen(port).then(() => {
  console.log(`[GameServer] Listening on http://localhost:${port}`);
});
