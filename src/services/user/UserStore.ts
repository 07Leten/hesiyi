import type { Score } from '../../data/types';

/**
 * 用户数据存储接口。
 * 目前实现为浏览器本地存储；接入用户系统后，可换成调用后端的实现而不改页面代码。
 */

export interface RecentEntry {
  scoreId: string;
  poemId: string;
  title: string;
  at: number;
}

export interface Creation {
  id: string;
  createdAt: number;
  title: string;
  providerId: string;
  providerLabel: string;
  isAI: boolean;
  /** 生成参数，便于复现 */
  request: Record<string, unknown>;
  score: Score;
  layers: { instrumentId: string; presetId: string; gain: number; octaveShift: number; enabled: boolean }[];
}

export interface UserSnapshot {
  recent: RecentEntry[];
  favorites: string[];
  creations: Creation[];
}

export interface UserStore {
  getSnapshot(): UserSnapshot;
  subscribe(fn: () => void): () => void;
  pushRecent(e: Omit<RecentEntry, 'at'>): void;
  clearRecent(): void;
  toggleFavorite(poemId: string): void;
  saveCreation(c: Creation): void;
  removeCreation(id: string): void;
}

const KEY = 'hesiyi:user:v1';
const MAX_RECENT = 12;

export class LocalUserStore implements UserStore {
  private snap: UserSnapshot;
  private listeners = new Set<() => void>();

  constructor() {
    this.snap = this.read();
  }

  private read(): UserSnapshot {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const v = JSON.parse(raw) as Partial<UserSnapshot>;
        return { recent: v.recent ?? [], favorites: v.favorites ?? [], creations: v.creations ?? [] };
      }
    } catch {
      /* 本地存储不可用或数据损坏时从空白开始 */
    }
    return { recent: [], favorites: [], creations: [] };
  }

  private write(next: UserSnapshot) {
    this.snap = next;
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* 存储已满或被禁用时仅保留在内存中 */
    }
    this.listeners.forEach((fn) => fn());
  }

  getSnapshot = () => this.snap;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  pushRecent(e: Omit<RecentEntry, 'at'>) {
    const recent = [{ ...e, at: Date.now() }, ...this.snap.recent.filter((r) => r.scoreId !== e.scoreId)].slice(0, MAX_RECENT);
    this.write({ ...this.snap, recent });
  }

  clearRecent() {
    this.write({ ...this.snap, recent: [] });
  }

  toggleFavorite(poemId: string) {
    const has = this.snap.favorites.includes(poemId);
    this.write({ ...this.snap, favorites: has ? this.snap.favorites.filter((f) => f !== poemId) : [poemId, ...this.snap.favorites] });
  }

  saveCreation(c: Creation) {
    this.write({ ...this.snap, creations: [c, ...this.snap.creations.filter((x) => x.id !== c.id)] });
  }

  removeCreation(id: string) {
    this.write({ ...this.snap, creations: this.snap.creations.filter((x) => x.id !== id) });
  }
}

export const userStore: UserStore = new LocalUserStore();
