import { describe, expect, it } from '@jest/globals';
import { splitWidth } from '~/hooks/useSplitWidth';
import type { ScaledSize } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

// 复用 splitWidth 的入参形状：维度、安全区内边距、以及必填的限制项。
// hook 给了默认值（gap=0/width=0/reservedWidth=0/minNumColumns=3/maxSplitWidth=Infinity），
// 这里直接填上默认值，单测再按场景覆盖。
const dims = (width: number, height: number): ScaledSize => ({ width, height, scale: 1, fontScale: 1 });
const noInsets: EdgeInsets = { top: 0, bottom: 0, left: 0, right: 0 };
const baseOpts = { gap: 0, width: 0, reservedWidth: 0, minNumColumns: 3, maxSplitWidth: Infinity };

describe('splitWidth', () => {
  it('默认 3 列网格：竖屏手机宽度按 min(w,h)/minNumColumns 分列', () => {
    // 360x640 竖屏：maxWindowSplitWidth = min(360,640)/3 = 120
    // defaultWidth = 360，numColumns = floor(360/120) = 3
    // itemWidth = (360 - 0*(3+1))/3 = 120
    const r = splitWidth(dims(360, 640), noInsets, baseOpts);
    expect(r.numColumns).toBe(3);
    expect(r.itemWidth).toBe(120);
  });

  it('maxSplitWidth 较小时强制增加列数', () => {
    // 限定每项最大 90：min(90, 120)=90 → floor(360/90)=4 列
    const r = splitWidth(dims(360, 640), noInsets, { ...baseOpts, maxSplitWidth: 90 });
    expect(r.numColumns).toBe(4);
    // itemWidth = (360 - 0*(4+1))/4 = 90
    expect(r.itemWidth).toBe(90);
  });

  it('显式 width 覆盖 defaultWidth 参与列数与 itemWidth 计算', () => {
    // 用固定 300 作为可用宽度（忽略窗口宽度）：min(Inf,120)=120 → floor(300/120)=2，但被 minNumColumns=3 钳到 3
    const r = splitWidth(dims(360, 640), noInsets, { ...baseOpts, width: 300 });
    expect(r.numColumns).toBe(3);
    // itemWidth 基于 width=300：(300 - 0*(3+1))/3 = 100
    expect(r.itemWidth).toBe(100);
  });

  it('reservedWidth 从 defaultWidth 里扣除后参与分列（width=0 时走 defaultWidth）', () => {
    // 可用宽 defaultWidth = 360 - 60(reserved) = 300；floor(300/120)=2 → 钳到 minNumColumns=3
    // itemWidth = (300 - 0*(3+1))/3 = 100
    const r = splitWidth(dims(360, 640), noInsets, { ...baseOpts, reservedWidth: 60 });
    expect(r.numColumns).toBe(3);
    expect(r.itemWidth).toBe(100);
  });

  it('reservedWidth 配合显式 width：itemWidth 仍按 width 计算（width 非 0 优先）', () => {
    // width=300 优先于 defaultWidth，reservedWidth 只影响 defaultWidth 不影响 width 分支
    const r = splitWidth(dims(360, 640), noInsets, { ...baseOpts, width: 300, reservedWidth: 60 });
    expect(r.numColumns).toBe(3);
    expect(r.itemWidth).toBeCloseTo(300 / 3, 5);
  });

  it('安全区 left/right 内边距缩小 defaultWidth', () => {
    // 360 - 20 - 20 = 320 可用；floor(320/120)=2，被钳到 3
    const r = splitWidth(dims(360, 640), { top: 0, bottom: 0, left: 20, right: 20 }, baseOpts);
    expect(r.numColumns).toBe(3);
    expect(r.itemWidth).toBeCloseTo(320 / 3, 5);
  });

  it('gap 在 numColumns+1 处分摊，减少每项 itemWidth', () => {
    // 360 宽、4 列、gap=10：itemWidth = (360 - 10*(4+1))/4 = (360-50)/4 = 77.5
    const r = splitWidth(dims(360, 640), noInsets, { ...baseOpts, maxSplitWidth: 90, gap: 10 });
    expect(r.numColumns).toBe(4);
    expect(r.itemWidth).toBe(77.5);
  });

  it('minNumColumns 是列数的下界（更小的 floor 也会被钳到下界）', () => {
    // minNumColumns=5：maxWindowSplitWidth = min(360,640)/5 = 72；floor(360/72)=5，正好 5
    const r = splitWidth(dims(360, 640), noInsets, { ...baseOpts, minNumColumns: 5 });
    expect(r.numColumns).toBe(5);
    expect(r.itemWidth).toBe(360 / 5);
  });

  it('横屏用 min(w,h)=高度参与 maxWindowSplitWidth 计算（横屏更宽，列数随之增加）', () => {
    // 640x360 横屏：maxWindowSplitWidth = min(640,360)/3 = 120
    // numColumns = floor(640/120) = 5（横屏可用宽度更大，故列数比竖屏多）
    const r = splitWidth(dims(640, 360), noInsets, baseOpts);
    expect(r.numColumns).toBe(5);
    expect(r.itemWidth).toBeCloseTo(640 / 5, 5);
  });

  it('返回值原样带回 gap/windowWidth/windowHeight', () => {
    const r = splitWidth(dims(400, 800), { ...noInsets, left: 10, right: 10 }, { ...baseOpts, gap: 8 });
    expect(r.gap).toBe(8);
    expect(r.windowWidth).toBe(400);
    expect(r.windowHeight).toBe(800);
    // insets 原样回传（仅用于回显，不参与 defaultWidth 之外的运算）
    expect(r.insets).toEqual({ ...noInsets, left: 10, right: 10 });
  });
});
