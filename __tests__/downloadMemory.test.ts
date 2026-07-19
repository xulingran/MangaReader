import { beforeEach, expect, it, jest } from '@jest/globals';
import { CacheManager } from '@georstat/react-native-image-cache';
import { fileDownload } from '~/redux/saga';

const getCacheEntry = CacheManager.get as jest.Mock;
const prefetchBlob = CacheManager.prefetchBlob as jest.Mock;

beforeEach(() => {
  getCacheEntry.mockClear();
  prefetchBlob.mockClear();
});

it('下载只返回磁盘缓存路径，不把完整图片读成 base64', () => {
  const generator = fileDownload({
    source: 'https://example.com/page.jpg',
    headers: { Referer: 'https://example.com' },
  });

  generator.next();
  const result = generator.next('/cache/images_cache/page.jpg');

  expect(getCacheEntry).toHaveBeenCalledWith('https://example.com/page.jpg', {
    headers: { Referer: 'https://example.com' },
  });
  expect(prefetchBlob).not.toHaveBeenCalled();
  expect(result).toEqual({ value: '/cache/images_cache/page.jpg', done: true });
});
