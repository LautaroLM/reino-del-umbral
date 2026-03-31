import { pool } from './pool.js';
import { ITEM_DEFINITIONS, MAX_INVENTORY_SLOTS } from '@ao/shared-constants';
import type { InventoryItem } from '@ao/shared-types';

// ---------------------------------------------------------------------------
// InventoryRepository
// All inventory persistence lives here; GameRoom never touches SQL directly.
// ---------------------------------------------------------------------------

/**
 * Load the full inventory for a character.
 * Returns an array sorted by slot_index (may have gaps if slots are empty).
 */
export async function loadInventory(characterId: number): Promise<InventoryItem[]> {
  const result = await pool.query<{
    slot_index: number;
    item_template_id: number;
    quantity: number;
  }>(
    `SELECT slot_index, item_template_id, quantity
     FROM inventory_slots
     WHERE character_id = $1
     ORDER BY slot_index`,
    [characterId],
  );

  return result.rows.map((row) => {
    const def = ITEM_DEFINITIONS[row.item_template_id];
    return {
      slotIndex: row.slot_index,
      itemId: row.item_template_id,
      name: def?.name ?? 'Desconocido',
      type: def?.type ?? 'misc',
      quantity: row.quantity,
      stackable: def?.stackable ?? false,
      sellValue: def?.sellValue ?? 0,
    };
  });
}

/**
 * Add `quantity` units of `itemId` to the character's inventory.
 * Stacks onto an existing slot when possible; otherwise fills the first free slot.
 * Returns the updated or created InventoryItem, or null if the inventory is full.
 */
export async function addItem(
  characterId: number,
  itemId: number,
  quantity: number,
): Promise<InventoryItem | null> {
  const def = ITEM_DEFINITIONS[itemId];
  if (!def) throw new Error(`Unknown item id: ${itemId}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (def.stackable) {
      // Try to stack onto an existing slot
      const existing = await client.query<{ slot_index: number; quantity: number }>(
        `SELECT slot_index, quantity FROM inventory_slots
         WHERE character_id = $1 AND item_template_id = $2
         ORDER BY slot_index LIMIT 1`,
        [characterId, itemId],
      );

      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        const newQty = Math.min(row.quantity + quantity, def.maxStack);
        await client.query(
          `UPDATE inventory_slots SET quantity = $1, updated_at = NOW()
           WHERE character_id = $2 AND slot_index = $3`,
          [newQty, characterId, row.slot_index],
        );
        await client.query('COMMIT');
        return { slotIndex: row.slot_index, itemId, name: def.name, type: def.type, quantity: newQty, stackable: true, sellValue: def.sellValue };
      }
    }

    // Find the first free slot
    const slotsUsed = await client.query<{ slot_index: number }>(
      `SELECT slot_index FROM inventory_slots WHERE character_id = $1 ORDER BY slot_index`,
      [characterId],
    );
    const usedSet = new Set(slotsUsed.rows.map((r) => r.slot_index));
    let freeSlot = -1;
    for (let i = 0; i < MAX_INVENTORY_SLOTS; i++) {
      if (!usedSet.has(i)) { freeSlot = i; break; }
    }

    if (freeSlot === -1) {
      await client.query('ROLLBACK');
      return null; // inventory full
    }

    const qty = Math.min(quantity, def.maxStack);
    await client.query(
      `INSERT INTO inventory_slots (character_id, slot_index, item_template_id, quantity)
       VALUES ($1, $2, $3, $4)`,
      [characterId, freeSlot, itemId, qty],
    );
    await client.query('COMMIT');
    return { slotIndex: freeSlot, itemId, name: def.name, type: def.type, quantity: qty, stackable: def.stackable, sellValue: def.sellValue };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Consume one unit from a consumable slot.
 * Removes the slot row when quantity reaches 0.
 * Returns the remaining quantity (−1 if slot was not found).
 */
export async function consumeItem(characterId: number, slotIndex: number): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const row = await client.query<{ quantity: number; item_template_id: number }>(
      `SELECT quantity, item_template_id FROM inventory_slots
       WHERE character_id = $1 AND slot_index = $2`,
      [characterId, slotIndex],
    );

    if (row.rows.length === 0) {
      await client.query('ROLLBACK');
      return -1;
    }

    const newQty = row.rows[0].quantity - 1;
    if (newQty <= 0) {
      await client.query(
        `DELETE FROM inventory_slots WHERE character_id = $1 AND slot_index = $2`,
        [characterId, slotIndex],
      );
    } else {
      await client.query(
        `UPDATE inventory_slots SET quantity = $1, updated_at = NOW()
         WHERE character_id = $2 AND slot_index = $3`,
        [newQty, characterId, slotIndex],
      );
    }

    await client.query('COMMIT');
    return newQty;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Equip a weapon from the character's inventory.
 * Validates the slot exists and is a weapon type.
 * Returns the itemId of the newly equipped weapon, or null on failure.
 */
export async function equipItem(
  characterId: number,
  slotIndex: number,
): Promise<number | null> {
  const slot = await pool.query<{ item_template_id: number }>(
    `SELECT item_template_id FROM inventory_slots
     WHERE character_id = $1 AND slot_index = $2`,
    [characterId, slotIndex],
  );

  if (slot.rows.length === 0) return null;

  const itemId = slot.rows[0].item_template_id;
  const def = ITEM_DEFINITIONS[itemId];

  if (!def || def.type !== 'weapon') return null;

  await pool.query(
    `UPDATE characters SET equipped_weapon_id = $1, updated_at = NOW() WHERE id = $2`,
    [itemId, characterId],
  );

  return itemId;
}

/**
 * Unequip the currently equipped weapon (sets to NULL).
 */
export async function unequipItem(characterId: number): Promise<void> {
  await pool.query(
    `UPDATE characters SET equipped_weapon_id = NULL, updated_at = NOW() WHERE id = $1`,
    [characterId],
  );
}
