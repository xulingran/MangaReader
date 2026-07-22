import { getRM5SplitCount } from '~/utils';

describe('getRM5SplitCount', () => {
  test('兼容当前带 webp 扩展名且无 padding 的 base64 图片路径', () => {
    const uri =
      'https://r5.rmcdn10.xyz/m/token/wm:0/sr:1/' +
      'czM6Ly9yb3VtYW4vaW1hZ2VzL2NtcnFwOXIxMzAwMDBzNm5oYWs3amFpN3EvMThjLzE0NTM4NzgvMDAwMDEud2VicA.webp';

    expect(getRM5SplitCount(uri)).toBe(12);
  });

  test('非 base64 文件名也不会让阅读页抛异常', () => {
    expect(() => getRM5SplitCount('https://example.com/not-base64.webp')).not.toThrow();
  });
});
