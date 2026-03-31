import { Client } from '@colyseus/core';
import { ServerMessage } from '@ao/shared-protocol';
import {
  QUEST_SLIME_REQUIRED_KILLS,
  QUEST_SLIME_REWARD_GOLD,
  QUEST_NPC,
  NPC_INTERACT_RANGE,
} from '@ao/shared-constants';
import type { PlayerState } from '../GameRoomState.js';

export class QuestService {
  handleNpcInteract(client: Client, player: PlayerState, npcId?: string): void {
    if (!npcId || npcId !== QUEST_NPC.id) {
      client.send(ServerMessage.NpcDialog, {
        npcName: 'Sistema',
        message: 'Ese NPC no existe.',
      });
      return;
    }

    const distance = Math.hypot(player.x - QUEST_NPC.x, player.y - QUEST_NPC.y);
    if (distance > NPC_INTERACT_RANGE) {
      client.send(ServerMessage.NpcDialog, {
        npcName: QUEST_NPC.name,
        message: 'Acercate para hablar conmigo.',
      });
      return;
    }

    if (player.questSlimeCompleted) {
      client.send(ServerMessage.NpcDialog, {
        npcName: QUEST_NPC.name,
        message: 'Excelente trabajo. Ya limpiaste la zona de slimes.',
      });
      this.sendQuestState(client, player);
      return;
    }

    if (player.questSlimeKills <= 0) {
      client.send(ServerMessage.NpcDialog, {
        npcName: QUEST_NPC.name,
        message: `Mision: derrota ${QUEST_SLIME_REQUIRED_KILLS} slimes y volve conmigo.`,
      });
    } else {
      client.send(ServerMessage.NpcDialog, {
        npcName: QUEST_NPC.name,
        message: `Buen avance. Vas ${player.questSlimeKills}/${QUEST_SLIME_REQUIRED_KILLS} slimes.`,
      });
    }

    this.sendQuestState(client, player);
  }

  updateQuestProgressOnKill(client: Client, player: PlayerState, enemyType: string): void {
    if (enemyType !== 'slime' || player.questSlimeCompleted) return;

    player.questSlimeKills = Math.min(QUEST_SLIME_REQUIRED_KILLS, player.questSlimeKills + 1);

    if (player.questSlimeKills >= QUEST_SLIME_REQUIRED_KILLS) {
      player.questSlimeCompleted = true;
      player.gold += QUEST_SLIME_REWARD_GOLD;

      client.send(ServerMessage.GoldGain, {
        gold: QUEST_SLIME_REWARD_GOLD,
        total: player.gold,
      });

      client.send(ServerMessage.NpcDialog, {
        npcName: QUEST_NPC.name,
        message: `Mision completa. Cobraste ${QUEST_SLIME_REWARD_GOLD} de oro.`,
      });
    }

    this.sendQuestState(client, player);
  }

  sendQuestState(client: Client, player: PlayerState): void {
    client.send(ServerMessage.QuestState, {
      questId: 'slime_hunt_1',
      targetName: 'Slime',
      kills: player.questSlimeKills,
      goal: QUEST_SLIME_REQUIRED_KILLS,
      completed: player.questSlimeCompleted,
      rewardGold: QUEST_SLIME_REWARD_GOLD,
    });
  }
}
