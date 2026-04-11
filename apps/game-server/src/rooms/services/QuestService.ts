import { Client } from '@colyseus/core';
import { ServerMessage } from '@ao/shared-protocol';
import {
  QUEST_SLIME_REQUIRED_KILLS,
  QUEST_SLIME_REWARD_GOLD,
} from '@ao/shared-constants';
import type { PlayerState } from '../GameRoomState.js';

export class QuestService {
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
        npcName: 'Sistema',
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
