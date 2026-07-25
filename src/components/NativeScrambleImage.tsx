import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'react-native';
import { Box, Center } from 'native-base';
import { CacheManager } from '@georstat/react-native-image-cache';
import { FileSystem } from 'react-native-file-access';
import { nanoid } from '@reduxjs/toolkit';
import { aspectFit, AsyncStatus, getRM5SplitCount, LayoutMode } from '~/utils';
import {
  IMAGE_PROCESSOR_OUTPUT_DIR,
  ImageProcessor,
  unlinkTemporaryImage,
} from '~/utils/imageProcessor';
import { useDebouncedSafeAreaFrame, useDebouncedSafeAreaInsets } from '~/hooks';
import ErrorWithRetry from './ErrorWithRetry';
import {
  EMPTY_HEADERS,
  EMPTY_IMAGE_STATE,
  ImagePlaceholder,
  resizeModeDict,
  useFillStyle,
} from './ComicImageShared';
import type { ImageProps, ImageState } from './ComicImage';

const MAX_PIXEL_SIZE = 8_000_000;

const NativeScrambleImage = ({
  uri,
  index,
  headers = EMPTY_HEADERS,
  layoutMode = LayoutMode.Horizontal,
  prevState = EMPTY_IMAGE_STATE,
  defaultPortraitHeight,
  defaultLandscapeHeight,
  onChange,
  onRelease,
}: ImageProps) => {
  const { top, left, right, bottom } = useDebouncedSafeAreaInsets();
  const { width: windowWidth, height: windowHeight, orientation } = useDebouncedSafeAreaFrame();
  const [state, setState] = useState(prevState);
  const [retry, setRetry] = useState(0);
  const tempPath = useRef<string | null>(null);
  // 加载 effect 只依赖真实输入；prevState/index/onRelease 经 ref 读取最新值，
  // 避免它们的引用变化触发整条重载（删临时文件 + 重新解密）
  const prevStateRef = useRef(prevState);
  const indexRef = useRef(index);
  const onReleaseRef = useRef(onRelease);
  prevStateRef.current = prevState;
  indexRef.current = index;
  onReleaseRef.current = onRelease;

  const style = useFillStyle(
    layoutMode,
    state,
    orientation,
    defaultPortraitHeight,
    defaultLandscapeHeight
  );

  const release = useCallback((path = tempPath.current) => {
    if (path) {
      unlinkTemporaryImage(path);
      if (tempPath.current === path) {
        tempPath.current = null;
        onReleaseRef.current?.(indexRef.current);
      }
    }
  }, []);

  const handleImageError = useCallback(() => {
    release();
    const failedState = { ...EMPTY_IMAGE_STATE, loadStatus: AsyncStatus.Rejected };
    setState(failedState);
    onChange?.(failedState, index);
  }, [index, onChange, release]);

  useEffect(() => {
    let aborted = false;
    let currentRequestId: string | null = null;
    setState({ ...prevStateRef.current, loadStatus: AsyncStatus.Pending });

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
        setState({ ...EMPTY_IMAGE_STATE, loadStatus: AsyncStatus.Rejected });
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
  }, [bottom, headers, left, release, retry, right, top, uri, windowHeight, windowWidth]);

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
        <ImagePlaceholder />
      </Box>
    );
  }
  return (
    <Image
      style={style}
      resizeMode={resizeModeDict[layoutMode]}
      source={{ uri: state.dataUrl }}
      onLoad={() => onChange?.(state, index)}
      onError={handleImageError}
    />
  );
};

export default NativeScrambleImage;
