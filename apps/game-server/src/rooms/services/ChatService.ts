import { Client } from '@colyseus/core';
import { ServerMessage } from '@ao/shared-protocol';
import { MAX_CHAT_LENGTH } from '@ao/shared-constants';
import type { PlayerState } from '../GameRoomState.js';

interface PlayerStore {
  get(sessionId: string): PlayerState | undefined;
  forEach(callback: (player: PlayerState, sessionId: string) => void): void;
}

interface ChatPayload {
  sessionId: string;
  name: string;
  message: string;
}

interface WhisperData {
  targetName: string;
  message: string;
}

export class ChatService {
  handleChat(
    client: Client,
    data: { message: string },
    players: PlayerStore,
    broadcastChat: (payload: ChatPayload) => void,
  ): void {
    if (!data.message || typeof data.message !== 'string') return;

    const text = data.message.slice(0, MAX_CHAT_LENGTH).trim();
    if (!text) return;

    const player = players.get(client.sessionId);
    const name = player?.name || client.sessionId;

    broadcastChat({
      sessionId: client.sessionId,
      name,
      message: text,
    });
  }

  handleWhisper(
    client: Client,
    data: WhisperData,
    players: PlayerStore,
    clients: Client[],
  ): void {
    if (!data.targetName || typeof data.targetName !== 'string') return;
    if (!data.message || typeof data.message !== 'string') return;

    const text = data.message.slice(0, MAX_CHAT_LENGTH).trim();
    if (!text) return;

    const sender = players.get(client.sessionId);
    if (!sender) return;

    let targetClient: Client | null = null;
    for (const connectedClient of clients) {
      const targetPlayer = players.get(connectedClient.sessionId);
      if (targetPlayer?.name.toLowerCase() === data.targetName.toLowerCase()) {
        targetClient = connectedClient;
        break;
      }
    }

    if (!targetClient) {
      client.send(ServerMessage.WhisperReceived, {
        from: 'Sistema',
        to: null,
        message: `Jugador "${data.targetName}" no encontrado.`,
        isError: true,
      });
      return;
    }

    const payload = {
      from: sender.name,
      to: data.targetName,
      message: text,
      isError: false,
    };

    targetClient.send(ServerMessage.WhisperReceived, payload);
    client.send(ServerMessage.WhisperReceived, payload);
  }

}
