import Base, { Plugin } from './base';
import MHGM from './mhgm';
import MBZ from './mbz';
import BZM from './bzm';
import RM5 from './rm5';
import HCOMIC from './hcomic';
import BIKA from './bika';
import NH from './nh';
import MOEIMG from './moeimg';
import MANHUAUK from './manhuauk';

export * from './base';

export const PluginMap = new Map<Plugin, Base>([
  [MBZ.id, MBZ],
  [MHGM.id, MHGM],
  [RM5.id, RM5],
  [BZM.id, BZM],
  [HCOMIC.id, HCOMIC],
  [BIKA.id, BIKA],
  [NH.id, NH],
  [MOEIMG.id, MOEIMG],
  [MANHUAUK.id, MANHUAUK],
]);
export const combineHash = Base.combineHash;
export const splitHash = Base.splitHash;

/**
 * hash 是否指向已注册插件的合法条目。
 *
 * 特意不复用 splitHash：本函数用于过滤已删除插件遗留的脏数据，splitHash 遇到非法
 * plugin 段会抛错，而这里需要安全地返回 false。约定见 base.ts combineHash 的注释
 * （mangaId / chapterId 不允许包含 '&'）。
 */
export function isRegisteredHash(hash: unknown): hash is string {
  if (typeof hash !== 'string') {
    return false;
  }
  const [source, mangaId = ''] = hash.split('&');
  return !!mangaId && PluginMap.has(source as Plugin);
}

export const defaultPlugin: Plugin = MBZ.id;
export const defaultPluginList = Array.from(PluginMap.values()).map((item) => {
  return {
    label: item.shortName,
    name: item.name,
    value: item.id,
    score: item.score,
    href: item.href,
    userAgent: item.userAgent,
    description: item.description,
    disabled: item.disabled,
    injectedJavaScript: item.injectedJavaScript,
  };
});
