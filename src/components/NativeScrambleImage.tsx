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
import { useStaticSafeAreaFrame, useStaticSafeAreaInsets } from '~/hooks';
import { useLatestRef } from '~/hooks/useLatestRef';
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
  const { top, left, right, bottom } = useStaticSafeAreaInsets();
  const { width: windowWidth, height: windowHeight, orientation } = useStaticSafeAreaFrame();
  const [state, setState] = useState(prevState);
  const [retry, setRetry] = useState(0);
  const tempPath = useRef<string | null>(null);
  // 加载 effect 只依赖真实输入；prevState/index/onRelease 经 ref 读取最新值，
  // 避免它们的引用变化触发整条重载（删临时文件 + 重新解密）
  const prevStateRef = useLatestRef(prevState);
  const indexRef = useLatestRef(index);
  const onReleaseRef = useLatestRef(onRelease);
  // 几何尺寸（窗口/insets）挂载时已冻结（useStaticSafeArea*，见该 hook 注释），
  // ref 持有仅为让加载 effect 只依赖真实输入，不触发「下载+解密」整条重跑。
  // 旋转屏会经 Reader 的 key={orientation} 整体 remount，组件随之按新尺寸重新加载；
  // 用「不原地重解码」换 IO 是电子墨水场景的有意取舍。
  const dimsRef = useLatestRef({ windowWidth, windowHeight, top, left, right, bottom });

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
    // ref 对象引用稳定，进 deps 不会触发重建
  }, [indexRef, onReleaseRef]);

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
      // 原生侧现已输出 JPEG（RGB_565 + q85），后缀同步为 .jpg，避免 Fresco 按文件头误判。
      const outputPath = `${IMAGE_PROCESSOR_OUTPUT_DIR}/${nanoid()}.jpg`;
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
      const dims = dimsRef.current;
      const { dWidth, dHeight } = aspectFit(
        { width, height },
        {
          width: (dims.windowWidth - dims.left - dims.right) / 2,
          height: dims.windowHeight - dims.top - dims.bottom,
        }
      );
      const nextState: ImageState = {
        dataUrl: `file://${result.path}`,
        multipleFitWidth: dWidth,
        multipleFitHeight: dHeight,
        landscapeHeight: (height / width) * Math.max(dims.windowWidth, dims.windowHeight),
        portraitHeight: (height / width) * Math.min(dims.windowWidth, dims.windowHeight),
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
    // 几何尺寸经 dimsRef 读取，不进 deps —— 防止尺寸变化触发整章重解码。
    // （ref 对象引用稳定，列入 deps 仅为满足 eslint，不会触发重跑）
  }, [headers, release, retry, uri, dimsRef, prevStateRef]);

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
