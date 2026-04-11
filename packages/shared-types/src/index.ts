// Shared types

/** Razas disponibles */
export type Race = 'human' | 'elf' | 'dwarf' | 'nomad';

/** Clases disponibles */
export type CharacterClass = 'warrior' | 'mage' | 'explorer';

/** Dirección de movimiento */
export type Direction = 'up' | 'down' | 'left' | 'right';

// --- API DTOs ---

export interface RegisterRequest {
  username: string;
  password: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  account: { id: number; username: string };
}

export interface CreateCharacterRequest {
  name: string;
  race: Race;
  characterClass: CharacterClass;
  idBody?: number;
  idHead?: number;
  idHelmet?: number;
}

export interface CharacterSummary {
  id: number;
  name: string;
  race: Race;
  characterClass: CharacterClass;
  level: number;
  idBody: number;
  idHead: number;
  idHelmet: number;
}

export interface ApiError {
  error: string;
}

// --- Inventory ---

export interface InventoryItem {
  slotIndex: number;
  itemId: number;
  name: string;
  type: string;
  quantity: number;
  stackable: boolean;
  sellValue: number;
}
