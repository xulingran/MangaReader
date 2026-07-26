import { FileSystem, Dirs } from 'react-native-file-access';
import { ImageState } from '~/components/ComicImage';

type CacheMap = Record<string, Omit<ImageState, 'dataUrl' | 'loadStatus'>>;

const BASE_PATH = `${Dirs.DocumentDir}/@cache`;

// 单部漫画的缓存条目上限。条目只增不减时，离开阅读页的全量 stringify + 写盘成本
// 会随已读章节线性增长；超出上限按插入顺序逐出最旧条目（近似 LRU，阅读场景足够，
// 因为图片尺寸一旦写入基本不会变，旧条目被淘汰后也只是重新量一次尺寸）。
const MAX_CACHE_ENTRIES = 1000;

class Cache {
  private _path: string;
  private _cacheMap: CacheMap = {};
  private _dirty = false;

  constructor(identification: string) {
    this._path = `${BASE_PATH}/${identification}.json`;
  }

  async initCacheMap() {
    this._dirty = false;
    try {
      const dirExists = await FileSystem.exists(BASE_PATH);
      if (!dirExists) {
        await FileSystem.mkdir(BASE_PATH);
      }
      const exists = await FileSystem.exists(this._path);
      if (exists) {
        const content = await FileSystem.readFile(this._path);
        const parsed: unknown = JSON.parse(content);
        this._cacheMap =
          typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
            ? (parsed as CacheMap)
            : {};
      } else {
        await FileSystem.writeFile(this._path, JSON.stringify({}));
      }
    } catch (error) {
      console.error('An error in initCacheMap:', error);
    }
  }

  getImageState(uri: string) {
    return this._cacheMap[uri];
  }

  // 去掉不需要存的dataUrl和loadStatus
  setImageState(
    uri: string,
    { landscapeHeight, portraitHeight, multipleFitWidth, multipleFitHeight }: ImageState
  ) {
    this._cacheMap[uri] = { landscapeHeight, portraitHeight, multipleFitWidth, multipleFitHeight };
    this._dirty = true;
    // JS 对象保持插入顺序，超限时逐出最旧条目，防止单部漫画的缓存无界增长
    const keys = Object.keys(this._cacheMap);
    if (keys.length > MAX_CACHE_ENTRIES) {
      for (const key of keys.slice(0, keys.length - MAX_CACHE_ENTRIES)) {
        delete this._cacheMap[key];
      }
    }
  }

  async storeCacheMap() {
    // 条目未变化时跳过写盘，避免离开阅读页时重复全量 stringify
    if (!this._dirty) {
      return;
    }
    // 先清脏标志再写盘：写盘期间 setImageState 写入的条目会重新置脏，
    // 留给下一次 storeCacheMap 落盘；若在 await 后才清标志，会把期间的
    // 并发置脏覆盖掉，导致新条目永不落盘。
    // JSON.stringify 在调用时同步求值，写盘内容即此刻的快照。
    this._dirty = false;
    try {
      await FileSystem.writeFile(this._path, JSON.stringify(this._cacheMap));
    } catch (error) {
      // 写盘失败恢复脏标志，下次 storeCacheMap 重试
      this._dirty = true;
      console.error('An error in storeCacheMap:', error);
    }
  }

  // 清除缓存
  static async clearCache() {
    try {
      const dirExists = await FileSystem.exists(BASE_PATH);
      if (dirExists) {
        await FileSystem.unlink(BASE_PATH);
      }
    } catch (error) {
      console.error('An error in clearCache:', error);
    }
  }
}

export default Cache;
