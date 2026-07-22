package com.mangareader.image;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapRegionDecoder;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.RectF;
import android.net.Uri;
import android.os.Build;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/** 使用分片区域解码还原扰乱图片，避免把整张源图和 Base64 同时放入 JS 堆。 */
public class ImageProcessorModule extends ReactContextBaseJavaModule {
  public static final String NAME = "ImageProcessorModule";
  // Reader 当前页、相邻页及双页布局可能同时挂载多个组件；队列只保存路径和参数，
  // 解码仍严格单线程。留出完整可见窗口，离屏 effect cleanup 会显式取消并移除任务。
  private static final int MAX_QUEUED_TASKS = 8;
  private final ThreadPoolExecutor executor =
      new ThreadPoolExecutor(
          1,
          1,
          0L,
          TimeUnit.MILLISECONDS,
          new ArrayBlockingQueue<>(MAX_QUEUED_TASKS),
          runnable -> {
            Thread thread = new Thread(runnable, "MangaReaderImageProcessor");
            thread.setPriority(Thread.NORM_PRIORITY - 1);
            return thread;
          });
  private final Map<String, ImageTask> tasks = new ConcurrentHashMap<>();

  public ImageProcessorModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  private static String normalizePath(String value) {
    return value.startsWith("file://") ? Uri.parse(value).getPath() : value;
  }

  @SuppressWarnings("deprecation")
  private static BitmapRegionDecoder createRegionDecoder(String sourcePath) throws IOException {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      return BitmapRegionDecoder.newInstance(sourcePath);
    }
    // API 24-30 只有带 isShareable 的重载；该参数自 API 21 起已被忽略。
    return BitmapRegionDecoder.newInstance(sourcePath, false);
  }

  private static void drawSlices(
      Bitmap source,
      Canvas canvas,
      int splitCount,
      int targetWidth,
      int targetHeight,
      ImageTask task)
      throws InterruptedException {
    int width = source.getWidth();
    int height = source.getHeight();
    int baseHeight = height / splitCount;
    int remainder = height % splitCount;
    Paint paint = new Paint(Paint.FILTER_BITMAP_FLAG);

    for (int index = 0; index < splitCount; index++) {
      task.throwIfCancelled();
      int sliceHeight = baseHeight;
      int destinationY = baseHeight * index;
      int sourceY = height - baseHeight * (index + 1) - remainder;
      if (index == 0) {
        sliceHeight += remainder;
      } else {
        destinationY += remainder;
      }
      Rect sourceRect = new Rect(0, sourceY, width, sourceY + sliceHeight);
      RectF destinationRect =
          new RectF(
              0,
              (float) destinationY * targetHeight / height,
              targetWidth,
              (float) (destinationY + sliceHeight) * targetHeight / height);
      canvas.drawBitmap(source, sourceRect, destinationRect, paint);
    }
  }

  @ReactMethod
  public void unscramble(
      String sourceValue,
      String outputValue,
      int splitCount,
      double maxPixels,
      String requestId,
      Promise promise) {
    if (requestId == null || requestId.isEmpty() || tasks.containsKey(requestId)) {
      promise.reject("IMAGE_PROCESSING_INVALID_REQUEST", "图片处理请求无效");
      return;
    }
    ImageTask task =
        new ImageTask(sourceValue, outputValue, splitCount, maxPixels, requestId, promise);
    tasks.put(requestId, task);
    synchronized (executor) {
      try {
        executor.execute(task);
      } catch (RuntimeException error) {
        tasks.remove(requestId, task);
        task.reject("IMAGE_PROCESSING_BUSY", "图片处理队列已满，请稍后重试", error);
      }
    }
  }

  @ReactMethod
  public void cancel(String requestId) {
    ImageTask task = tasks.get(requestId);
    if (task != null) {
      task.cancel("图片处理已取消");
      if (executor.remove(task)) {
        tasks.remove(requestId, task);
      }
    }
  }

  @Override
  public void invalidate() {
    tasks.values().forEach(task -> task.cancel("图片处理模块已关闭"));
    executor.shutdownNow();
    tasks.clear();
    super.invalidate();
  }

  private final class ImageTask implements Runnable {
    private final String sourceValue;
    private final String outputValue;
    private final int splitCount;
    private final double maxPixels;
    private final String requestId;
    private final Promise promise;
    private final AtomicBoolean cancelled = new AtomicBoolean(false);
    private final AtomicBoolean settled = new AtomicBoolean(false);

    ImageTask(
        String sourceValue,
        String outputValue,
        int splitCount,
        double maxPixels,
        String requestId,
        Promise promise) {
      this.sourceValue = sourceValue;
      this.outputValue = outputValue;
      this.splitCount = splitCount;
      this.maxPixels = maxPixels;
      this.requestId = requestId;
      this.promise = promise;
    }

    @Override
    public void run() {
      try {
        process(this);
      } finally {
        tasks.remove(requestId, this);
      }
    }

    void throwIfCancelled() throws InterruptedException {
      if (cancelled.get() || Thread.currentThread().isInterrupted()) {
        throw new InterruptedException("图片处理已取消");
      }
    }

    void cancel(String message) {
      cancelled.set(true);
      reject("IMAGE_PROCESSING_CANCELLED", message, null);
    }

    boolean resolve(WritableMap result) {
      if (settled.compareAndSet(false, true)) {
        promise.resolve(result);
        return true;
      }
      return false;
    }

    void reject(String code, String message, Throwable error) {
      if (!settled.compareAndSet(false, true)) {
        return;
      }
      if (error == null) {
        promise.reject(code, message);
      } else {
        promise.reject(code, message, error);
      }
    }
  }

  private static void process(ImageTask task) {
    Bitmap output = null;
    Bitmap fullSource = null;
    BitmapRegionDecoder decoder = null;
    String outputPath = null;
    boolean completed = false;
    try {
      task.throwIfCancelled();
      String sourceValue = task.sourceValue;
      String outputValue = task.outputValue;
      int splitCount = task.splitCount;
      double maxPixels = task.maxPixels;
      if (splitCount < 2 || splitCount > 64 || maxPixels <= 0) {
        throw new IllegalArgumentException("扰乱图片参数无效");
      }
      String sourcePath = normalizePath(sourceValue);
      outputPath = normalizePath(outputValue);
      BitmapFactory.Options bounds = new BitmapFactory.Options();
      bounds.inJustDecodeBounds = true;
      BitmapFactory.decodeFile(sourcePath, bounds);
      if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
        throw new IllegalArgumentException("无法读取图片尺寸");
      }

      double scale =
          Math.min(1.0, Math.sqrt(maxPixels / ((double) bounds.outWidth * bounds.outHeight)));
      int targetWidth = Math.max(1, (int) Math.floor(bounds.outWidth * scale));
      int targetHeight = Math.max(1, (int) Math.floor(bounds.outHeight * scale));
      output = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888);
      Canvas canvas = new Canvas(output);
      Paint paint = new Paint(Paint.FILTER_BITMAP_FLAG);

      try {
        decoder = createRegionDecoder(sourcePath);
      } catch (Exception ignored) {
        decoder = null;
      }

      if (decoder != null) {
        int baseHeight = bounds.outHeight / splitCount;
        int remainder = bounds.outHeight % splitCount;
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize =
            ImageSampling.calculateSampleSize(bounds.outWidth, bounds.outHeight, maxPixels);
        for (int index = 0; index < splitCount; index++) {
          task.throwIfCancelled();
          int sliceHeight = baseHeight;
          int destinationY = baseHeight * index;
          int sourceY = bounds.outHeight - baseHeight * (index + 1) - remainder;
          if (index == 0) {
            sliceHeight += remainder;
          } else {
            destinationY += remainder;
          }
          Bitmap region = decoder.decodeRegion(
              new Rect(0, sourceY, bounds.outWidth, sourceY + sliceHeight), options);
          if (region == null) {
            throw new IllegalStateException("图片分片解码失败");
          }
          try {
            RectF destination =
                new RectF(
                    0,
                    (float) destinationY * targetHeight / bounds.outHeight,
                    targetWidth,
                    (float) (destinationY + sliceHeight) * targetHeight / bounds.outHeight);
            canvas.drawBitmap(region, null, destination, paint);
          } finally {
            region.recycle();
          }
        }
      } else {
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize =
            ImageSampling.calculateSampleSize(bounds.outWidth, bounds.outHeight, maxPixels);
        fullSource = BitmapFactory.decodeFile(sourcePath, options);
        if (fullSource == null) {
          throw new IllegalStateException("图片解码失败");
        }
        drawSlices(fullSource, canvas, splitCount, targetWidth, targetHeight, task);
      }

      task.throwIfCancelled();
      File destination = new File(outputPath);
      File parent = destination.getParentFile();
      if (parent != null && !parent.exists() && !parent.mkdirs()) {
        throw new IllegalStateException("无法创建临时图片目录");
      }
      try (FileOutputStream stream = new FileOutputStream(destination)) {
        if (!output.compress(Bitmap.CompressFormat.PNG, 100, stream)) {
          throw new IllegalStateException("图片写入失败");
        }
      }

      WritableMap result = Arguments.createMap();
      result.putString("path", outputPath);
      result.putInt("width", targetWidth);
      result.putInt("height", targetHeight);
      task.throwIfCancelled();
      completed = task.resolve(result);
    } catch (InterruptedException error) {
      task.reject("IMAGE_PROCESSING_CANCELLED", "图片处理已取消", error);
    } catch (Throwable error) {
      task.reject("IMAGE_PROCESSING_FAILED", "扰乱图片处理失败", error);
    } finally {
      if (!completed) {
        if (outputPath != null) {
          // 写入中断时不保留无法使用的半成品。
          new File(outputPath).delete();
        }
      }
      if (decoder != null) {
        decoder.recycle();
      }
      if (fullSource != null) {
        fullSource.recycle();
      }
      if (output != null) {
        output.recycle();
      }
    }
  }
}
