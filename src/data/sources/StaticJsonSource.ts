import type { Manifest, PackManifestEntry, RawPack } from '../records';
import type { DataSource } from './DataSource';

/**
 * 从 public/data 读取数据包。
 * 新增文献数据包（如《魏氏乐谱今译》）时，只需在 manifest.json 中登记目录与文件。
 */
export class StaticJsonSource implements DataSource {
  readonly id = 'static-json';
  private readonly root: string;

  constructor(root = `${import.meta.env.BASE_URL}data/`) {
    this.root = root;
  }

  private async getJson<T>(path: string): Promise<T> {
    const res = await fetch(this.root + path);
    if (!res.ok) throw new Error(`读取 ${path} 失败（HTTP ${res.status}）`);
    return (await res.json()) as T;
  }

  private async optional<T>(path: string | undefined, base: string): Promise<T[]> {
    if (!path) return [];
    return this.getJson<T[]>(base + path);
  }

  private async loadPack(entry: PackManifestEntry): Promise<RawPack> {
    const b = entry.base;
    const f = entry.files;
    const [tunePatterns, authors, poems, scores, performances] = await Promise.all([
      this.optional<RawPack['tunePatterns'][number]>(f.tunePatterns, b),
      this.optional<RawPack['authors'][number]>(f.authors, b),
      this.optional<RawPack['poems'][number]>(f.poems, b),
      this.optional<RawPack['scores'][number]>(f.scores, b),
      this.optional<RawPack['performances'][number]>(f.performances, b),
    ]);
    return { entry, tunePatterns, authors, poems, scores, performances };
  }

  async load() {
    const manifest = await this.getJson<Manifest>('manifest.json');
    const instruments = await this.getJson<import('../types').Instrument[]>(manifest.instruments);
    const packs = await Promise.all(manifest.packs.filter((p) => p.enabled !== false).map((p) => this.loadPack(p)));
    return { instruments, packs };
  }
}
