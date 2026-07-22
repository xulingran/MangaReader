import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, type DimensionValue, type ImageResizeMode } from 'react-native';
import { Box, Center, Icon, Text } from 'native-base';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { CacheManager } from '@georstat/react-native-image-cache';
import { FileSystem } from 'react-native-file-access';
import { nanoid } from '@reduxjs/toolkit';
import { aspectFit, AsyncStatus, getRM5SplitCount, LayoutMode, Orientation } from '~/utils';
import {
  IMAGE_PROCESSOR_OUTPUT_DIR,
  ImageProcessor,
  unlinkTemporaryImage,
} from '~/utils/imageProcessor';
import { useDebouncedSafeAreaFrame, useDebouncedSafeAreaInsets } from '~/hooks';
import ErrorWithRetry from './ErrorWithRetry';
import type { ComicImageProps, ImageState } from './ComicImage';
import { useThemePalette } from '~/utils/theme/hooks';

const MAX_PIXEL_SIZE = 8_000_000;
const resizeMode: Record<LayoutMode, ImageResizeMode> = {
  [LayoutMode.Horizontal]: 'contain',
  [LayoutMode.Vertical]: 'cover',
  [LayoutMode.Multiple]: 'contain',
};
const EMPTY_STATE: ImageState = { dataUrl: '', loadStatus: AsyncStatus.Default };
const EMPTY_HEADERS: Record<string, string> = {};

const Placeholder = () => {
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

const NativeScrambleImage = ({
  uri,
  index,
  headers = EMPTY_HEADERS,
  layoutMode = LayoutMode.Horizontal,
  prevState = EMPTY_STATE,
  defaultPortraitHeight,
  defaultLandscapeHeight,
  onChange,
  onRelease,
}: ComicImageProps) => {
  const { top, left, right, bottom } = useDebouncedSafeAreaInsets();
  const { width: windowWidth, height: windowHeight, orientation } = useDebouncedSafeAreaFrame();
  const [state, setState] = useState(prevState);
  const [retry, setRetry] = useState(0);
  const tempPath = useRef<string | null>(null);

  const style = useMemo<{ width: DimensionValue; height: DimensionValue }>(() => {
    if (layoutMode === LayoutMode.Horizontal) {
      return { width: '100%', height: '100%' };
    }
    if (layoutMode === LayoutMode.Vertical) {
      return {
        width: '100%',
        height:
          orientation === Orientation.Landscape
            ? state.landscapeHeight || defaultLandscapeHeight
            : state.portraitHeight || defaultPortraitHeight,
      };
    }
    return {
      width: state.multipleFitWidth || '100%',
      height: state.multipleFitHeight || '100%',
    };
  }, [
    defaultLandscapeHeight,
    defaultPortraitHeight,
    layoutMode,
    orientation,
    state,
  ]);

  const release = useCallback(
    (path = tempPath.current) => {
      if (path) {
        unlinkTemporaryImage(path);
        if (tempPath.current === path) {
          tempPath.current = null;
          onRelease?.(index);
        }
      }
    },
    [index, onRelease]
  );

  const handleImageError = useCallback(() => {
    release();
    const failedState = { ...EMPTY_STATE, loadStatus: AsyncStatus.Rejected };
    setState(failedState);
    onChange?.(failedState, index);
  }, [index, onChange, release]);

  useEffect(() => {
    let aborted = false;
    let currentRequestId: string | null = null;
    setState({ ...prevState, loadStatus: AsyncStatus.Pending });

    const load = async () => {
      await FileSystem.mkdir(IMAGE_PROCESSOR_OUTPUT_DIR).catch(() => {});
      if (aborted) {
        return;
      }
      const sourcePath = await CacheManager.get(uri, { headers }).getPath();
      if (aborted) {
        return;
      }
      if (!sourcePath) {
        throw new Error('扰乱图片下载失败');
      }
      currentRequestId = nanoid();
      const outputPath = `${IMAGE_PROCESSOR_OUTPUT_DIR}/${nanoid()}.png`;
      const result = await ImageProcessor.unscramble(
        sourcePath,
        outputPath,
        getRM5SplitCount(uri),
        MAX_PIXEL_SIZE,
        currentRequestId
      );
      currentRequestId = null;
      if (aborted) {
        release(result.path);
        return;
      }

      release();
      tempPath.current = result.path;
      const { width, height } = result;
      const { dWidth, dHeight } = aspectFit(
        { width, height },
        {
          width: (windowWidth - left - right) / 2,
          height: windowHeight - top - bottom,
        }
      );
      const nextState: ImageState = {
        dataUrl: `file://${result.path}`,
        multipleFitWidth: dWidth,
        multipleFitHeight: dHeight,
        landscapeHeight: (height / width) * Math.max(windowWidth, windowHeight),
        portraitHeight: (height / width) * Math.min(windowWidth, windowHeight),
        loadStatus: AsyncStatus.Fulfilled,
      };
      setState(nextState);
    };

    load().catch(() => {
      if (!aborted) {
        setState({ ...EMPTY_STATE, loadStatus: AsyncStatus.Rejected });
      }
    });

    return () => {
      aborted = true;
      if (currentRequestId) {
        ImageProcessor.cancel(currentRequestId);
        currentRequestId = null;
      }
      release();
    };
  }, [
    bottom,
    headers,
    index,
    left,
    onChange,
    prevState,
    release,
    retry,
    right,
    top,
    uri,
    windowHeight,
    windowWidth,
  ]);

  if (state.loadStatus === AsyncStatus.Rejected) {
    return (
      <Center style={style}>
        <ErrorWithRetry
          onRetry={async () => {
            await CacheManager.removeCacheEntry(uri).catch(() => {});
            setRetry((value) => value + 1);
          }}
        />
      </Center>
    );
  }
  if (state.loadStatus !== AsyncStatus.Fulfilled) {
    return (
      <Box style={style}>
        <Placeholder />
      </Box>
    );
  }
  return (
    <Image
      style={style}
      resizeMode={resizeMode[layoutMode]}
      source={{ uri: state.dataUrl }}
      onLoad={() => onChange?.(state, index)}
      onError={handleImageError}
    />
  );
};

export default NativeScrambleImage;
