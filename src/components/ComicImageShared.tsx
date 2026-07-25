import React, { useMemo } from 'react';
import type { DimensionValue, ImageResizeMode } from 'react-native';
import { Center, Icon, Text } from 'native-base';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { AsyncStatus, LayoutMode, Orientation } from '~/utils';
import { useThemePalette } from '~/utils/theme/hooks';
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
