import { NativeModules, Platform } from 'react-native';
import { Dirs, FileSystem } from 'react-native-file-access';

export const IMAGE_PROCESSOR_OUTPUT_DIR = `${Dirs.CacheDir}/unscramble`;

interface ImageProcessorResult {
  path: string;
  width: number;
  height: number;
}

interface ImageProcessorNativeModule {
  unscramble(
    sourcePath: string,
    outputPath: string,
    splitCount: number,
    maxPixels: number,
    requestId: string
  ): Promise<ImageProcessorResult>;
  cancel(requestId: string): void;
}

const requireModule = (): ImageProcessorNativeModule => {
  const nativeModule = NativeModules.ImageProcessorModule as ImageProcessorNativeModule | undefined;
  if (Platform.OS !== 'android' || !nativeModule) {
    throw new Error('当前平台不支持扰乱图片处理');
  }
  return nativeModule;
};

const getModule = (): ImageProcessorNativeModule | undefined => {
  try {
    return requireModule();
  } catch {
    return undefined;
  }
};

export const ImageProcessor = {
  unscramble(
    sourcePath: string,
    outputPath: string,
    splitCount: number,
    maxPixels: number,
    requestId: string
  ) {
    try {
      return requireModule().unscramble(sourcePath, outputPath, splitCount, maxPixels, requestId);
    } catch (error) {
      return Promise.reject(error);
    }
  },
  cancel(requestId: string) {
    getModule()?.cancel(requestId);
  },
};

export const unlinkTemporaryImage = async (path: string, attempts = 3): Promise<void> => {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await FileSystem.unlink(path);
      return;
    } catch (error) {
      if (attempt + 1 < attempts) {
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      } else {
        console.warn('An error in unlinkTemporaryImage:', error);
      }
    }
  }
};

/** 清理上次进程异常退出后遗留的解扰图片，避免缓存目录无上限增长。 */
export const cleanupTemporaryImages = async (): Promise<void> => {
  await FileSystem.mkdir(IMAGE_PROCESSOR_OUTPUT_DIR).catch(() => {});
  const names = await FileSystem.ls(IMAGE_PROCESSOR_OUTPUT_DIR).catch(() => [] as string[]);
  await Promise.all(
    names.map((name) => unlinkTemporaryImage(`${IMAGE_PROCESSOR_OUTPUT_DIR}/${name}`))
  );
};
