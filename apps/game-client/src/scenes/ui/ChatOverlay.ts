import Phaser from 'phaser';

export type ChatKind = 'chat' | 'system' | 'whisper' | 'loot';

interface ChatMessage {
  name: string;
  message: string;
  time: number;
  kind: ChatKind;
}

interface ChatSendPayload {
  type: 'chat' | 'whisper';
  message: string;
  targetName?: string;
}

export class ChatOverlay {
  private messages: ChatMessage[] = [];
  private displayEl: HTMLDivElement | null = null;
  private inputEl: HTMLInputElement | null = null;
  private onSend: ((payload: ChatSendPayload) => void) | null = null;
  private handleFocusInput = () => {
    if (!this.inputEl) return;
    if (document.activeElement !== this.inputEl) {
      this.inputEl.focus();
    }
  };

  constructor(private keyboard: Phaser.Input.Keyboard.KeyboardPlugin) {}

  mount(onSend: (payload: ChatSendPayload) => void): void {
    this.dispose();
    this.onSend = onSend;

    const existingDisplay = document.getElementById('chat-display');
    if (existingDisplay) existingDisplay.remove();

    const display = document.createElement('div');
    display.id = 'chat-display';
    display.style.cssText = [
      'position:fixed', 'bottom:44px', 'left:8px', 'width:370px',
      'max-height:160px', 'overflow:hidden', 'display:flex', 'flex-direction:column',
      'justify-content:flex-end', 'pointer-events:none', 'z-index:9',
      'font-family:monospace', 'font-size:12px',
    ].join(';');
    document.body.appendChild(display);
    this.displayEl = display;

    const existingInput = document.getElementById('chat-input');
    if (existingInput) existingInput.remove();

    const input = document.createElement('input');
    input.id = 'chat-input';
    input.type = 'text';
    input.placeholder = 'Enter: chat | /tell nombre msg: whisper';
    input.maxLength = 200;
    input.style.cssText = [
      'position:fixed', 'bottom:8px', 'left:8px', 'width:350px', 'padding:6px 10px',
      'background:rgba(0,0,0,0.7)', 'color:#fff', 'border:1px solid #555',
      'border-radius:4px', 'font-size:13px', 'outline:none', 'z-index:10',
    ].join(';');

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const msg = input.value.trim();
        if (msg && this.onSend) {
          const tellMatch = msg.match(/^\/tell\s+(\S+)\s+(.+)$/i);
          if (tellMatch) {
            this.onSend({ type: 'whisper', targetName: tellMatch[1], message: tellMatch[2] });
          } else {
            this.onSend({ type: 'chat', message: msg });
          }
          input.value = '';
        }
        input.blur();
        e.stopPropagation();
      }

      if (e.key === 'Escape') {
        input.blur();
        e.stopPropagation();
      }

      e.stopPropagation();
    });

    document.body.appendChild(input);
    this.inputEl = input;

    this.keyboard.on('keydown-ENTER', this.handleFocusInput);
  }

  addMessage(name: string, message: string, kind: ChatKind): void {
    this.messages.push({ name, message, kind, time: Date.now() });
    if (this.messages.length > 10) this.messages.shift();
    this.render();
  }

  tick(now: number = Date.now()): void {
    this.messages = this.messages.filter((m) => now - m.time < 15000);
    this.render();
  }

  isInputFocused(): boolean {
    return !!this.inputEl && document.activeElement === this.inputEl;
  }

  dispose(): void {
    this.keyboard.off('keydown-ENTER', this.handleFocusInput);
    if (this.displayEl) this.displayEl.remove();
    if (this.inputEl) this.inputEl.remove();
    this.displayEl = null;
    this.inputEl = null;
    this.onSend = null;
  }

  private render(): void {
    if (!this.displayEl) return;

    const colorMap: Record<ChatKind, string> = {
      chat: '#ffffff',
      system: '#aaffaa',
      whisper: '#ffccff',
      loot: '#ffd700',
    };

    this.displayEl.innerHTML = this.messages
      .map((m) => {
        const color = colorMap[m.kind] ?? '#ffffff';
        const text = `[${m.name}]: ${m.message}`
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        return `<div style="color:${color};background:rgba(0,0,0,0.55);padding:1px 6px;margin-bottom:1px;border-radius:2px;">${text}</div>`;
      })
      .join('');
  }
}
