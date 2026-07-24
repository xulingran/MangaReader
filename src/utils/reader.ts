/**
 * 阅读器横向滑动结束后的目标页决策（纯函数，便于单元测试）
 * 输入为按 inverted 归一化后的手势位移（等效 contentOffset.x 变化语义：正数 = 下一页方向）。
 * 规则：
 * - 位移距离小于阈值 → 回当前页
 * - 达到阈值按方向移动一页（最多一页，禁止惯性连翻）
 * - 边界 clamp 在 [0, maxIndex]
 */

/** 触发翻页的滑动距离占屏宽比例 */
export const DRAG_PAGE_THRESHOLD_RATIO = 0.2;

/**
 * 相邻页磁盘预取窗口：优先当前页两侧，再额外准备后两页。
 * 只返回普通图片；扰乱图片仍由可见组件按需处理，避免离屏解码占用。
 */
export const getReaderPrefetchUris = <
  T extends { uri: string; needUnscramble?: boolean },
>(data: readonly T[], currentIndex: number): string[] => {
  const indexes = [currentIndex + 1, currentIndex - 1, currentIndex + 2];

  return indexes.reduce<string[]>((uris, index) => {
    const image = data[index];
    if (image && !image.needUnscramble && !uris.includes(image.uri)) {
      uris.push(image.uri);
    }
    return uris;
  }, []);
};

export interface DragTargetParams {
  /** 松手时按 inverted 归一化后的水平位移（等效 contentOffset.x 变化） */
  deltaX: number;
  /** 拖动起始时所在的 index */
  currentIndex: number;
  /** 最大 index */
  maxIndex: number;
  /** 触发翻页的最小拖动距离（px） */
  threshold: number;
}

export const resolveDragTargetIndex = ({
  deltaX,
  currentIndex,
  maxIndex,
  threshold,
}: DragTargetParams): number => {
  const safeMax = Math.max(maxIndex, 0);
  let target = currentIndex;

  if (Math.abs(deltaX) >= threshold && threshold > 0) {
    // 正位移 → 下一页；负位移 → 上一页（调用方已按 inverted 归一化手势方向）
    target = currentIndex + (deltaX > 0 ? 1 : -1);
  }

  return Math.min(Math.max(target, 0), safeMax);
};
