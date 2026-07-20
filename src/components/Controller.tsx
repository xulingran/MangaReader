import React, { ReactNode, memo, useCallback, useMemo, useRef } from 'react';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
import { useDebouncedSafeAreaInsets, useDebouncedSafeAreaFrame } from '~/hooks';
import { emptyFn, PositionX, SafeArea } from '~/utils';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useFocusEffect } from '@react-navigation/native';

const doubleTapScaleValue = 2;

export interface ControllerProps {
  onTap?: (position: PositionX) => void;
  onLongPress?: (position: PositionX) => void;
  onZoomStart?: (scale: number) => void;
  onZoomEnd?: (scale: number) => void;
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
 * - pan 缩放态用 shared value 而非 useState，避免缩放切换触发整个组件 re-render
 * - 5 个 Gesture 对象用 useMemo 缓存，回调读取 ref，避免每次 render 重建
 * - 14 个 Reanimated shared value 是 worklet 必需的载体，保留不变
 */
const Controller = ({
  children,
  horizontal = false,
  safeAreaType = SafeArea.None,
  onTap,
  onLongPress,
  onZoomStart = emptyFn,
  onZoomEnd = emptyFn,
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

  // 回调 ref：让 Gesture 对象的依赖保持稳定，回调读取最新引用
  const onTapRef = useRef(onTap);
  const onLongPressRef = useRef(onLongPress);
  const onZoomStartRef = useRef(onZoomStart);
  const onZoomEndRef = useRef(onZoomEnd);
  onTapRef.current = onTap;
  onLongPressRef.current = onLongPress;
  onZoomStartRef.current = onZoomStart;
  onZoomEndRef.current = onZoomEnd;
  const hasLongPressRef = useRef(onLongPress !== undefined);
  hasLongPressRef.current = onLongPress !== undefined;

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

  // 手势对象只依赖布局相关稳定值；shared value 引用在生命周期内稳定，不进依赖
  const gestures = useMemo(() => {
    const singleTap = Gesture.Tap()
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
      });
    const doubleTap = Gesture.Tap()
      .maxDuration(300)
      .maxDelay(300)
      .numberOfTaps(2)
      .onStart((e) => {
        'worklet';
        runOnJS(onZoomStartRef.current)(scale.value);
        if (savedScale.value > 1) {
          // 电子墨水版：双击复位瞬时完成，无补间动画
          scale.value = 1;
          translationX.value = 0;
          translationY.value = 0;

          savedScale.value = 1;
          savedTranslationX.value = 0;
          savedTranslationY.value = 0;
        } else {
          // 电子墨水版：双击放大瞬时完成，无补间动画
          scale.value = doubleTapScaleValue;
          const currentX = (windowWidth / doubleTapScaleValue - e.x) * (doubleTapScaleValue - 1);
          const currentY = (windowHeight / doubleTapScaleValue - e.y) * (doubleTapScaleValue - 1);
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
        }
      })
      .onEnd(() => {
        'worklet';
        runOnJS(onZoomEndRef.current)(scale.value > 1 ? 1 : doubleTapScaleValue);
      });
    const longPress = Gesture.LongPress()
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
      });
    const pinchGesture = Gesture.Pinch()
      .onStart((e) => {
        'worklet';
        focalX.value = e.focalX;
        focalY.value = e.focalY;
        runOnJS(onZoomStartRef.current)(scale.value);
      })
      .onChange((e) => {
        'worklet';
        const prevScale = savedScale.value;
        const currentScale = Math.min(Math.max(savedScale.value * e.scale, 1), 4);

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
      .onEnd(() => {
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
        runOnJS(onZoomEndRef.current)(scale.value);
      });
    const panGesture = Gesture.Pan()
      .minPointers(1)
      .maxPointers(1)
      // 不用 .enabled(sharedValue)（类型不接受），改为在 onChange 内部通过 savedScale===1 短路；
      // 这样手势对象只构造一次，缩放切换不触发 Controller re-render
      .onChange((e) => {
        'worklet';
        const currentX = translationX.value + e.changeX;
        const currentY = translationY.value + e.changeY;

        if (savedScale.value === 1) {
          return;
        }

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
      });

    return { singleTap, doubleTap, longPress, pinchGesture, panGesture };
    // shared value 与 ref 引用在生命周期内稳定，不进依赖；eslint 无法识别该稳定性，故禁用 exhaustive-deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horizontal, oneThirdWidth, windowWidth, windowHeight]);

  const exclusiveGesture = useMemo(() => {
    return hasLongPressRef.current
      ? Gesture.Exclusive(gestures.doubleTap, gestures.singleTap, gestures.longPress)
      : Gesture.Exclusive(gestures.doubleTap, gestures.singleTap);
  }, [gestures]);

  return (
    <GestureDetector gesture={exclusiveGesture}>
      <GestureDetector gesture={gestures.pinchGesture}>
        <GestureDetector gesture={gestures.panGesture}>
          <Animated.View style={animatedStyle}>{children}</Animated.View>
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
