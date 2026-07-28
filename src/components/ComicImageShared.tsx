import React, { useMemo } from 'react';
import type { DimensionValue, ImageResizeMode } from 'react-native';
import { Center, Icon, Text } from 'native-base';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { AsyncStatus, LayoutMode, Orientation } from '~/utils';
import { useThemePalette } from '~/utils/theme/hooks';
import { useStaticSafeAreaFrame, useStaticSafeAreaInsets } from '~/hooks';
import type { ImageState } from './ComicImage';

/** ComicImage 与 NativeScrambleImage 共用的常量、占位组件与填充样式 hook */

export const EMPTY_HEADERS: Record<string, string> = {};
export const EMPTY_IMAGE_STATE: ImageState = { dataUrl: '', loadStatus: AsyncStatus.Default };
export const resizeModeDict: Record<LayoutMode, ImageResizeMode> = {
  [LayoutMode.Horizontal]: 'contain',
  [LayoutMode.Vertical]: 'cover',
  [LayoutMode.Multiple]: 'contain',
};

export const ImagePlaceholder = () => {
  const palette = useThemePalette();
  return (
    <Center
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      bg={palette.imagePlaceholder}
    >
      <Icon as={MaterialIcons} name="image" size={10} color={palette.disabled} />
      <Text color={palette.subText} fontSize="sm" pt={1}>
        加载中…
      </Text>
    </Center>
  );
};

export const useFillStyle = (
  layoutMode: LayoutMode,
  imageState: ImageState,
  orientation: Orientation,
  defaultPortraitHeight: number,
  defaultLandscapeHeight: number
) =>
  useMemo<{ width: DimensionValue; height: DimensionValue }>(() => {
    if (layoutMode === LayoutMode.Horizontal) {
      return { width: '100%', height: '100%' };
    }
    if (layoutMode === LayoutMode.Vertical) {
      return {
        width: '100%',
        height:
          orientation === Orientation.Landscape
            ? imageState.landscapeHeight || defaultLandscapeHeight
            : imageState.portraitHeight || defaultPortraitHeight,
      };
    }
    return {
      width: imageState.multipleFitWidth || '100%',
      height: imageState.multipleFitHeight || '100%',
    };
  }, [defaultLandscapeHeight, defaultPortraitHeight, imageState, layoutMode, orientation]);

/**
 * 漫画图 `<Image>` 的显式像素尺寸。在本组件树（GestureDetector + reanimated
 * Animated.View）中，RN Image 按百分比尺寸（100%×100%）布局时既不渲染也不
 * 上报 onLoad/onError，页面永远停在占位图；给定具体像素值后加载与显示恢复
 * 正常（MuMu 模拟器实测）。尺寸语义与 useFillStyle 一致，仅把百分比换成
 * 冻结窗口尺寸算出的像素值；外层 Box 仍用 useFillStyle 的结果。
 */
export const useConcreteImageStyle = (
  layoutMode: LayoutMode,
  imageState: ImageState,
  orientation: Orientation,
  defaultPortraitHeight: number,
  defaultLandscapeHeight: number
) => {
  const { top, left, right, bottom } = useStaticSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useStaticSafeAreaFrame();

  return useMemo<{ width: number; height: number }>(() => {
    const contentWidth = windowWidth - left - right;
    const contentHeight = windowHeight - top - bottom;
    if (layoutMode === LayoutMode.Horizontal) {
      return { width: contentWidth, height: contentHeight };
    }
    if (layoutMode === LayoutMode.Vertical) {
      return {
        width: contentWidth,
        height:
          orientation === Orientation.Landscape
            ? imageState.landscapeHeight || defaultLandscapeHeight
            : imageState.portraitHeight || defaultPortraitHeight,
      };
    }
    return {
      width: imageState.multipleFitWidth || contentWidth / 2,
      height: imageState.multipleFitHeight || contentHeight,
    };
  }, [
    bottom,
    defaultLandscapeHeight,
    defaultPortraitHeight,
    imageState,
    layoutMode,
    left,
    orientation,
    right,
    top,
    windowHeight,
    windowWidth,
  ]);
};
