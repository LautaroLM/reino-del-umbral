import { Schema, type, MapSchema } from '@colyseus/schema';

export class PlayerState extends Schema {
  @type('string') name: string = '';
  @type('number') x: number = 0;
  @type('number') y: number = 0;
  @type('number') hp: number = 100;
  @type('number') hpMax: number = 100;
  @type('number') level: number = 1;
  @type('string') race: string = 'human';
  @type('string') characterClass: string = 'warrior';
  @type('string') direction: string = 'down';
  @type('number') characterId: number = 0;
  @type('number') xp: number = 0;
  @type('number') gold: number = 0;
  @type('boolean') dead: boolean = false;
  @type('boolean') ghost: boolean = false;
  /** 0 = no weapon equipped; otherwise matches item_templates.id */
  @type('number') equippedWeaponId: number = 0;
  @type('number') questSlimeKills: number = 0;
  @type('boolean') questSlimeCompleted: boolean = false;
}

export class EnemyState extends Schema {
  @type('string') id: string = '';
  @type('string') enemyType: string = 'slime';
  @type('string') name: string = '';
  @type('number') x: number = 0;
  @type('number') y: number = 0;
  @type('number') hp: number = 30;
  @type('number') hpMax: number = 30;
  @type('string') direction: string = 'down';
}

export class GameRoomState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: EnemyState }) enemies = new MapSchema<EnemyState>();
}
