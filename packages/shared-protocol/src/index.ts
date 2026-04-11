// Shared protocol — message types between client and server

/** Messages the client can send to the server */
export enum ClientMessage {
  Move = 'move',
  Attack = 'attack',
  Chat = 'chat',
  Whisper = 'whisper',
  PortalUse = 'portal_use',
  UseItem = 'use_item',
  EquipItem = 'equip_item',
  Ping = 'ping',
  RequestMapData = 'request_map_data',
}

/** Messages the server can send to the client */
export enum ServerMessage {
  ChatBroadcast = 'chat_broadcast',
  Error = 'error',
  DamageNumber = 'damage_number',
  EnemyDied = 'enemy_died',
  PlayerDied = 'player_died',
  PlayerRespawned = 'player_respawned',
  LevelUp = 'level_up',
  GoldGain = 'gold_gain',
  InventoryLoad = 'inventory_load',
  ItemReceived = 'item_received',
  ItemUsed = 'item_used',
  ItemEquipped = 'item_equipped',
  WhisperReceived = 'whisper_received',
  PlayerJoined = 'player_joined',
  PlayerLeft = 'player_left',
  NpcDialog = 'npc_dialog',
  QuestState = 'quest_state',
  Pong = 'pong',
  MapData = 'map_data',
  MapTransition = 'map_transition',
}
