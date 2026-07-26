import React, { ReactNode, memo, useCallback, useMemo, useState } from 'react';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
import { useDebouncedSafeAreaInsets, useDebouncedSafeAreaFrame } from '~/hooks';
import { useLatestRef } from '~/hooks/useLatestRef';
import { emptyFn, PositionX, SafeArea } from '~/utils';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useFocusEffect } from '@react-navigation/native';
import type { AccessibilityActionEvent } from 'react-native';

const doubleTapScaleValue = 2;
const MAX_PINCH_SCALE = 4;

export interface ControllerProps {
  onTap?: (position: PositionX) => void;
  onLongPress?: (position: PositionX) => void;
  onZoomStart?: (scale: number) => void;
  onZoomEnd?: (scale: number) => void;
  onAccessibilityNext?: () => void;
  onAccessibilityPrevious?: () => void;
  /** 水平翻页滑动激活时调用（此时起内容不跟随手指） */
  onSwipeStart?: () => void;
  /** 水平翻页滑动松手时调用，上报手指水平位移，由调用方决策是否翻页 */
  onSwipe?: (translationX: number) => void;
  children: ReactNode;
  horizontal?: boolean;
  safeAreaType?: SafeArea;
}

export interface LongPressControllerProps {
  onLongPress?: (position: PositionX) => void;
  children: ReactNode;
}

/**
 * 电子墨水版 Controller：所有动画语义已移除（双击瞬时切换、无补间）。
 * 性能要点：
 * - 6 个 Gesture 对象各自独立 useMemo 缓存，回调读取 ref，避免每次 render 重建；
 *   panEnabled 切换只重建依赖它的缩放 Pan / 翻页 swipe Pan 两个手势
 * - 14 个 Reanimated shared value 是 worklet 必需的载体，保留不变
 * - 缩放 Pan 与翻页 swipe Pan 互斥，启用状态用 boolean state 控制：
 *   scale=1 时缩放 Pan 必须真正 .enabled(false)，否则手势识别器在 ~8dp 移动后
 *   会进入 ACTIVE 并 cancel 外层 FlashList 滚动；swipe Pan 反之，scale>1 时禁用。
 *   缩放切换是低频用户事件（双击/捏合），re-render 开销可接受。
 */
const Controller = ({
  children,
  horizontal = false,
  safeAreaType = SafeArea.None,
  onTap,
  onLongPress,
  onZoomStart = emptyFn,
  onZoomEnd = emptyFn,
  onAccessibilityNext,
  onAccessibilityPrevious,
  onSwipeStart,
  onSwipe,
}: ControllerProps) => {
  const insets = useDebouncedSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useDebouncedSafeAreaFrame();
  const oneThirdWidth = windowWidth / 3;

  const width = useSharedValue(windowWidth);
  const height = useSharedValue(windowHeight);

  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);
  const translationX = useSharedValue(0);
  const translationY = useSharedValue(0);
  const scale = useSharedValue(1);
  const top = useSharedValue(0);
  const left = useSharedValue(0);
  const right = useSharedValue(0);
  const bottom = useSharedValue(0);

  const savedTranslationX = useSharedValue(0);
  const savedTranslationY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  // 双击手势是否真正激活过：onFinalize 在识别失败/取消时也会触发，用它兜底
  const doubleTapActive = useSharedValue(false);

  // Pan 启用状态：放大后才允许平移，避免抢占外层 FlashList 横向翻页
  const [panEnabled, setPanEnabled] = useState(false);

  // 回调 ref：让 Gesture 对象的依赖保持稳定，回调读取最新引用
  const onTapRef = useLatestRef(onTap);
  const onLongPressRef = useLatestRef(onLongPress);
  const onZoomStartRef = useLatestRef(onZoomStart);
  const onZoomEndRef = useLatestRef(onZoomEnd);
  const onSwipeStartRef = useLatestRef(onSwipeStart);
  const onSwipeRef = useLatestRef(onSwipe);
  const hasLongPress = onLongPress !== undefined;
  const hasSwipe = onSwipe !== undefined;

  const safeAreaStyle = useMemo(() => {
    return {
      [SafeArea.All]: {
        paddingTop: insets.top,
        paddingLeft: insets.left,
        paddingRight: insets.right,
        paddingBottom: insets.bottom,
      },
      [SafeArea.X]: {
        paddingLeft: insets.left,
        paddingRight: insets.right,
      },
      [SafeArea.Y]: {
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      },
      [SafeArea.None]: {},
    }[safeAreaType];
  }, [insets, safeAreaType]);
  const animatedStyle = useAnimatedStyle(() => ({
    width: width.value,
    height: horizontal ? height.value : 'auto',
    transform: [
      { translateX: translationX.value },
      { translateY: translationY.value },
      { scale: scale.value },
    ],
    alignItems: 'center',
    justifyContent: 'center',
    ...safeAreaStyle,
  }));

  useFocusEffect(
    useCallback(() => {
      width.value = windowWidth;
      height.value = windowHeight;
    }, [width, height, windowWidth, windowHeight])
  );

  // 每个手势独立 useMemo：shared value 与 ref 引用在生命周期内稳定，不进依赖；
  // eslint 无法识别该稳定性，故逐条禁用 exhaustive-deps
  const singleTap = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .maxDuration(300)
        .numberOfTaps(1)
        .onStart((e) => {
          const handler = onTapRef.current;
          if (!handler) {
            return;
          }
          if (savedScale.value === 1 && horizontal) {
            if (e.x < oneThirdWidth) {
              handler(PositionX.Left);
            } else if (e.x < oneThirdWidth * 2) {
              handler(PositionX.Mid);
            } else {
              handler(PositionX.Right);
            }
          } else {
            handler(PositionX.Mid);
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [horizontal, oneThirdWidth]
  );
  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(300)
        .maxDelay(300)
        .numberOfTaps(2)
        .onStart((e) => {
          'worklet';
          doubleTapActive.value = true;
          runOnJS(onZoomStartRef.current)(scale.value);
          if (savedScale.value > 1) {
            // 电子墨水版：双击复位瞬时完成，无补间动画
            scale.value = 1;
            translationX.value = 0;
            translationY.value = 0;
            top.value = 0;
            bottom.value = 0;
            left.value = 0;
            right.value = 0;

            savedScale.value = 1;
            savedTranslationX.value = 0;
            savedTranslationY.value = 0;
            runOnJS(setPanEnabled)(false);
          } else {
            // 电子墨水版：双击放大瞬时完成，无补间动画
            scale.value = doubleTapScaleValue;
            const currentX = (windowWidth / doubleTapScaleValue - e.x) * (doubleTapScaleValue - 1);
            const currentY =
              (windowHeight / doubleTapScaleValue - e.y) * (doubleTapScaleValue - 1);
            const dX = width.value * doubleTapScaleValue - windowWidth;
            const dY = height.value * doubleTapScaleValue - windowHeight;
            translationX.value = currentX;
            translationY.value = currentY;
            top.value = Math.max(dY / 2, 0);
            bottom.value = Math.max(dY / 2, 0);
            left.value = Math.max(dX / 2, 0);
            right.value = Math.max(dX / 2, 0);

            savedScale.value = doubleTapScaleValue;
            savedTranslationX.value = currentX;
            savedTranslationY.value = currentY;
            runOnJS(setPanEnabled)(doubleTapScaleValue > 1);
          }
        })
        .onFinalize(() => {
          'worklet';
          // onFinalize 在识别失败/取消（单击、翻页滑动、滚动）时也会触发；
          // 只有 onStart 真正激活过才上报 onZoomEnd，避免误触消费方的定时翻页状态
          if (!doubleTapActive.value) {
            return;
          }
          doubleTapActive.value = false;
          runOnJS(onZoomEndRef.current)(scale.value);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [windowWidth, windowHeight]
  );
  const longPress = useMemo(
    () =>
      Gesture.LongPress()
        .runOnJS(true)
        .minDuration(1000)
        .onStart((e) => {
          const handler = onLongPressRef.current;
          if (!handler || savedScale.value !== 1) {
            return;
          }
          if (e.x < oneThirdWidth) {
            handler(PositionX.Left);
          } else if (e.x < oneThirdWidth * 2) {
            handler(PositionX.Mid);
          } else {
            handler(PositionX.Right);
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [oneThirdWidth]
  );
  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onStart((e) => {
          'worklet';
          focalX.value = e.focalX;
          focalY.value = e.focalY;
          runOnJS(onZoomStartRef.current)(scale.value);
        })
        .onChange((e) => {
          'worklet';
          const prevScale = savedScale.value;
          const currentScale = Math.min(Math.max(savedScale.value * e.scale, 1), MAX_PINCH_SCALE);

          let currentX = savedTranslationX.value;
          let currentY = savedTranslationY.value;
          if (currentScale >= prevScale) {
            currentX += (windowWidth / 2 - focalX.value) * (currentScale / prevScale - 1);
            currentY += (windowHeight / 2 - focalY.value) * (currentScale / prevScale - 1);
          } else {
            currentX = (currentX / (prevScale - 1)) * (currentScale - 1);
            currentY = (currentY / (prevScale - 1)) * (currentScale - 1);
          }

          scale.value = currentScale;
          translationX.value = currentX;
          translationY.value = currentY;
        })
        .onFinalize(() => {
          'worklet';
          const dX = width.value * scale.value - windowWidth;
          const dY = height.value * scale.value - windowHeight;
          top.value = Math.max(dY / 2, 0);
          bottom.value = Math.max(dY / 2, 0);
          left.value = Math.max(dX / 2, 0);
          right.value = Math.max(dX / 2, 0);

          savedScale.value = scale.value;
          savedTranslationX.value = translationX.value;
          savedTranslationY.value = translationY.value;
          runOnJS(setPanEnabled)(scale.value > 1);
          runOnJS(onZoomEndRef.current)(scale.value);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [windowWidth, windowHeight]
  );
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .minPointers(1)
        .maxPointers(1)
        // .enabled 必须用 boolean，使识别器在 BEGAN 之前就完全不参与识别，
        // 否则 ~8dp 移动会进入 ACTIVE 并 cancel 外层 FlashList 的横向滚动。
        // panEnabled 由 pinch/doubleTap 在 worklet 中 runOnJS 切换。
        .enabled(panEnabled)
        .onChange((e) => {
          'worklet';
          // setPanEnabled 需要跨 UI/JS 线程触发一次 React 更新；复位后的极短窗口内
          // 仍可能收到旧 Pan 识别器事件，scale=1 时直接忽略，避免出现像素级偏移。
          if (savedScale.value <= 1) {
            return;
          }
          const currentX = translationX.value + e.changeX;
          const currentY = translationY.value + e.changeY;

          if (
            (currentX >= -left.value && currentX <= right.value) ||
            (currentX < -left.value && currentX > translationX.value) ||
            (currentX > right.value && currentX < translationX.value)
          ) {
            translationX.value = currentX;
          }
          if (
            (currentY >= -top.value && currentY <= bottom.value) ||
            (currentY < -top.value && currentY > translationY.value) ||
            (currentY > bottom.value && currentY < translationY.value)
          ) {
            translationY.value = currentY;
          }
        })
        .onEnd(() => {
          'worklet';
          savedTranslationX.value = translationX.value;
          savedTranslationY.value = translationY.value;
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panEnabled]
  );

  // 翻页 swipe Pan：仅 scale=1 时启用（与缩放 Pan 互斥），仅水平方向激活；
  // 不做任何 onChange 视觉跟随，松手把位移交给调用方（Reader）决策是否翻页。
  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minPointers(1)
        .maxPointers(1)
        .enabled(hasSwipe && !panEnabled)
        .activeOffsetX([-10, 10])
        .onStart(() => {
          onSwipeStartRef.current?.();
        })
        .onEnd((e) => {
          // panEnabled 经 runOnJS→setState 重建手势后才生效，窗口期内 scale>1 的
          // swipe 仍可能激活；这里兜底丢弃，避免带着缩放状态翻页（与缩放 Pan 的
          // savedScale.value <= 1 守卫同一思路）
          if (savedScale.value > 1) {
            return;
          }
          onSwipeRef.current?.(e.translationX);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasSwipe, panEnabled]
  );

  const exclusiveGesture = useMemo(() => {
    return hasLongPress
      ? Gesture.Exclusive(doubleTap, singleTap, longPress)
      : Gesture.Exclusive(doubleTap, singleTap);
  }, [doubleTap, singleTap, longPress, hasLongPress]);

  // 缩放 Pan 与翻页 swipe Pan 同一识别位；enabled 互斥，任一时刻至多一个可激活
  const panOrSwipeGesture = useMemo(
    () => Gesture.Race(panGesture, swipeGesture),
    [panGesture, swipeGesture]
  );

  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === 'increment') {
        onAccessibilityNext?.();
      } else if (event.nativeEvent.actionName === 'decrement') {
        onAccessibilityPrevious?.();
      } else if (event.nativeEvent.actionName === 'activate') {
        onTapRef.current?.(PositionX.Mid);
      }
    },
    [onAccessibilityNext, onAccessibilityPrevious, onTapRef]
  );

  return (
    <GestureDetector gesture={exclusiveGesture}>
      <GestureDetector gesture={pinchGesture}>
        <GestureDetector gesture={panOrSwipeGesture}>
          <Animated.View
            style={animatedStyle}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="漫画阅读区域"
            accessibilityHint="上调下一页，下调上一页，激活显示菜单"
            accessibilityActions={[
              { name: 'increment', label: '下一页' },
              { name: 'decrement', label: '上一页' },
              { name: 'activate', label: '显示菜单' },
            ]}
            onAccessibilityAction={handleAccessibilityAction}
          >
            {children}
          </Animated.View>
        </GestureDetector>
      </GestureDetector>
    </GestureDetector>
  );
};

export const LongPressController = ({ children, onLongPress }: LongPressControllerProps) => {
  const { width: windowWidth } = useDebouncedSafeAreaFrame();
  const oneThirdWidth = windowWidth / 3;

  const longPress = useMemo(
    () =>
      Gesture.LongPress()
        .runOnJS(true)
        .minDuration(1000)
        .onStart((e) => {
          if (onLongPress) {
            if (e.x < oneThirdWidth) {
              onLongPress(PositionX.Left);
            } else if (e.x < oneThirdWidth * 2) {
              onLongPress(PositionX.Mid);
            } else {
              onLongPress(PositionX.Right);
            }
          }
        }),
    [onLongPress, oneThirdWidth]
  );

  return <GestureDetector gesture={longPress}>{children}</GestureDetector>;
};

export default memo(Controller);
