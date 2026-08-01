import { describe, expect, it } from '@jest/globals';
import { groupIntoSpreads, spreadGlobalPage } from '~/utils/readerSpreads';
import { MultipleSeat } from '~/utils';

// 最小可分组项：只需 chapterHash（与 pre/current 分开测试 spreadGlobalPage）
const img = (chapterHash: string, label: string) => ({ chapterHash, label });

const hashesOf = (groups: { chapterHash: string; label: string }[][]) =>
  groups.map((g) => g.map((item) => item.label));

describe('groupIntoSpreads', () => {
  it('单章节偶数页 → 两两成对', () => {
    const data = [img('c1', 'a'), img('c1', 'b'), img('c1', 'c'), img('c1', 'd')];
    const groups = groupIntoSpreads(data, MultipleSeat.AToB);
    expect(hashesOf(groups)).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('单章节奇数页 → 末页单独成组', () => {
    const data = [img('c1', 'a'), img('c1', 'b'), img('c1', 'c')];
    const groups = groupIntoSpreads(data, MultipleSeat.AToB);
    expect(hashesOf(groups)).toEqual([['a', 'b'], ['c']]);
  });

  it('跨章节边界：第一章末页单独成组，第二章重新两两配对（不跨章错位）', () => {
    // c1 三页（末页 c 必须单独），c2 两页：[a,b],[c],[d,e]
    const data = [
      img('c1', 'a'),
      img('c1', 'b'),
      img('c1', 'c'),
      img('c2', 'd'),
      img('c2', 'e'),
    ];
    const groups = groupIntoSpreads(data, MultipleSeat.AToB);
    expect(hashesOf(groups)).toEqual([['a', 'b'], ['c'], ['d', 'e']]);
  });

  it('第一章单页 + 第二章单页：两者不配对（chapterHash 不同），各自单独成组', () => {
    const data = [img('c1', 'a'), img('c2', 'b')];
    const groups = groupIntoSpreads(data, MultipleSeat.AToB);
    expect(hashesOf(groups)).toEqual([['a'], ['b']]);
  });

  it('seat=AToB 保持 [第一张, 第二张] 顺序', () => {
    const data = [img('c1', 'a'), img('c1', 'b')];
    const groups = groupIntoSpreads(data, MultipleSeat.AToB);
    expect(groups[0].map((item) => item.label)).toEqual(['a', 'b']);
  });

  it('seat=BToA 反转每组内部顺序为 [第二张, 第一张]', () => {
    const data = [img('c1', 'a'), img('c1', 'b'), img('c1', 'c')];
    const groups = groupIntoSpreads(data, MultipleSeat.BToA);
    expect(hashesOf(groups)).toEqual([['b', 'a'], ['c']]);
  });

  it('空 data → 空数组', () => {
    expect(groupIntoSpreads([], MultipleSeat.AToB)).toEqual([]);
  });

  it('单项 → 单独成组（无论 seat）', () => {
    const data = [img('c1', 'a')];
    expect(hashesOf(groupIntoSpreads(data, MultipleSeat.AToB))).toEqual([['a']]);
    expect(hashesOf(groupIntoSpreads(data, MultipleSeat.BToA))).toEqual([['a']]);
  });
});

describe('spreadGlobalPage', () => {
  it('pre + current - 1 投影全局页码', () => {
    // 某章节基址 pre=10，组内第一项章内偏移 current=3 → 全局第 12 页
    expect(spreadGlobalPage([{ pre: 10, current: 3 }, { pre: 10, current: 4 }])).toBe(12);
  });

  it('章节首页 current=1 → 全局页 = pre', () => {
    expect(spreadGlobalPage([{ pre: 20, current: 1 }])).toBe(20);
  });
});
