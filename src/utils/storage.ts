import { MMKV } from 'react-native-mmkv';

// 保持默认实例 ID，兼容已安装版本的本地数据。
const mmkv = new MMKV();

export type KeyValuePair = [string, string | null];

export const Storage = {
  async getItem(key: string) {
    return mmkv.getString(key) ?? null;
  },
  async setItem(key: string, value: string) {
    mmkv.set(key, value);
  },
  async removeItem(key: string) {
    mmkv.delete(key);
  },
  async multiGet(keys: string[]): Promise<readonly KeyValuePair[]> {
    return keys.map((key): KeyValuePair => [key, mmkv.getString(key) ?? null]);
  },
  async multiSet(pairs: [string, string][]) {
    pairs.forEach(([key, value]) => mmkv.set(key, value));
  },
  async multiRemove(keys: string[]) {
    keys.forEach((key) => mmkv.delete(key));
  },
  async getAllKeys() {
    return mmkv.getAllKeys();
  },
  async clear() {
    mmkv.clearAll();
  },
};
