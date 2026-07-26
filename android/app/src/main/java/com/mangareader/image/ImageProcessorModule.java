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
  // 电子墨水屏为灰阶：RGB_565（每像素 2 字节）相比 ARGB_8888（4 字节）峰值内存减半；
  // JPEG q85 编码速度比 PNG 快数倍、体积小 5-10 倍，配合 RGB_565 进一步降低 IO 与 Fresco
  // 二次解码开销。彩屏仅有轻微精度损失，墨水屏灰阶无可见差异。
  private static final Bitmap.Config OUTPUT_CONFIG = Bitmap.Config.RGB_565;
  private static final Bitmap.CompressFormat OUTPUT_FORMAT = Bitmap.CompressFormat.JPEG;
  private static final int OUTPUT_QUALITY = 85;
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

  /** 单片在源图坐标系中的纵向几何。 */
  private static final class SliceRect {
    final int sourceY;
    final int destinationY;
    final int height;

    SliceRect(int sourceY, int destinationY, int height) {
      this.sourceY = sourceY;
      this.destinationY = destinationY;
      this.height = height;
    }
  }

  /** 第 index 片的纵向几何：均分后的余数归入第一片（顶部），destinationY 为乱序前的目标位置。 */
  private static SliceRect sliceRect(int index, int splitCount, int height) {
    int baseHeight = height / splitCount;
    int remainder = height % splitCount;
    int sliceHeight = baseHeight;
    int destinationY = baseHeight * index;
    int sourceY = height - baseHeight * (index + 1) - remainder;
    if (index == 0) {
      sliceHeight += remainder;
    } else {
      destinationY += remainder;
    }
    return new SliceRect(sourceY, destinationY, sliceHeight);
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
    Paint paint = new Paint(Paint.FILTER_BITMAP_FLAG);

    for (int index = 0; index < splitCount; index++) {
      task.throwIfCancelled();
      SliceRect slice = sliceRect(index, splitCount, height);
      Rect sourceRect = new Rect(0, slice.sourceY, width, slice.sourceY + slice.height);
      RectF destinationRect =
          new RectF(
              0,
              (float) slice.destinationY * targetHeight / height,
              targetWidth,
              (float) (slice.destinationY + slice.height) * targetHeight / height);
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
    String outputPath = null;
    boolean completed = false;
    try {
      task.throwIfCancelled();
      if (task.splitCount < 2 || task.splitCount > 64 || task.maxPixels <= 0) {
        throw new IllegalArgumentException("扰乱图片参数无效");
      }
      String sourcePath = normalizePath(task.sourceValue);
      outputPath = normalizePath(task.outputValue);
      BitmapFactory.Options bounds = new BitmapFactory.Options();
      bounds.inJustDecodeBounds = true;
      BitmapFactory.decodeFile(sourcePath, bounds);
      if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
        throw new IllegalArgumentException("无法读取图片尺寸");
      }

      double scale =
          Math.min(1.0, Math.sqrt(task.maxPixels / ((double) bounds.outWidth * bounds.outHeight)));
      int targetWidth = Math.max(1, (int) Math.floor(bounds.outWidth * scale));
      int targetHeight = Math.max(1, (int) Math.floor(bounds.outHeight * scale));
      // RGB_565（每像素 2 字节）相比 ARGB_8888（4 字节）峰值内存减半；墨水屏为灰阶无可见差异，
      // 普通彩屏仅有轻微精度损失。Canvas.drawBitmap 兼容 565 作为 backing store。
      output = Bitmap.createBitmap(targetWidth, targetHeight, OUTPUT_CONFIG);

      decodeIntoCanvas(task, sourcePath, bounds, targetWidth, targetHeight, new Canvas(output));
      completed = writeResult(task, output, outputPath, targetWidth, targetHeight);
    } catch (InterruptedException error) {
      task.reject("IMAGE_PROCESSING_CANCELLED", "图片处理已取消", error);
    } catch (Throwable error) {
      task.reject("IMAGE_PROCESSING_FAILED", "扰乱图片处理失败", error);
    } finally {
      if (!completed && outputPath != null) {
        // 写入中断时不保留无法使用的半成品。
        new File(outputPath).delete();
      }
      if (output != null) {
        output.recycle();
      }
    }
  }

  /**
   * 按分片几何把源图逐片解码并绘制到 canvas：优先 BitmapRegionDecoder 区域解码，
   * 创建失败时回退为整图解码 + drawSlices。
   */
  private static void decodeIntoCanvas(
      ImageTask task,
      String sourcePath,
      BitmapFactory.Options bounds,
      int targetWidth,
      int targetHeight,
      Canvas canvas)
      throws InterruptedException {
    Paint paint = new Paint(Paint.FILTER_BITMAP_FLAG);
    BitmapRegionDecoder decoder = null;
    try {
      try {
        decoder = createRegionDecoder(sourcePath);
      } catch (Exception ignored) {
        decoder = null;
      }

      if (decoder != null) {
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize =
            ImageSampling.calculateSampleSize(bounds.outWidth, bounds.outHeight, task.maxPixels);
        for (int index = 0; index < task.splitCount; index++) {
          task.throwIfCancelled();
          SliceRect slice = sliceRect(index, task.splitCount, bounds.outHeight);
          Bitmap region =
              decoder.decodeRegion(
                  new Rect(0, slice.sourceY, bounds.outWidth, slice.sourceY + slice.height),
                  options);
          if (region == null) {
            throw new IllegalStateException("图片分片解码失败");
          }
          try {
            RectF destination =
                new RectF(
                    0,
                    (float) slice.destinationY * targetHeight / bounds.outHeight,
                    targetWidth,
                    (float) (slice.destinationY + slice.height) * targetHeight / bounds.outHeight);
            canvas.drawBitmap(region, null, destination, paint);
          } finally {
            region.recycle();
          }
        }
      } else {
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize =
            ImageSampling.calculateSampleSize(bounds.outWidth, bounds.outHeight, task.maxPixels);
        Bitmap fullSource = BitmapFactory.decodeFile(sourcePath, options);
        if (fullSource == null) {
          throw new IllegalStateException("图片解码失败");
        }
        try {
          drawSlices(fullSource, canvas, task.splitCount, targetWidth, targetHeight, task);
        } finally {
          fullSource.recycle();
        }
      }
    } finally {
      if (decoder != null) {
        decoder.recycle();
      }
    }
  }

  /** 把输出 Bitmap 写入 outputPath 并以 {path, width, height} resolve；返回是否成功 settle。 */
  private static boolean writeResult(
      ImageTask task, Bitmap output, String outputPath, int targetWidth, int targetHeight)
      throws IOException, InterruptedException {
    task.throwIfCancelled();
    File destination = new File(outputPath);
    File parent = destination.getParentFile();
    if (parent != null && !parent.exists() && !parent.mkdirs()) {
      throw new IllegalStateException("无法创建临时图片目录");
    }
    try (FileOutputStream stream = new FileOutputStream(destination)) {
      if (!output.compress(OUTPUT_FORMAT, OUTPUT_QUALITY, stream)) {
        throw new IllegalStateException("图片写入失败");
      }
    }

    WritableMap result = Arguments.createMap();
    result.putString("path", outputPath);
    result.putInt("width", targetWidth);
    result.putInt("height", targetHeight);
    task.throwIfCancelled();
    return task.resolve(result);
  }
}
