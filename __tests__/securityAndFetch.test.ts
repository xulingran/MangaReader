import { afterEach, describe, expect, it, jest } from '@jest/globals';
import MangaBZ, { parseMangaBzImages } from '~/plugins/mbz';
import ManHuaGui from '~/plugins/mhgm';
import { fetchData } from '~/utils/fetch';
import { unpackPacker } from '~/utils/unpack';
import { ErrorMessage } from '~/utils';

const pack = (payload: string) =>
  `eval(function(p,a,c,k,e,d){return p;}(${JSON.stringify(payload)},62,0,''.split('|'),0,{}))`;

afterEach(() => {
  jest.restoreAllMocks();
});

describe('第三方脚本安全解析', () => {
  it('只解包标准 Packer，不执行任意 JavaScript', () => {
    (globalThis as typeof globalThis & { __scriptCanary?: boolean }).__scriptCanary = false;

    expect(() => unpackPacker('eval(globalThis.__scriptCanary=true)')).toThrow('不支持的压缩脚本');
    expect((globalThis as typeof globalThis & { __scriptCanary?: boolean }).__scriptCanary).toBe(
      false
    );
  });

  it('在构造高倍率解压结果前拒绝异常 Packer', () => {
    const payload = '0 '.repeat(100_000);
    const dictionary = 'x'.repeat(100);
    const source = `eval(function(p,a,c,k,e,d){return p;}(${JSON.stringify(
      payload
    )},62,1,${JSON.stringify(dictionary)}.split('|'),0,{}))`;

    expect(() => unpackPacker(source)).toThrow('解压脚本超过大小限制');
  });

  it('漫画 BZ 仅接受本站 HTTPS 图片', () => {
    const valid = pack(
      'function dm5imagefun(){var pix="https://image.mangabz.com/a";var pvalue=["/1_x.jpg","/2_x.jpg"];for(var i=0;i<pvalue.length;i++){pvalue[i]=pix+pvalue[i]+"?token=ok";}return pvalue;}'
    );
    expect(parseMangaBzImages(valid)).toEqual([
      'https://image.mangabz.com/a/1_x.jpg?token=ok',
      'https://image.mangabz.com/a/2_x.jpg?token=ok',
    ]);

    const malicious = pack(
      'var pix="https://attacker.example";var pvalue=["/1_x.jpg"];return pvalue;'
    );
    expect(() => parseMangaBzImages(malicious)).toThrow('缺少章节信息');
  });

  it('漫画柜从解包文本中读取严格 JSON', () => {
    const readerData = {
      bookId: 6516,
      chapterId: 56365,
      bookName: '测试漫画',
      chapterTitle: '第一话',
      images: ['/comic/1.jpg'],
      sl: { e: 'token', m: 1 },
    };
    const html = `<script>window["\\x65\\x76\\x61\\x6c"](${pack(
      `SMH.reader(${JSON.stringify(readerData)}).preInit();`
    ).slice(4)})</script>`;
    const result = ManHuaGui.handleChapter(html, '6516', '56365', 1) as { chapter: Chapter };
    expect(result.chapter.images).toHaveLength(1);
    expect(result.chapter.images[0].uri).toContain('/comic/1.jpg?');
  });

  it('漫画 BZ 章节处理仍按页码过滤', () => {
    const result = MangaBZ.handleChapter(
      pack(
        'var pix="https://image.mangabz.com/a";var pvalue=["/1_x.jpg","/2_x.jpg"];for(var i=0;i<pvalue.length;i++){pvalue[i]=pix+pvalue[i]+"";}'
      ),
      '6516bz',
      'm56365',
      2
    ) as { chapter: Chapter; nextPage: number };
    expect(result.chapter.images).toEqual([{ uri: 'https://image.mangabz.com/a/2_x.jpg' }]);
    expect(result.nextPage).toBe(3);
  });
});

describe('fetchData', () => {
  it('HTTP 非成功状态不会被当作成功数据', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      headers: { get: () => 'text/plain' },
      text: async () => 'maintenance',
    } as unknown as Response);

    await expect(fetchData({ url: 'https://example.test' })).resolves.toEqual({
      error: expect.objectContaining({ message: '请求失败（HTTP 503）' }),
      data: undefined,
    });
  });

  it('认证型接口把 401/403 映射为来源提供的登录提示', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => 'application/json' },
    } as unknown as Response);

    await expect(
      fetchData({
        url: 'https://example.test/protected',
        authErrorMessage: ErrorMessage.AuthFailBIKA,
      })
    ).resolves.toEqual({
      error: expect.objectContaining({ message: ErrorMessage.AuthFailBIKA }),
      data: undefined,
    });
  });

  it('FormData 交给运行时生成 multipart boundary', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: true }),
    } as unknown as Response);
    const body = new FormData();
    body.append('key', '测试');

    await fetchData({
      url: 'https://example.test',
      method: 'POST',
      body,
      headers: new Headers({ 'Content-Type': 'multipart/form-data' }),
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Headers).has('Content-Type')).toBe(false);
    expect(init.body).toBe(body);
  });
});
