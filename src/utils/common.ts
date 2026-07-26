import { ErrorMessage, LayoutMode, MangaStatus, ThemeMode } from './enum';
import { Draft, Draft07, JsonError, JsonSchema } from 'json-schema-library';
import { ImageState } from '~/components/ComicImage';
import { Buffer } from 'buffer';
import CryptoJS from 'crypto-js';
import type { KeyValuePair } from './storage';

export const PATTERN_VERSION = /v?([0-9]+)\.([0-9]+)\.([0-9]+)/;
export const PATTERN_PUBLISH_TIME = /([0-9]+)-([0-9]+)-([0-9]+)/;
export const coverAspectRatio = 2 / 3;
export const storageKey = {
  snapshotManifest: '@snapshotManifest',
  favorites: '@favorites',
  dict: '@dict',
  plugin: '@plugin',
  setting: '@setting',
  mangaIndex: '@mangaIndex',
  chapterIndex: '@chapterIndex',
  taskIndex: '@taskIndex',
  jobIndex: '@jobIndex',
};

export function aspectFit(
  img: { width: number; height: number },
  container: { width: number; height: number }
) {
  const scale = Math.min(container.width / img.width, container.height / img.height);
  const dx = container.width / 2 - (img.width / 2) * scale;
  const dy = container.height / 2 - (img.height / 2) * scale;

  return {
    dx,
    dy,
    dWidth: img.width * scale,
    dHeight: img.height * scale,
    scale,
  };
}

export function haveError(payload: any): payload is { error: Error } {
  return payload && payload.error instanceof Error;
}

/**
 * 迁移旧版本设置（电子墨水版）：
 * - 剔除已删除的 light / animated 字段
 * - 所有缺少 themeMode 的设置默认跟随 Android 系统
 * - 旧的 hearing 字段映射为 pageKeys
 * - 检测到旧字段（首次升级）时强制使用横向单页模式
 * 收藏、插件、阅读记录、下载路径、定时翻页等其余设置保持不变
 */
export function migrateSetting(raw: any): RootState['setting'] {
  if (!raw || typeof raw !== 'object') {
    return raw;
  }
  const setting = { ...raw };
  const isLegacy = 'light' in setting || 'animated' in setting || 'hearing' in setting;

  delete setting.light;
  delete setting.animated;
  if (!('themeMode' in setting)) {
    setting.themeMode = ThemeMode.System;
  }
  if ('hearing' in setting) {
    if (!('pageKeys' in setting)) {
      setting.pageKeys = setting.hearing;
    }
    delete setting.hearing;
  }
  if (isLegacy) {
    setting.mode = LayoutMode.Horizontal;
  }
  return setting;
}

// Draft07 实例缓存：schema 在模块加载时确定，引用稳定；避免每次 validate 都重新编译
// 708 行的 rootSchema。WeakMap 以 schema 对象为 key，schema 释放时缓存自动清理。
const draftCache = new WeakMap<JsonSchema, Draft>();
function getDraft(schema?: JsonSchema): Draft | undefined {
  if (!schema) {
    return undefined;
  }
  let draft = draftCache.get(schema);
  if (!draft) {
    draft = new Draft07(schema);
    draftCache.set(schema, draft);
  }
  return draft;
}

export function validate<T = any>(
  data: T,
  schema?: JsonSchema,
  initData?: Record<string, any>,
  depth = 0,
  sampleKeys?: number
): data is T {
  // 防御性深度上限：理论上 schema 完整不会无限递归，但加保护避免极端情况栈溢出
  if (depth > 10) {
    return false;
  }
  const jsonSchema = getDraft(schema);
  if (!jsonSchema) {
    return true;
  }

  // 采样校验：对大字典（如离线 dict / favorites 上千条）只抽样前 N 个 key 校验，
  // 避免低端 CPU 在启动期被数千条逐条校验阻塞。写入路径已在 persistence 中做结构断言，
  // 这里仅做防御性抽样；运行期访问异常数据由 reducer 兜底（显示为空，不崩）。
  // 嵌套递归校验（initData 填值后重试）不再采样，保证修复完整性。
  let validatingData: any = data;
  if (depth === 0 && typeof sampleKeys === 'number' && sampleKeys > 0 && data && typeof data === 'object') {
    if (!Array.isArray(data)) {
      const source = data as Record<string, any>;
      const keys = Object.keys(source);
      if (keys.length > sampleKeys) {
        const picked: Record<string, any> = {};
        for (let i = 0; i < sampleKeys; i++) {
          const k = keys[i];
          picked[k] = source[k];
        }
        validatingData = picked;
      }
    } else if (data.length > sampleKeys) {
      validatingData = (data as any[]).slice(0, sampleKeys);
    }
  }

  const errors: JsonError[] = jsonSchema.validate(validatingData);

  if (nonNullable(initData) && errors.length > 0) {
    errors.forEach((error) => {
      if (error.code !== 'required-property-error') {
        return;
      }

      let initDataRef = initData;
      const { value, key, pointer } = error.data as Record<string, any>;
      const keys: string[] = pointer.split('/').slice(1);

      keys.forEach(
        (jsonKey) => (initDataRef = nonNullable(initDataRef) ? initDataRef[jsonKey] : undefined)
      );
      value[key] = nonNullable(initDataRef) ? initDataRef[key] : undefined;
    });

    // 修复阶段用原始 data 全量重试（不再采样），确保 required 字段被补齐后再完整校验一次。
    return validate(data, schema, initData, depth + 1);
  }

  if (errors.length > 0) {
    return false;
  }
  return true;
}

/**
 * 采样校验的语义化包装：对大字典 / 大数组只抽样前 sampleKeys 条做结构校验。
 * 内部委托给 validate，避免调用方写 `validate(data, schema, undefined, 0, 8)` 这种
 * 夹带 undefined/0 占位的位置参数，提升可读性。
 *
 * 用于启动期 syncDataSaga 等「数据量大、写入路径已做结构断言、只需防御性抽样」的场景；
 * 校验失败仍会 throw（由调用方 try/catch 兜底）。
 */
export function validateSampled<T = any>(
  data: T,
  sampleKeys: number,
  schema?: JsonSchema
): data is T {
  return validate(data, schema, undefined, 0, sampleKeys);
}

export function getLatestRelease(
  data: any[]
): { error: Error; release?: undefined } | { error?: undefined; release?: LatestRelease } {
  try {
    if (!data || !Array.isArray(data)) {
      return { error: new Error(ErrorMessage.WrongDataType) };
    }

    const latest = data.find((item) => {
      return isNewerVersion(item.tag_name, process.env.VERSION);
    });

    if (!latest) {
      return { release: undefined };
    }

    const publishTimeMatch = latest.published_at.match(PATTERN_PUBLISH_TIME);
    const apk = (latest.assets as any[]).find(
      (item) => item.content_type === 'application/vnd.android.package-archive'
    );

    // Release 可能没有 APK 资产（例如只发了源码包），没有可下载文件时按无新版本处理，
    // 避免直接访问 apk.size 抛异常后被 catch 吞成误导性的「未知错误~」
    if (!apk) {
      return { release: undefined };
    }

    return {
      release: {
        url: latest.html_url,
        version: latest.tag_name,
        changeLog: latest.body,
        // published_at 解析失败时回退原始字符串，避免产出 undefined-undefined-undefined
        publishTime: publishTimeMatch
          ? `${publishTimeMatch[1]}-${publishTimeMatch[2]}-${publishTimeMatch[3]}`
          : latest.published_at,
        file: {
          apk: { size: apk.size, downloadUrl: apk.browser_download_url },
        },
      },
    };
  } catch {
    return { error: new Error(ErrorMessage.Unknown) };
  }
}

export function isNewerVersion(prev: string, current: string) {
  const [, A1 = 0, B1 = 0, C1 = 0] = prev.match(PATTERN_VERSION) || [];
  const [, A2 = 0, B2 = 0, C2 = 0] = current.match(PATTERN_VERSION) || [];

  if (Number(A1) > Number(A2)) {
    return true;
  } else if (Number(A1) === Number(A2) && Number(B1) > Number(B2)) {
    return true;
  } else if (Number(A1) === Number(A2) && Number(B1) === Number(B2) && Number(C1) > Number(C2)) {
    return true;
  }

  return false;
}

export function nonNullable<T>(v: T | null | undefined): v is T {
  return v !== null && v !== undefined;
}

export function trycatch<T extends (...args: any) => any>(fn: T, prefix?: string): ReturnType<T> {
  try {
    return fn();
  } catch (error) {
    if (error instanceof Error) {
      return {
        error: new Error(prefix ? `${prefix}${error.message}` : error.message),
      } as ReturnType<T>;
    } else {
      return { error: new Error(ErrorMessage.Unknown) } as ReturnType<T>;
    }
  }
}

export function pairsToDict(list: KeyValuePair[]) {
  return list.reduce<Record<string, any>>((dict, [key, value]) => {
    if (nonNullable(value) && value !== '') {
      // 单条损坏的 MMKV 记录不应中断整个启动同步：解析失败时丢弃该值
      try {
        dict[key] = JSON.parse(value);
      } catch {
        dict[key] = undefined;
      }
    } else {
      dict[key] = undefined;
    }
    return dict;
  }, {});
}

export function getRM5SplitCount(uri: string) {
  const path = uri.split(/[?#]/, 1)[0];
  const filename = path.split('/').at(-1) || '';
  // RM5 目前会在 base64 路径后追加真实图片扩展名（例如 `<base64>.webp`）。
  // 旧实现只移除 `.jpg`，把整个文件名交给严格的 base-64 解码器，遇到 `.webp`
  // 会抛 InvalidCharacterError 并导致阅读页崩溃。Buffer 的 base64 解码同时兼容无 padding
  // 的新地址；无法解码时则使用原文件名生成稳定分片数，至少不让异常逃出渲染流程。
  const encodedId = filename.replace(/\.(?:avif|gif|jpe?g|png|webp)$/i, '');
  const decodedId = Buffer.from(encodedId, 'base64').toString('utf8') || encodedId;

  const buffer = Buffer.from(CryptoJS.MD5(decodedId).toString(), 'hex');
  const num = buffer[buffer.length - 1];
  return (num % 10) + 5;
}


export function emptyFn() {}

export function statusToLabel(status: MangaStatus) {
  switch (status) {
    case MangaStatus.Serial: {
      return '连载中';
    }
    case MangaStatus.End: {
      return '已完结';
    }
    default:
      return '未知';
  }
}

export function getDefaultFillMedianHeight(
  list: ImageState[],
  defaultHeight: { landscape: number; portrait: number }
) {
  if (list.length <= 0) {
    return {
      portrait: defaultHeight.portrait,
      landscape: defaultHeight.landscape,
    };
  }

  const mid = Math.min(Math.max(Math.floor(list.length / 2), 0), list.length - 1);
  return {
    portrait: list[mid]?.portraitHeight || defaultHeight.portrait,
    landscape: list[mid]?.landscapeHeight || defaultHeight.landscape,
  };
}
