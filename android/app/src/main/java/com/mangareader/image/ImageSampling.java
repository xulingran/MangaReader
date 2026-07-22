package com.mangareader.image;

final class ImageSampling {
  private ImageSampling() {}

  /** 返回最小的 2 次幂采样率，使完整解码像素数不超过上限。 */
  static int calculateSampleSize(int width, int height, double maxPixels) {
    int sampleSize = 1;
    while ((double) width * height / ((double) sampleSize * sampleSize) > maxPixels) {
      if (sampleSize >= 1024) {
        break;
      }
      sampleSize *= 2;
    }
    return sampleSize;
  }
}
