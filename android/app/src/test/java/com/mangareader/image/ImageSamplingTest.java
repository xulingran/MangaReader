package com.mangareader.image;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class ImageSamplingTest {
  @Test
  public void roundsSamplingUpForThirtyOneMegapixelImage() {
    assertEquals(2, ImageSampling.calculateSampleSize(6200, 5000, 8_000_000));
  }

  @Test
  public void keepsImagesAlreadyWithinLimitAtFullResolution() {
    assertEquals(1, ImageSampling.calculateSampleSize(2000, 3000, 8_000_000));
  }

  @Test
  public void increasesPowerOfTwoUntilDecodedPixelsFit() {
    assertEquals(4, ImageSampling.calculateSampleSize(12_000, 8_000, 8_000_000));
  }
}
