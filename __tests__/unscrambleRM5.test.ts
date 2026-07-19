import { unscrambleRM5 } from '~/utils';

describe('unscrambleRM5', () => {
  test('兼容当前带 webp 扩展名且无 padding 的 base64 图片路径', () => {
    const uri =
      'https://r5.rmcdn10.xyz/m/token/wm:0/sr:1/' +
      'czM6Ly9yb3VtYW4vaW1hZ2VzL2NtcnFwOXIxMzAwMDBzNm5oYWs3amFpN3EvMThjLzE0NTM4NzgvMDAwMDEud2VicA.webp';

    const steps = unscrambleRM5(uri, 1200, 1800);

    expect(steps).toHaveLength(12);
    expect(steps.every((step) => step.sWidth === 1200 && step.dWidth === 1200)).toBe(true);
  });

  test('非 base64 文件名也不会让阅读页抛异常', () => {
    expect(() => unscrambleRM5('https://example.com/not-base64.webp', 800, 1200)).not.toThrow();
  });
});
