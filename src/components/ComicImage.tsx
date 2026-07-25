import React, { memo, useCallback, useRef, useState } from 'react';
import { type ImageLoadEventData, type NativeSyntheticEvent, StyleSheet } from 'react-native';
import { Box, Center } from 'native-base';
import { CacheManager } from '@georstat/react-native-image-cache';
import { useFocusEffect } from '@react-navigation/native';
import { aspectFit, AsyncStatus, LayoutMode } from '~/utils';
import { useDebouncedSafeAreaFrame, useDebouncedSafeAreaInsets } from '~/hooks';
import ErrorWithRetry from './ErrorWithRetry';
import NativeScrambleImage from './NativeScrambleImage';
import StaticCachedImage from './StaticCachedImage';
import {
  EMPTY_HEADERS,
  EMPTY_IMAGE_STATE,
  ImagePlaceholder,
  resizeModeDict,
  useFillStyle,
} from './ComicImageShared';

export interface ImageState {
  /** 普通图为原始 URL，扰乱图为 file:// 临时文件。 */
  dataUrl: string;
  landscapeHeight?: number;
  portraitHeight?: number;
  multipleFitWidth?: number;
  multipleFitHeight?: number;
  loadStatus: AsyncStatus;
}

export interface ImageProps {
  uri: string;
  index: number;
  headers?: Record<string, string>;
  layoutMode?: LayoutMode;
  prevState?: ImageState;
  defaultPortraitHeight: number;
  defaultLandscapeHeight: number;
  onChange?: (state: ImageState, idx?: number) => void;
  onRelease?: (idx: number) => void;
}

export interface ComicImageProps extends ImageProps {
  needUnscramble?: boolean;
}

/** 普通漫画图直接交给磁盘缓存组件，不把图片转换为 Base64。 */
const DefaultImage = ({
  uri,
  index,
  headers = EMPTY_HEADERS,
  layoutMode = LayoutMode.Horizontal,
  prevState = EMPTY_IMAGE_STATE,
  defaultPortraitHeight,
  defaultLandscapeHeight,
  onChange,
}: ImageProps) => {
  const { top, left, right, bottom } = useDebouncedSafeAreaInsets();
  const { width: windowWidth, height: windowHeight, orientation } = useDebouncedSafeAreaFrame();
  const [imageState, setImageState] = useState(prevState);
  const [reloadVersion, setReloadVersion] = useState(0);
  const uriRef = useRef(uri);
  const style = useFillStyle(
    layoutMode,
    imageState,
    orientation,
    defaultPortraitHeight,
    defaultLandscapeHeight
  );

  const updateData = useCallback(
    (data: ImageState) => {
      onChange?.(data, index);
      setImageState(data);
    },
    [index, onChange]
  );
  const handleError = useCallback(() => {
    updateData({ ...imageState, loadStatus: AsyncStatus.Rejected });
  }, [imageState, updateData]);
  const handleLoad = useCallback(
    (event: NativeSyntheticEvent<ImageLoadEventData>) => {
      const { width, height } = event.nativeEvent.source;
      if (!width || !height) {
        handleError();
        return;
      }
      const { dWidth, dHeight } = aspectFit(
        { width, height },
        {
          width: (windowWidth - left - right) / 2,
          height: windowHeight - top - bottom,
        }
      );
      updateData({
        dataUrl: uri,
        multipleFitWidth: dWidth,
        multipleFitHeight: dHeight,
        landscapeHeight: (height / width) * Math.max(windowWidth, windowHeight),
        portraitHeight: (height / width) * Math.min(windowWidth, windowHeight),
        loadStatus: AsyncStatus.Fulfilled,
      });
    }, [bottom, handleError, left, right, top, updateData, uri, windowHeight, windowWidth]
  );

  useFocusEffect(
    useCallback(() => {
      if (imageState.loadStatus === AsyncStatus.Default) {
        setImageState((state) => ({ ...state, loadStatus: AsyncStatus.Pending }));
      }
    }, [imageState.loadStatus])
  );
  useFocusEffect(
    useCallback(() => {
      if (uriRef.current !== uri) {
        uriRef.current = uri;
        setImageState(prevState);
      }
    }, [prevState, uri])
  );

  if (imageState.loadStatus === AsyncStatus.Rejected) {
    return (
      <Center style={style}>
        <ErrorWithRetry
          onRetry={async () => {
            await CacheManager.removeCacheEntry(uri).catch(() => {});
            setReloadVersion((version) => version + 1);
            setImageState({ ...EMPTY_IMAGE_STATE, loadStatus: AsyncStatus.Pending });
          }}
        />
      </Center>
    );
  }

  return (
    <Box style={style}>
      <StaticCachedImage
        source={uri}
        headers={headers}
        reloadKey={reloadVersion}
        style={styles.fill}
        resizeMode={resizeModeDict[layoutMode]}
        onLoad={handleLoad}
        onError={handleError}
      />
      {imageState.loadStatus !== AsyncStatus.Fulfilled && <ImagePlaceholder />}
    </Box>
  );
};

const ComicImage = ({ needUnscramble, ...props }: ComicImageProps) => {
  if (needUnscramble) {
    return <NativeScrambleImage {...props} />;
  }
  return <DefaultImage {...props} />;
};

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
});

export default memo(ComicImage);
