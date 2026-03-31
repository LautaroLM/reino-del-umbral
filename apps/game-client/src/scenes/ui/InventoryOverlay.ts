import { MAX_INVENTORY_SLOTS } from '@ao/shared-constants';
import type { InventoryItem } from '@ao/shared-types';

interface InventoryOverlayHandlers {
  onUseItem: (slotIndex: number) => void;
  onEquipItem: (slotIndex: number) => void;
}

export class InventoryOverlay {
  private panelEl: HTMLDivElement | null = null;

  constructor(private handlers: InventoryOverlayHandlers) {}

  mount(): void {
    this.dispose();

    const existing = document.getElementById('inv-panel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'inv-panel';
    panel.style.cssText = [
      'position:fixed', 'top:8px', 'right:8px', 'width:240px',
      'max-height:500px', 'overflow-y:auto',
      'background:rgba(0,0,0,0.88)', 'color:#eee',
      'border:1px solid #555', 'border-radius:6px',
      'font-family:monospace', 'font-size:12px',
      'z-index:20', 'display:none', 'user-select:none',
    ].join(';');

    document.body.appendChild(panel);
    this.panelEl = panel;
  }

  toggle(inventory: InventoryItem[], equippedWeaponId: number): void {
    if (!this.panelEl) return;

    const isHidden = this.panelEl.style.display === 'none';
    this.panelEl.style.display = isHidden ? 'block' : 'none';
    if (isHidden) this.render(inventory, equippedWeaponId);
  }

  render(inventory: InventoryItem[], equippedWeaponId: number): void {
    const panel = this.panelEl;
    if (!panel || panel.style.display === 'none') return;

    const count = inventory.length;
    let html = `<div style="padding:6px 10px;border-bottom:1px solid #444;font-weight:bold;color:#aaccff;">
      INVENTARIO (${count}/${MAX_INVENTORY_SLOTS})
    </div>`;

    if (count === 0) {
      html += '<div style="padding:8px 10px;color:#777;">- vacio -</div>';
    } else {
      const sorted = [...inventory].sort((a, b) => a.slotIndex - b.slotIndex);
      for (const item of sorted) {
        const isConsumable = item.type === 'consumable';
        const isWeapon = item.type === 'weapon';
        const isEquipped = isWeapon && equippedWeaponId === item.itemId;
        const color = isEquipped ? '#ffe066' : isConsumable ? '#88ff88' : isWeapon ? '#ffcc66' : '#cccccc';
        const equipLabel = isEquipped ? '[desequipar]' : '[equipar]';
        const actionHint = isConsumable
          ? ' <span style="color:#aaa;font-size:11px;">[usar]</span>'
          : isWeapon
          ? ` <span style="color:${isEquipped ? '#ffe066' : '#aaa'};font-size:11px;">${equipLabel}</span>`
          : '';
        const equippedBadge = isEquipped ? ' ✦' : '';

        html += `<div data-slot="${item.slotIndex}" data-type="${item.type}"
          style="padding:3px 10px;color:${color};cursor:pointer;user-select:none;">
          ${item.name}${equippedBadge}${item.stackable ? ` x${item.quantity}` : ''}${actionHint}
        </div>`;
      }
    }

    html += '<div style="padding:4px 10px;border-top:1px solid #333;color:#555;font-size:11px;">Click para usar/equipar</div>';
    panel.innerHTML = html;

    const slotMap = new Map<number, InventoryItem>();
    for (const item of inventory) {
      slotMap.set(item.slotIndex, item);
    }

    panel.querySelectorAll<HTMLElement>('[data-slot]').forEach((el) => {
      el.addEventListener('click', () => {
        const slotIndex = parseInt(el.dataset.slot || '', 10);
        const item = slotMap.get(slotIndex);
        if (!item) return;

        if (item.type === 'consumable') {
          this.handlers.onUseItem(slotIndex);
        } else if (item.type === 'weapon') {
          this.handlers.onEquipItem(slotIndex);
        }
      });
    });
  }

  dispose(): void {
    if (this.panelEl) this.panelEl.remove();
    this.panelEl = null;
  }
}
