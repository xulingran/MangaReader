import React, { useCallback, useState, useMemo, useRef, memo, useEffect } from 'react';
import { aspectFit, AsyncStatus, LayoutMode, Orientation, ScrambleType, unscramble } from '~/utils';
import {
  Image as ReactNativeImage,
  StyleSheet,
  Dimensions,
  DimensionValue,
  ImageResizeMode,
  ImageLoadEventData,
  NativeSyntheticEvent,
} from 'react-native';
import { useDebouncedSafeAreaFrame, useDebouncedSafeAreaInsets } from '~/hooks';
import { CacheManager } from '@georstat/react-native-image-cache';
import { useFocusEffect } from '@react-navigation/native';
import { Box, Center, Text, Icon } from 'native-base';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import ErrorWithRetry from '~/components/ErrorWithRetry';
import Canvas, { Image as CanvasImage } from 'react-native-canvas';
import { Dirs, FileSystem } from 'react-native-file-access';
import { nanoid } from '@reduxjs/toolkit';
import StaticCachedImage from '~/components/StaticCachedImage';

/** Canvas 解码像素上限：8MP */
const maxPixelSize = 8000000;
const windowScale = Dimensions.get('window').scale;
const unscrambleDir = `${Dirs.CacheDir}/unscramble`;
const resizeModeDict: Record<LayoutMode, ImageResizeMode> = {
  [LayoutMode.Horizontal]: 'contain',
  [LayoutMode.Vertical]: 'cover',
  [LayoutMode.Multiple]: 'contain',
};

const defaultState = {
  dataUrl: '',
  landscapeHeight: undefined,
  portraitHeight: undefined,
  loadStatus: AsyncStatus.Default,
};

export interface ImageState {
  /** 图片地址：普通图为原始 URL，解密/base64 图为 file:// 临时文件 */
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
  headers?: { [name: string]: string };
  layoutMode?: LayoutMode;
  prevState?: ImageState;
  /** 这两个高度只用于竖屏模式，动态修改高度避免抖动过度 */
  defaultPortraitHeight: number;
  defaultLandscapeHeight: number;
  onChange?: (state: ImageState, idx?: number) => void;
  onRelease?: (idx: number) => void;
}
export interface ComicImageProps extends ImageProps {
  needUnscramble?: boolean;
  scrambleType?: ScrambleType;
  isBase64Image?: boolean;
}

/** 电子墨水版静态加载占位（替代 GIF） */
const StaticPlaceholder = () => (
  <Center position="absolute" top={0} left={0} right={0} bottom={0}>
    <Icon as={MaterialIcons} name="image" size={10} color="gray.300" />
    <Text color="gray.400" fontSize="sm" pt={1}>
      加载中…
    </Text>
  </Center>
);

const useFillStyle = (
  layoutMode: LayoutMode,
  imageState: ImageState,
  orientation: Orientation,
  defaultPortraitHeight: number,
  defaultLandscapeHeight: number
) => {
  return useMemo<{ width: DimensionValue; height: DimensionValue }>(() => {
    if (layoutMode === LayoutMode.Horizontal) {
      return {
        width: '100%',
        height: '100%',
      };
    } else if (layoutMode === LayoutMode.Vertical) {
      return {
        width: '100%',
        height:
          orientation === Orientation.Landscape
            ? imageState.landscapeHeight || defaultLandscapeHeight
            : imageState.portraitHeight || defaultPortraitHeight,
      };
    }
    // LayoutMode.Multiple
    return {
      width: imageState.multipleFitWidth || '100%',
      height: imageState.multipleFitHeight || '100%',
    };
  }, [layoutMode, imageState, orientation, defaultPortraitHeight, defaultLandscapeHeight]);
};

/** 普通漫画图：使用无动画磁盘缓存组件，通过 onLoad 获取尺寸，不生成整张 base64 */
const DefaultImage = ({
  uri,
  index,
  headers = {},
  layoutMode = LayoutMode.Horizontal,
  prevState = defaultState,
  defaultPortraitHeight,
  defaultLandscapeHeight,
  onChange,
}: ImageProps) => {
  const { top, left, right, bottom } = useDebouncedSafeAreaInsets();
  const { width: windowWidth, height: windowHeight, orientation } = useDebouncedSafeAreaFrame();
  const [imageState, setImageState] = useState(prevState);
  const style = useFillStyle(
    layoutMode,
    imageState,
    orientation,
    defaultPortraitHeight,
    defaultLandscapeHeight
  );
  const uriRef = useRef(uri);
  const [reloadVersion, setReloadVersion] = useState(0);

  const updateData = useCallback(
    (data: ImageState) => {
      onChange && onChange(data, index);
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
        ...imageState,
        dataUrl: uri,
        multipleFitWidth: dWidth,
        multipleFitHeight: dHeight,
        landscapeHeight: (height / width) * Math.max(windowWidth, windowHeight),
        portraitHeight: (height / width) * Math.min(windowWidth, windowHeight),
        loadStatus: AsyncStatus.Fulfilled,
      });
    },
    [imageState, updateData, handleError, uri, windowWidth, windowHeight, top, left, right, bottom]
  );

  useFocusEffect(
    useCallback(() => {
      if (imageState.loadStatus === AsyncStatus.Default) {
        setImageState({ ...imageState, loadStatus: AsyncStatus.Pending });
      }
    }, [imageState])
  );
  useFocusEffect(
    useCallback(() => {
      if (uriRef.current !== uri) {
        uriRef.current = uri;
        setImageState(prevState);
      }
    }, [uri, prevState])
  );

  const handleRetry = () => {
    CacheManager.removeCacheEntry(uri)
      .then(() => {})
      .catch(() => {})
      .finally(() => {
        setReloadVersion((version) => version + 1);
        updateData({ ...imageState, loadStatus: AsyncStatus.Default });
      });
  };

  if (imageState.loadStatus === AsyncStatus.Rejected) {
    return (
      <Center style={style}>
        <ErrorWithRetry onRetry={handleRetry} />
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
      {imageState.loadStatus !== AsyncStatus.Fulfilled && <StaticPlaceholder />}
    </Box>
  );
};

/** 加密图：canvas 解密结果写入临时文件，React 状态只保存 file:// URI 与尺寸 */
const ScrambleImage = ({
  uri,
  index,
  headers = {},
  layoutMode = LayoutMode.Horizontal,
  prevState = defaultState,
  defaultPortraitHeight,
  defaultLandscapeHeight,
  onChange,
  onRelease,
  scrambleType,
}: ImageProps & { scrambleType?: ScrambleType }) => {
  const { top, left, right, bottom } = useDebouncedSafeAreaInsets();
  const { width: windowWidth, height: windowHeight, orientation } = useDebouncedSafeAreaFrame();
  const [imageState, setImageState] = useState(prevState);
  const style = useFillStyle(
    layoutMode,
    imageState,
    orientation,
    defaultPortraitHeight,
    defaultLandscapeHeight
  );
  const canvasRef = useRef<Canvas | null>(null);
  const uriRef = useRef(uri);
  const tempFileRef = useRef<string | null>(null);

  const releaseTempFile = useCallback(() => {
    if (tempFileRef.current) {
      FileSystem.unlink(tempFileRef.current).catch(() => {});
      tempFileRef.current = null;
      onRelease?.(index);
    }
  }, [index, onRelease]);

  const updateData = useCallback(
    (data: ImageState) => {
      onChange && onChange(data, index);
      setImageState(data);
    },
    [index, onChange]
  );
  const handleError = useCallback(() => {
    updateData({ ...imageState, loadStatus: AsyncStatus.Rejected });
  }, [imageState, updateData]);
  const base64ToUrl = useCallback(
    (base64: string, i: string) => {
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        const image = new CanvasImage(canvasRef.current);

        image.addEventListener('error', handleError);
        image.addEventListener('load', (event) => {
          // don't use Image.getSize from react-native
          // Image.getSize return wrong width and height when image have a huge width or height
          // https://github.com/facebook/react-native/issues/31130
          // https://github.com/facebook/react-native/issues/33498
          const width = event.target.width;
          const height = event.target.height;
          const step = unscramble(i, width, height, scrambleType);

          if (!canvasRef.current) {
            handleError();
            return;
          }

          // if image size more than maxPixelSize(8MP), scale image to smaller
          const imageScale = Math.floor(Math.min(maxPixelSize / (width * height), 1) * 100) / 100;
          const scale = imageScale / windowScale;

          canvasRef.current.width = width * scale;
          canvasRef.current.height = height * scale;
          ctx.scale(scale, scale);

          step.forEach(({ dx, dy, sx, sy, sWidth, sHeight, dWidth, dHeight }) => {
            ctx.drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
          });

          canvasRef.current
            .toDataURL()
            .then(async (res) => {
              const dataUrl = res.replace(/^"|"$/g, '');
              const base64Body = dataUrl.split(',')[1];
              if (!base64Body) {
                handleError();
                return;
              }
              // 解密结果写入临时文件，状态只保存 file:// URI，释放内存中的大 base64 对象
              await FileSystem.mkdir(unscrambleDir).catch(() => {});
              const path = `${unscrambleDir}/${nanoid()}.png`;
              await FileSystem.writeFile(path, base64Body, 'base64');
              releaseTempFile();
              tempFileRef.current = path;

              const { dWidth, dHeight } = aspectFit(
                { width, height },
                {
                  width: (windowWidth - left - right) / 2,
                  height: windowHeight - top - bottom,
                }
              );
              updateData({
                ...imageState,
                dataUrl: 'file://' + path,
                multipleFitWidth: dWidth,
                multipleFitHeight: dHeight,
                landscapeHeight: (height / width) * Math.max(windowWidth, windowHeight),
                portraitHeight: (height / width) * Math.min(windowWidth, windowHeight),
                loadStatus: AsyncStatus.Fulfilled,
              });
            })
            .catch(handleError);
        });
        image.src = base64;
      } else {
        handleError();
      }
    },
    [
      imageState,
      updateData,
      handleError,
      windowWidth,
      windowHeight,
      scrambleType,
      top,
      left,
      right,
      bottom,
      releaseTempFile,
    ]
  );
  const loadImage = useCallback(() => {
    setImageState((state) => ({ ...state, loadStatus: AsyncStatus.Pending }));
    CacheManager.prefetchBlob(uri, { headers })
      .then((base64) =>
        base64 ? base64ToUrl('data:image/png;base64,' + base64, uri) : handleError()
      )
      .catch(handleError);
  }, [uri, headers, base64ToUrl, handleError]);
  useFocusEffect(
    useCallback(() => {
      if (imageState.loadStatus === AsyncStatus.Default) {
        loadImage();
      }
    }, [imageState, loadImage])
  );
  useFocusEffect(
    useCallback(() => {
      if (uriRef.current !== uri) {
        uriRef.current = uri;
        releaseTempFile();
        setImageState(prevState);
      }
    }, [uri, prevState, releaseTempFile])
  );
  // 离屏（屏幕失焦）后释放临时文件与大对象
  useFocusEffect(
    useCallback(() => {
      return () => {
        releaseTempFile();
        setImageState(defaultState);
      };
    }, [releaseTempFile])
  );
  // 组件卸载时释放临时文件
  useEffect(() => {
    return () => {
      releaseTempFile();
    };
  }, [releaseTempFile]);

  const handleRetry = () => {
    CacheManager.removeCacheEntry(uri)
      .then(() => {})
      .catch(() => {})
      .finally(() => updateData({ ...prevState, loadStatus: AsyncStatus.Default }));
  };

  if (imageState.loadStatus === AsyncStatus.Rejected) {
    return (
      <Center style={style}>
        <ErrorWithRetry onRetry={handleRetry} />
      </Center>
    );
  }
  if (
    imageState.loadStatus === AsyncStatus.Pending ||
    imageState.loadStatus === AsyncStatus.Default
  ) {
    return (
      <Center style={style}>
        <StaticPlaceholder />
        <Canvas
          ref={(canvas: Canvas | null) => {
            canvasRef.current = canvas;
          }}
          style={styles.canvas}
        />
      </Center>
    );
  }

  return (
    <ReactNativeImage
      style={style}
      resizeMode={resizeModeDict[layoutMode]}
      source={{ uri: imageState.dataUrl }}
    />
  );
};

// happy漫画返回的图片格式不太一样，需要单独处理：
// 下载后写入本地缓存文件，React 状态只保存 file:// URI 与尺寸
const Base64Image = ({
  uri,
  index,
  headers = {},
  layoutMode = LayoutMode.Horizontal,
  prevState = defaultState,
  defaultPortraitHeight,
  defaultLandscapeHeight,
  onChange,
}: ImageProps) => {
  const { top, left, right, bottom } = useDebouncedSafeAreaInsets();
  const { width: windowWidth, height: windowHeight, orientation } = useDebouncedSafeAreaFrame();
  const [imageState, setImageState] = useState(prevState);
  const style = useFillStyle(
    layoutMode,
    imageState,
    orientation,
    defaultPortraitHeight,
    defaultLandscapeHeight
  );
  const uriRef = useRef(uri);

  const updateData = useCallback(
    (data: ImageState) => {
      onChange && onChange(data, index);
      setImageState(data);
    },
    [index, onChange]
  );
  const handleError = useCallback(() => {
    updateData({ ...imageState, loadStatus: AsyncStatus.Rejected });
  }, [imageState, updateData]);
  const loadImage = useCallback(async () => {
    setImageState({ ...imageState, loadStatus: AsyncStatus.Pending });
    const path = CacheManager.defaultConfig.baseDir + '/' + uri.split('/').at(-1);
    try {
      const isExist = await FileSystem.exists(path);
      if (!isExist) {
        const res = await fetch(uri, { headers });
        const blob = await res.blob();
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        const base64Body = await new Promise<string>((resolve, reject) => {
          reader.onloadend = () => {
            resolve((reader.result as string).split(',')[1] || '');
          };
          reader.onerror = reject;
        });
        if (!base64Body) {
          handleError();
          return;
        }
        // 以真实图片字节写入缓存文件（而非 base64 文本）
        await FileSystem.writeFile(path, base64Body, 'base64');
      }

      const fileUri = 'file://' + path;
      if (layoutMode === LayoutMode.Horizontal) {
        updateData({
          ...imageState,
          dataUrl: fileUri,
          loadStatus: AsyncStatus.Fulfilled,
        });
        return;
      }
      ReactNativeImage.getSize(
        fileUri,
        (width, height) => {
          const { dWidth, dHeight } = aspectFit(
            { width, height },
            {
              width: (windowWidth - left - right) / 2,
              height: windowHeight - top - bottom,
            }
          );
          updateData({
            ...imageState,
            dataUrl: fileUri,
            multipleFitWidth: dWidth,
            multipleFitHeight: dHeight,
            landscapeHeight: (height / width) * Math.max(windowWidth, windowHeight),
            portraitHeight: (height / width) * Math.min(windowWidth, windowHeight),
            loadStatus: AsyncStatus.Fulfilled,
          });
        },
        handleError
      );
    } catch (error) {
      handleError();
      return;
    }
  }, [
    uri,
    headers,
    imageState,
    layoutMode,
    updateData,
    handleError,
    windowWidth,
    windowHeight,
    top,
    left,
    right,
    bottom,
  ]);
  useFocusEffect(
    useCallback(() => {
      if (imageState.loadStatus === AsyncStatus.Default) {
        loadImage();
      }
    }, [imageState, loadImage])
  );
  useFocusEffect(
    useCallback(() => {
      if (uriRef.current !== uri) {
        uriRef.current = uri;
        setImageState(prevState);
      }
    }, [uri, prevState])
  );

  const handleRetry = () => {
    const path = CacheManager.defaultConfig.baseDir + '/' + uri.split('/').at(-1);
    FileSystem.unlink(path)
      .catch(() => {})
      .finally(() => updateData({ ...imageState, loadStatus: AsyncStatus.Default }));
  };

  if (
    imageState.loadStatus === AsyncStatus.Pending ||
    imageState.loadStatus === AsyncStatus.Default
  ) {
    return (
      <Center style={style}>
        <StaticPlaceholder />
      </Center>
    );
  }
  if (imageState.loadStatus === AsyncStatus.Rejected) {
    return (
      <Center style={style}>
        <ErrorWithRetry onRetry={handleRetry} />
      </Center>
    );
  }

  return (
    <ReactNativeImage
      source={{ uri: imageState.dataUrl }}
      style={style}
      resizeMode={resizeModeDict[layoutMode]}
      onError={handleError}
    />
  );
};

const styles = StyleSheet.create({
  fill: {
    width: '100%',
    height: '100%',
  },
  canvas: {
    zIndex: -1,
    opacity: 0,
    position: 'absolute',
  },
});

const ComicImage = ({ scrambleType, needUnscramble, isBase64Image, ...props }: ComicImageProps) => {
  if (needUnscramble) {
    return <ScrambleImage scrambleType={scrambleType} {...props} />;
  }

  if (isBase64Image) {
    return <Base64Image {...props} />;
  }

  return <DefaultImage {...props} />;
};

export default memo(ComicImage);
