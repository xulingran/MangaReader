import { PositionX } from './enum';

/**
 * 点击区域判定：把屏幕水平三分（左/中/右）映射为翻页/菜单 PositionX。
 * 仅在「未缩放 + 横向模式」下生效，否则一律中点（避免误触翻页）。
 * 抽成纯函数以便测试边界（off-by-one），并消除 singleTap / longPress / LongPressController 三处重复。
 */
export const resolveTapZone = (x: number, oneThirdWidth: number, enabled: boolean): PositionX => {
  if (!enabled) {
    return PositionX.Mid;
  }
  if (x < oneThirdWidth) {
    return PositionX.Left;
  } else if (x < oneThirdWidth * 2) {
    return PositionX.Mid;
  } else {
    return PositionX.Right;
  }
};

/**
 * 平移钳制：放大后拖动时是否允许更新 translation。
 * 三条件任一满足即可跟随：仍在可移动区间内、越左界但往回走、越右界但往回走。
 * 对应 Controller panGesture.onChange 的两段独立判定（X / Y 各调一次）。
 * 返回 true 表示允许更新该轴的 translation。
 */
export const clampPan = (current: number, min: number, max: number, prev: number): boolean => {
  return (
    (current >= min && current <= max) ||
    (current < min && current > prev) ||
    (current > max && current < prev)
  );
};

/** 缩放后的可平移边距：放大到超出窗口时四向留 d/2，缩小到窗口内时为 0。 */
export const computeZoomEdges = (
  scaledWidth: number,
  scaledHeight: number,
  windowWidth: number,
  windowHeight: number
) => {
  const dX = scaledWidth - windowWidth;
  const dY = scaledHeight - windowHeight;
  return {
    top: Math.max(dY / 2, 0),
    bottom: Math.max(dY / 2, 0),
    left: Math.max(dX / 2, 0),
    right: Math.max(dX / 2, 0),
  };
};
