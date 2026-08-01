import { describe, expect, it } from '@jest/globals';
import { resolveTapZone, clampPan, computeZoomEdges } from '~/utils/controllerLayout';
import { PositionX } from '~/utils';

describe('resolveTapZone', () => {
  const oneThird = 120; // 屏幕 360：左 [0,120) 中 [120,240) 右 [240,360]

  it('enabled=false 时（缩放或非横向）一律返回 Mid', () => {
    expect(resolveTapZone(10, oneThird, false)).toBe(PositionX.Mid);
    expect(resolveTapZone(200, oneThird, false)).toBe(PositionX.Mid);
    expect(resolveTapZone(359, oneThird, false)).toBe(PositionX.Mid);
  });

  it('左 1/3 区间（含边界点恰好等于 oneThirdWidth 归中点）', () => {
    expect(resolveTapZone(0, oneThird, true)).toBe(PositionX.Left);
    expect(resolveTapZone(119, oneThird, true)).toBe(PositionX.Left);
    // 边界：x === oneThirdWidth 落入中段
    expect(resolveTapZone(120, oneThird, true)).toBe(PositionX.Mid);
  });

  it('中 1/3 区间', () => {
    expect(resolveTapZone(150, oneThird, true)).toBe(PositionX.Mid);
    expect(resolveTapZone(239, oneThird, true)).toBe(PositionX.Mid);
    // 边界：x === oneThirdWidth*2 落入右段
    expect(resolveTapZone(240, oneThird, true)).toBe(PositionX.Right);
  });

  it('右 1/3 区间', () => {
    expect(resolveTapZone(300, oneThird, true)).toBe(PositionX.Right);
    expect(resolveTapZone(360, oneThird, true)).toBe(PositionX.Right);
  });
});

describe('clampPan', () => {
  it('仍在可移动区间内 → 允许跟随', () => {
    // 区间 [-50, 50]，current=0 在内
    expect(clampPan(0, -50, 50, 10)).toBe(true);
  });

  it('越左界但正往回走（current > prev）→ 允许跟随回弹', () => {
    // current=-60（越 -50 左界），prev=-70（更靠左），current>prev 表示在向右回
    expect(clampPan(-60, -50, 50, -70)).toBe(true);
  });

  it('越右界但正往回走（current < prev）→ 允许跟随回弹', () => {
    // current=60（越 50 右界），prev=70（更靠右），current<prev 表示在向左回
    expect(clampPan(60, -50, 50, 70)).toBe(true);
  });

  it('越左界且继续往外走（current <= prev）→ 不跟随', () => {
    expect(clampPan(-80, -50, 50, -60)).toBe(false);
  });

  it('越右界且继续往外走（current >= prev）→ 不跟随', () => {
    expect(clampPan(80, -50, 50, 70)).toBe(false);
  });
});

describe('computeZoomEdges', () => {
  it('放大后超出窗口：四向边距 = (scaled - window)/2', () => {
    // 图 400x600，窗口 200x300：dX=200 dY=300，边距各 100/150
    const e = computeZoomEdges(400, 600, 200, 300);
    expect(e.left).toBe(100);
    expect(e.right).toBe(100);
    expect(e.top).toBe(150);
    expect(e.bottom).toBe(150);
  });

  it('缩小到窗口内（scaled <= window）：边距为 0（Math.max(d/2,0)）', () => {
    // 图 100x100，窗口 200x300：dX=-100 dY=-200，max(-50,0)=0
    const e = computeZoomEdges(100, 100, 200, 300);
    expect(e.left).toBe(0);
    expect(e.right).toBe(0);
    expect(e.top).toBe(0);
    expect(e.bottom).toBe(0);
  });

  it('恰好等于窗口：边距为 0', () => {
    const e = computeZoomEdges(200, 300, 200, 300);
    expect(e).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });
});
