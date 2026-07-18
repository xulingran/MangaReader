import Base, { Plugin } from './base';
import MHGM from './mhgm';
import MBZ from './mbz';
import BZM from './bzm';
import RM5 from './rm5';

export * from './base';

export const PluginMap = new Map<Plugin, Base>([
  [MBZ.id, MBZ],
  [MHGM.id, MHGM],
  [RM5.id, RM5],
  [BZM.id, BZM],
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
