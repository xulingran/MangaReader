import Base, { Plugin } from './base';
import MHGM from './mhgm';
import MBZ from './mbz';
import BZM from './bzm';
import RM5 from './rm5';
import HCOMIC from './hcomic';
import BIKA from './bika';
import NH from './nh';
import MOEIMG from './moeimg';

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
]);
export const combineHash = Base.combineHash;
export const splitHash = Base.splitHash;
export const defaultPlugin: Plugin = PluginMap.entries().next().value[0];
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
