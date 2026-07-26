import React, { memo, useEffect, useMemo, useState } from 'react';
import {
  Image,
  ImageProps as NativeImageProps,
  Platform,
  StyleProp,
  View,
  ImageStyle,
} from 'react-native';
import { CacheManager } from '@georstat/react-native-image-cache';
import { useLatestRef } from '~/hooks/useLatestRef';

interface StaticCachedImageProps extends Omit<NativeImageProps, 'source' | 'onError'> {
  source: string;
  headers?: Record<string, string>;
  maxAge?: number;
  reloadKey?: string | number;
  style?: StyleProp<ImageStyle>;
  onError?: (error?: unknown) => void;
}

/**
 * 电子墨水版静态缓存图片。
 *
 * 上游 CachedImage 会为每张图创建多个 Reanimated shared value 和 worklet；即使淡入时长
 * 已设为 0，这些对象仍会占用 JS/UI 线程资源。这里保留同一磁盘缓存，只用原生 Image 显示。
 */
const StaticCachedImage = ({
  source,
  headers,
  maxAge,
  reloadKey,
  style,
  onError,
  ...imageProps
}: StaticCachedImageProps) => {
  // headers 引用变化时才重新计算 headersKey；避免每次渲染都跑 JSON.stringify
  const headersKey = useMemo(
    () =>
      JSON.stringify(
        Object.entries(headers || {}).sort(([left], [right]) => left.localeCompare(right))
      ),
    [headers]
  );
  const requestKey = `${source}\u0000${headersKey}\u0000${reloadKey ?? ''}`;
  const [resolved, setResolved] = useState<{ requestKey: string; uri: string }>();
  const headersRef = useLatestRef(headers);
  const onErrorRef = useLatestRef(onError);
  const localUri = resolved?.requestKey === requestKey ? resolved.uri : undefined;

  useEffect(() => {
    let active = true;

    if (!source) {
      return () => {
        active = false;
      };
    }

    const currentHeaders = headersRef.current;
    CacheManager.get(
      source,
      currentHeaders ? { headers: currentHeaders } : undefined,
      false,
      maxAge
    )
      .getPath()
      .then((path) => {
        if (!active) {
          return;
        }
        if (!path) {
          onErrorRef.current?.(new Error('图片缓存路径为空'));
          return;
        }

        const uri =
          Platform.OS === 'android' && !/^[a-z][a-z\d+.-]*:\/\//i.test(path)
            ? `file://${path}`
            : path;
        setResolved({ requestKey, uri });
      })
      .catch((error) => active && onErrorRef.current?.(error));

    return () => {
      active = false;
    };
    // requestKey 只在来源、请求头内容或显式重试变化时改变，避免父组件内联对象造成重复 I/O。
    // （ref 对象引用稳定，列入 deps 仅为满足 eslint，不会触发重跑）
  }, [source, requestKey, maxAge, headersRef, onErrorRef]);

  if (!localUri) {
    return <View style={style} />;
  }

  return (
    <Image
      {...imageProps}
      source={{ uri: localUri }}
      style={style}
      onError={(event) => onErrorRef.current?.(event.nativeEvent.error)}
    />
  );
};

export default memo(StaticCachedImage);
