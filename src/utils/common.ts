import { ErrorMessage, LayoutMode, MangaStatus } from './enum';
import { Draft, Draft07, JsonError, JsonSchema } from 'json-schema-library';
import { ImageState } from '~/components/ComicImage';
import { Buffer } from 'buffer';
import CryptoJS from 'crypto-js';

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
  depth = 0
): data is T {
  // 防御性深度上限：理论上 schema 完整不会无限递归，但加保护避免极端情况栈溢出
  if (depth > 10) {
    return false;
  }
  const jsonSchema = getDraft(schema);
  if (!jsonSchema) {
    return true;
  }
  const errors: JsonError[] = jsonSchema.validate(data);

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

    return validate(data, schema, initData, depth + 1);
  }

  if (errors.length > 0) {
    return false;
  }
  return true;
}

export function getLatestRelease(
  data: any[]
): { error: Error; release?: undefined } | { error?: undefined; release?: LatestRelease } {
  try {
    if (!data || !Array.isArray(data)) {
      return { error: new Error(ErrorMessage.WrongDataType) };
    }

    const latest = data.find((item) => {
      return compareVersion(item.tag_name, process.env.VERSION);
    });

    if (!latest) {
      return { release: undefined };
    }

    const [, y, m, d] = latest.published_at.match(PATTERN_PUBLISH_TIME) || [];
    const apk = (latest.assets as any[]).find(
      (item) => item.content_type === 'application/vnd.android.package-archive'
    );
    const ipa = (latest.assets as any[]).find(
      (item) => item.content_type === 'application/octet-stream'
    );

    return {
      release: {
        url: latest.html_url,
        version: latest.tag_name,
        changeLog: latest.body,
        publishTime: `${y}-${m}-${d}`,
        file: {
          apk: { size: apk.size, downloadUrl: apk.browser_download_url },
          ipa: { size: ipa.size, downloadUrl: ipa.browser_download_url },
        },
      },
    };
  } catch {
    return { error: new Error(ErrorMessage.Unknown) };
  }
}

export function compareVersion(prev: string, current: string) {
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

export function AESDecrypt(contentKey: string, key: string): string {
  const a = contentKey.substring(0x0, 0x10);
  const b = contentKey.substring(0x10, contentKey.length);

  const c = CryptoJS.enc.Utf8.parse(key);
  const d = CryptoJS.enc.Utf8.parse(a);

  const e = CryptoJS.enc.Hex.parse(b);
  const f = CryptoJS.enc.Base64.stringify(e);

  return CryptoJS.AES.decrypt(f, c, {
    iv: d,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  })
    .toString(CryptoJS.enc.Utf8)
    .toString();
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
    dict[key] = nonNullable(value) && value !== '' ? JSON.parse(value) : undefined;
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
  const nub = buffer[buffer.length - 1];
  return (nub % 10) + 5;
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

  const mid = Math.min(Math.max(Math.floor(list.length / 2), 0), list.length);
  return {
    portrait: list[mid]?.portraitHeight || defaultHeight.portrait,
    landscape: list[mid]?.landscapeHeight || defaultHeight.landscape,
  };
}
