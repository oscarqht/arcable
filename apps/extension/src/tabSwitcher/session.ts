export interface SwitcherTab {
  id: number;
  title: string;
  url: string;
  thumbnail?: string;
  favIconUrl?: string;
}

export type SwitcherAction = 'next' | 'previous' | 'commit' | 'cancel';

interface SwitcherEffects {
  load: () => Promise<SwitcherTab[]>;
  render: (tabs: SwitcherTab[], selected: number) => void;
  close: () => void;
  activate: (tabId: number) => Promise<unknown>;
  visibility: (open: boolean) => void;
}

// Keep input synchronous even when the extension worker needs time to wake up.
export class SwitcherSession {
  private generation = 0;
  private tabs: SwitcherTab[] | null = null;
  private steps = 1;
  private released = false;
  active = false;

  constructor(private readonly effects: SwitcherEffects) {}

  get selected(): number {
    const count = this.tabs?.length || 1;
    return ((this.steps % count) + count) % count;
  }

  handle(action: SwitcherAction): void {
    if (action === 'cancel') { this.cancel(); return; }
    if (action === 'commit') {
      if (!this.active) return;
      this.released = true;
      this.commit();
      return;
    }
    if (!this.active) {
      this.active = true;
      this.released = false;
      this.tabs = null;
      this.steps = action === 'next' ? 1 : -1;
      const generation = ++this.generation;
      this.effects.visibility(true);
      this.effects.render([], 0);
      void this.effects.load().then(tabs => {
        if (!this.active || generation !== this.generation) return;
        this.tabs = tabs.slice(0, 5);
        if (!this.tabs.length) { this.cancel(); return; }
        if (this.released) this.commit();
        else this.effects.render(this.tabs, this.selected);
      }).catch(() => { if (generation === this.generation) this.cancel(); });
    } else if (!this.released) {
      this.steps += action === 'next' ? 1 : -1;
      if (this.tabs) this.effects.render(this.tabs, this.selected);
    }
  }

  choose(index: number): void {
    if (!this.active || !this.tabs?.[index]) return;
    this.steps = index;
    this.commit();
  }

  cancel(): void {
    if (!this.active) return;
    this.active = false;
    this.tabs = null;
    ++this.generation;
    this.effects.close();
    this.effects.visibility(false);
  }

  private commit(): void {
    const tab = this.tabs?.[this.selected];
    if (!tab) return;
    this.cancel();
    void this.effects.activate(tab.id).catch(() => {});
  }
}
