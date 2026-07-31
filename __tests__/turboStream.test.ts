/**
 * manhua.uk turbo-stream 解码器单元测试（含真实抓包样本）。
 *
 * 样本取自 2026-07-30 抓包（见 __tests__/fixtures/manhuauk/），固化解码契约，
 * 防止 React Router 升级改变内部格式时静默回归。移植自 hcomic_downloader 的
 * tests/test_manhuauk_turbo_stream.py。
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { decodeTurboStream, isUndefined, TurboStreamError } from '~/utils/turboStream';

const FIXTURES_DIR = join(__dirname, 'fixtures', 'manhuauk');

const loadFixture = (name: string): string =>
  readFileSync(join(FIXTURES_DIR, name), 'utf-8');

// ---------------------------------------------------------------------------
// 基础解码契约
// ---------------------------------------------------------------------------

describe('turbo-stream 基础解码', () => {
  it('空响应抛错', () => {
    expect(() => decodeTurboStream('')).toThrow(TurboStreamError);
    expect(() => decodeTurboStream('   ')).toThrow(TurboStreamError);
  });

  it('非数组抛错', () => {
    expect(() => decodeTurboStream('{"not": "array"}')).toThrow(TurboStreamError);
  });

  it('空数组抛错', () => {
    expect(() => decodeTurboStream('[]')).toThrow(TurboStreamError);
  });

  it('非法 JSON 抛错', () => {
    expect(() => decodeTurboStream('[not json')).toThrow(TurboStreamError);
  });

  it('负整数 -5 解码为 null', () => {
    // 根元素是 dict，值 -5 → null
    const text = JSON.stringify([{ _1: -5 }, 'key']);
    expect(decodeTurboStream(text)).toEqual({ key: null });
  });

  it('负整数 -7 解码为 undefined 占位（与 null 区分）', () => {
    const text = JSON.stringify([{ _1: -7 }, 'key']);
    const decoded = decodeTurboStream(text);
    expect(isUndefined(decoded.key)).toBe(true);
    expect(decoded.key).not.toBe(null);
  });

  it('布尔值不当索引引用', () => {
    const text = JSON.stringify([{ _1: true }, 'key']);
    expect(decodeTurboStream(text)).toEqual({ key: true });
  });

  it('日期元组 ["D", ms] 解码为毫秒数字', () => {
    // 根元素是列表 [["D", ms]] → 解码后第一个元素为日期毫秒
    const text = JSON.stringify([[['D', 1700000000000]]]);
    expect(decodeTurboStream(text)[0]).toBe(1700000000000);
  });

  it('字符串值原样返回，不当索引', () => {
    const text = JSON.stringify([{ _1: 'literal' }, 'key']);
    expect(decodeTurboStream(text)).toEqual({ key: 'literal' });
  });

  it('正整数值作为索引引用递归解码', () => {
    // _1 指向索引 2（字符串 "value"）
    const text = JSON.stringify([{ _1: 2 }, 'key', 'value']);
    expect(decodeTurboStream(text)).toEqual({ key: 'value' });
  });

  it('接受已解析的数组输入（兼容 application/json 上游）', () => {
    expect(decodeTurboStream([{ _1: 2 }, 'key', 'value'])).toEqual({ key: 'value' });
  });

  it('值里的列表元素也被解码为索引引用', () => {
    // _1 → 索引 2（列表 [3]），列表内 3 → 索引 3（字符串 "x"）
    const text = JSON.stringify([{ _1: 2 }, 'key', [3], 'x']);
    expect(decodeTurboStream(text)).toEqual({ key: ['x'] });
  });
});

// ---------------------------------------------------------------------------
// 真实样本契约
// ---------------------------------------------------------------------------

describe('turbo-stream 真实样本解码', () => {
  it('搜索样本：含 root 与 routes/* 分支', () => {
    const decoded = decodeTurboStream(loadFixture('search.data'));
    expect(typeof decoded).toBe('object');
    expect(decoded).not.toBeNull();
    expect('root' in decoded).toBe(true);
    expect(Object.keys(decoded).some((k) => k.startsWith('routes/'))).toBe(true);
  });

  it('搜索样本：data 分支含 comicses 列表与 total', () => {
    const decoded = decodeTurboStream(loadFixture('search.data'));
    const dataBranch = Object.values(decoded).find(
      (value) =>
        !!value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        !!(value as any).data &&
        typeof (value as any).data === 'object' &&
        'comicses' in (value as any).data
    ) as { data: { comicses: unknown[]; total: number } } | undefined;
    expect(dataBranch).toBeDefined();
    expect(Array.isArray(dataBranch!.data.comicses)).toBe(true);
    expect(dataBranch!.data.comicses.length).toBeGreaterThan(0);
    expect(typeof dataBranch!.data.total).toBe('number');
  });

  it('详情样本：data 分支含 comics 详情（带 images 数组）', () => {
    const decoded = decodeTurboStream(loadFixture('detail.data'));
    const found = Object.values(decoded).some(
      (value) =>
        !!value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        !!(value as any).data &&
        typeof (value as any).data === 'object' &&
        'comics' in (value as any).data
    );
    expect(found).toBe(true);
  });
});
