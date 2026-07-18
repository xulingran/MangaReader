package com.mangareader.eink;

import android.view.KeyEvent;

import androidx.annotation.Nullable;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.lang.ref.WeakReference;

/**
 * 电子墨水设备实体翻页键桥接模块。
 * 仅在阅读页（setReaderActive(true)）时拦截按键：
 *   VOLUME_UP / PAGE_UP / DPAD_LEFT   -> previous
 *   VOLUME_DOWN / PAGE_DOWN / DPAD_RIGHT -> next
 * 事件名 "pageKey"，载荷 {direction: 'previous' | 'next'}。
 * 长按只会重复 ACTION_DOWN，ACTION_UP 仅触发一次，因此天然避免长按重复翻页。
 */
public class EInkKeyModule extends ReactContextBaseJavaModule {
  public static final String NAME = "EInkKeyModule";
  public static final String EVENT_PAGE_KEY = "pageKey";

  private static final int DIRECTION_PREVIOUS = 0;
  private static final int DIRECTION_NEXT = 1;

  private static boolean readerActive = false;
  private static WeakReference<ReactApplicationContext> reactContextRef = new WeakReference<>(null);

  public EInkKeyModule(ReactApplicationContext reactContext) {
    super(reactContext);
    reactContextRef = new WeakReference<>(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  @ReactMethod
  public void setReaderActive(boolean active) {
    readerActive = active;
  }

  @ReactMethod
  public void addListener(String eventName) {
    // NativeEventEmitter 要求实现，无需处理
  }

  @ReactMethod
  public void removeListeners(Integer count) {
    // NativeEventEmitter 要求实现，无需处理
  }

  /**
   * @return 0=previous, 1=next, null=非翻页键
   */
  @Nullable
  public static Integer directionForKey(int keyCode) {
    switch (keyCode) {
      case KeyEvent.KEYCODE_VOLUME_UP:
      case KeyEvent.KEYCODE_PAGE_UP:
      case KeyEvent.KEYCODE_DPAD_LEFT:
        return DIRECTION_PREVIOUS;
      case KeyEvent.KEYCODE_VOLUME_DOWN:
      case KeyEvent.KEYCODE_PAGE_DOWN:
      case KeyEvent.KEYCODE_DPAD_RIGHT:
        return DIRECTION_NEXT;
      default:
        return null;
    }
  }

  /**
   * 由 MainActivity.dispatchKeyEvent 调用。
   * @return true 表示事件已被消费（拦截），false 表示交给系统处理
   */
  public static boolean handleKeyEvent(KeyEvent event) {
    if (!readerActive) {
      return false;
    }
    Integer direction = directionForKey(event.getKeyCode());
    if (direction == null) {
      return false;
    }
    // 消费 down/up 两个动作，避免系统音量键弹窗与焦点移动
    if (event.getAction() == KeyEvent.ACTION_UP && event.getRepeatCount() == 0) {
      emitPageKey(direction == DIRECTION_PREVIOUS ? "previous" : "next");
    }
    return true;
  }

  private static void emitPageKey(String direction) {
    ReactContext context = reactContextRef.get();
    if (context == null || !context.hasActiveReactInstance()) {
      return;
    }
    WritableMap payload = Arguments.createMap();
    payload.putString("direction", direction);
    context
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
        .emit(EVENT_PAGE_KEY, payload);
  }
}
