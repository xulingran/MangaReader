import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import {
  aspectFit,
  getDefaultFillMedianHeight,
  getLatestRelease,
  haveError,
  isNewerVersion,
  pairsToDict,
  statusToLabel,
  trycatch,
} from '~/utils/common';
import { ErrorMessage, MangaStatus } from '~/utils/enum';
import type { ImageState } from '~/components/ComicImage';

describe('isNewerVersion', () => {
  it('major 不同时按 major 决定（忽略更低的 minor/patch）', () => {
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true);
    expect(isNewerVersion('1.9.9', '2.0.0')).toBe(false);
  });

  it('major 相同时按 minor 决定', () => {
    expect(isNewerVersion('1.2.0', '1.1.9')).toBe(true);
    expect(isNewerVersion('1.1.0', '1.2.9')).toBe(false);
  });

  it('major/minor 相同时按 patch 决定', () => {
    expect(isNewerVersion('1.2.3', '1.2.2')).toBe(true);
    expect(isNewerVersion('1.2.2', '1.2.3')).toBe(false);
  });

  it('完全相等返回 false', () => {
    expect(isNewerVersion('1.2.3', '1.2.3')).toBe(false);
  });

  it('带 v 前缀也能识别', () => {
    expect(isNewerVersion('v2.0.0', 'v1.0.0')).toBe(true);
  });

  it('非法版本号回退为 0 段，不抛错', () => {
    // 'garbage' 无法匹配 → 视为 0.0.0，因此 '1.0.0' 比它新
    expect(isNewerVersion('1.0.0', 'garbage')).toBe(true);
    expect(isNewerVersion('garbage', 'garbage')).toBe(false);
  });
});

describe('getLatestRelease', () => {
  // getLatestRelease 用 process.env.VERSION 作为当前版本基线。
  // 该 env 由 bootstrap.js 在 app 入口注入，jest 不会加载 bootstrap，
  // 所以这里显式固定一个基线版本，保证测试与 process.env 无关。
  const CURRENT = '0.8.0';
  const originalVersion = process.env.VERSION;
  beforeAll(() => {
    process.env.VERSION = CURRENT;
  });
  afterAll(() => {
    process.env.VERSION = originalVersion;
  });

  // buildRelease 构造一个 GitHub Release 形状的条目
  const buildRelease = (overrides: Record<string, any> = {}) => ({
    tag_name: '0.9.0',
    published_at: '2026-08-01T00:00:00Z',
    html_url: 'https://example.test/release/0.9.0',
    body: '更新说明',
    assets: [
      {
        content_type: 'application/vnd.android.package-archive',
        size: 12345,
        browser_download_url: 'https://example.test/app-release.apk',
      },
    ],
    ...overrides,
  });

  it('有更高版本时返回 release 详情', () => {
    const result = getLatestRelease([buildRelease({ tag_name: '0.9.0' })]);
    expect(result.error).toBeUndefined();
    expect(result.release).toMatchObject({
      version: '0.9.0',
      changeLog: '更新说明',
      publishTime: '2026-08-01',
      url: 'https://example.test/release/0.9.0',
      file: { apk: { size: 12345, downloadUrl: 'https://example.test/app-release.apk' } },
    });
  });

  it('取第一个比当前版本新的 release（跳过等于或更低的）', () => {
    const result = getLatestRelease([
      buildRelease({ tag_name: '0.8.0' }), // 等于当前，不是新版
      buildRelease({ tag_name: '1.0.0', body: '真正的更新' }),
    ]);
    expect(result.release?.version).toBe('1.0.0');
    expect(result.release?.changeLog).toBe('真正的更新');
  });

  it('没有比当前更新的版本时返回 { release: undefined }', () => {
    const result = getLatestRelease([buildRelease({ tag_name: '0.8.0' })]);
    expect(result.error).toBeUndefined();
    expect(result.release).toBeUndefined();
  });

  it('release 没有 APK 资产时按无新版本处理（而非抛错）', () => {
    const result = getLatestRelease([
      buildRelease({
        tag_name: '0.9.0',
        assets: [{ content_type: 'application/zip', size: 1, browser_download_url: 'src.zip' }],
      }),
    ]);
    expect(result.release).toBeUndefined();
  });

  it('published_at 解析失败时回退为原始字符串', () => {
    const result = getLatestRelease([
      buildRelease({ tag_name: '0.9.0', published_at: 'not-a-date' }),
    ]);
    expect(result.release?.publishTime).toBe('not-a-date');
  });

  it('非数组输入返回 { error }', () => {
    const result = getLatestRelease({} as any);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toBe(ErrorMessage.WrongDataType);
    expect(result.release).toBeUndefined();
  });

  it('assets 缺失等异常被 catch 成 Unknown', () => {
    const result = getLatestRelease([
      { tag_name: '0.9.0', published_at: '2026-08-01' /* 无 assets */ },
    ]);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toBe(ErrorMessage.Unknown);
  });
});

describe('trycatch', () => {
  it('正常执行时返回 fn 的返回值', () => {
    const result = trycatch(() => 42);
    expect(result).toBe(42);
  });

  it('fn 抛 Error 时返回 { error }，消息原样保留', () => {
    const result = trycatch(() => {
      throw new Error('boom');
    });
    expect((result as any).error).toBeInstanceOf(Error);
    expect((result as any).error.message).toBe('boom');
  });

  it('传入 prefix 时拼到错误消息前', () => {
    const result = trycatch(() => {
      throw new Error('boom');
    }, '前缀：');
    expect((result as any).error.message).toBe('前缀：boom');
  });

  it('抛出非 Error 值时包装成 ErrorMessage.Unknown', () => {
    const result = trycatch(() => {
      throw '字符串异常';  
    });
    expect((result as any).error).toBeInstanceOf(Error);
    expect((result as any).error.message).toBe(ErrorMessage.Unknown);
  });
});

describe('pairsToDict', () => {
  it('正常解析每条 KV', () => {
    const result = pairsToDict([
      ['a', '"string"'],
      ['b', '123'],
      ['c', '{"k":1}'],
    ]);
    expect(result).toEqual({ a: 'string', b: 123, c: { k: 1 } });
  });

  it('null 值映射为 undefined', () => {
    const result = pairsToDict([['a', null]]);
    expect(result).toEqual({ a: undefined });
  });

  it('空字符串值映射为 undefined', () => {
    const result = pairsToDict([['a', '']]);
    expect(result).toEqual({ a: undefined });
  });

  it('单条 JSON 损坏只把该值降级为 undefined，不影响兄弟项', () => {
    const result = pairsToDict([
      ['good', '1'],
      ['broken', 'not-json'],
      ['alsogood', '"ok"'],
    ]);
    expect(result).toEqual({ good: 1, broken: undefined, alsogood: 'ok' });
  });

  it('空列表返回空对象', () => {
    expect(pairsToDict([])).toEqual({});
  });
});

describe('aspectFit', () => {
  it('竖图（高>宽）→ 受限于容器高度，按高缩放', () => {
    // 图 100x300，容器 100x100：高宽比图=3 容=1，受限高度 scale=1/3
    const r = aspectFit({ width: 100, height: 300 }, { width: 100, height: 100 });
    expect(r.scale).toBeCloseTo(1 / 3, 10);
    expect(r.dWidth).toBeCloseTo(100 / 3, 10);
    expect(r.dHeight).toBeCloseTo(100, 10);
    // 居中：dx = 100/2 - 100/2*scale = 50*(1-1/3)
    expect(r.dx).toBeCloseTo(50 * (1 - 1 / 3), 10);
    expect(r.dy).toBe(0);
  });

  it('横图（宽>高）→ 受限于容器宽度，按宽缩放', () => {
    // 图 300x100，容器 100x100：受限宽度 scale=1/3
    const r = aspectFit({ width: 300, height: 100 }, { width: 100, height: 100 });
    expect(r.scale).toBeCloseTo(1 / 3, 10);
    expect(r.dWidth).toBeCloseTo(100, 10);
    expect(r.dHeight).toBeCloseTo(100 / 3, 10);
    expect(r.dx).toBe(0);
    expect(r.dy).toBeCloseTo(50 * (1 - 1 / 3), 10);
  });

  it('图大于容器且等比 → 按比例缩小到正好填满较短边', () => {
    // 图 200x200，容器 100x100：scale=0.5，居中
    const r = aspectFit({ width: 200, height: 200 }, { width: 100, height: 100 });
    expect(r.scale).toBe(0.5);
    expect(r.dx).toBe(0);
    expect(r.dy).toBe(0);
    expect(r.dWidth).toBe(100);
    expect(r.dHeight).toBe(100);
  });
});

describe('getDefaultFillMedianHeight', () => {
  const defaults = { landscape: 200, portrait: 100 };

  const img = (portraitHeight: number, landscapeHeight = 50): ImageState =>
    ({ portraitHeight, landscapeHeight } as unknown as ImageState);

  it('空列表返回默认值', () => {
    expect(getDefaultFillMedianHeight([], defaults)).toEqual(defaults);
  });

  it('奇数长度取真正的中位元素', () => {
    const list = [img(10), img(20), img(30)]; // 中位索引 1
    expect(getDefaultFillMedianHeight(list, defaults)).toEqual({
      portrait: 20,
      landscape: 50,
    });
  });

  it('偶数长度取下中位（floor）', () => {
    const list = [img(10), img(20), img(30), img(40)]; // floor(4/2)=2 → 索引 2
    expect(getDefaultFillMedianHeight(list, defaults).portrait).toBe(30);
  });

  it('中位元素高度为 0 时回退默认值', () => {
    const list = [img(10), img(0, 0), img(30)]; // 中位 portraitHeight=0
    expect(getDefaultFillMedianHeight(list, defaults)).toEqual(defaults);
  });
});

describe('statusToLabel', () => {
  it('连载中', () => {
    expect(statusToLabel(MangaStatus.Serial)).toBe('连载中');
  });
  it('已完结', () => {
    expect(statusToLabel(MangaStatus.End)).toBe('已完结');
  });
  it('未知状态回退', () => {
    expect(statusToLabel(MangaStatus.Unknown)).toBe('未知');
  });
});

describe('haveError', () => {
  it('带 Error 实例的 payload 返回 true', () => {
    expect(haveError({ error: new Error('x') })).toBe(true);
  });
  it('普通对象返回 false', () => {
    expect(haveError({ data: 1 })).toBe(false);
  });
  it('null 返回假值（短路为 null，非 false）', () => {
    expect(haveError(null)).toBeFalsy();
  });
  it('error 是非 Error 类型（如字符串）返回 false', () => {
    expect(haveError({ error: '字符串' })).toBe(false);
  });
});
