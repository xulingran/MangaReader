import { FileSystem, Dirs } from 'react-native-file-access';
import { ImageState } from '~/components/ComicImage';

type CacheMap = Record<string, Omit<ImageState, 'dataUrl' | 'loadStatus'>>;

const BASE_PATH = `${Dirs.DocumentDir}/@cache`;

class Cache {
  private _path: string;
  private _cacheMap: CacheMap = {};

  constructor(identification: string) {
    this._path = `${BASE_PATH}/${identification}.json`;
  }

  async initCacheMap() {
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
  }

  async storeCacheMap() {
    try {
      await FileSystem.writeFile(this._path, JSON.stringify(this._cacheMap));
    } catch (error) {
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
