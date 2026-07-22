package com.mangareader.secure;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** 将 Bika Token 加密后保存在应用私有目录，密钥仅存在于 Android Keystore。 */
public class SecureTokenModule extends ReactContextBaseJavaModule {
  public static final String NAME = "SecureTokenModule";
  private static final String KEYSTORE = "AndroidKeyStore";
  private static final String KEY_ALIAS = "MangaReader.BikaToken";
  private static final String PREFS = "mangareader_secure_credentials";
  private static final String VALUE = "bika_token";
  private static final String IV = "bika_token_iv";
  private static final SecureRandom SECURE_RANDOM = new SecureRandom();

  public SecureTokenModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  private SharedPreferences preferences() {
    return getReactApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
  }

  private SecretKey getOrCreateKey() throws Exception {
    KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
    keyStore.load(null);
    if (!keyStore.containsAlias(KEY_ALIAS)) {
      KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
      generator.init(
          new KeyGenParameterSpec.Builder(
                  KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
              .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
              .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
              .build());
      generator.generateKey();
    }
    return (SecretKey) keyStore.getKey(KEY_ALIAS, null);
  }

  /** WebView 凭据桥接使用的每会话随机数，不依赖 JS Math.random。 */
  @ReactMethod(isBlockingSynchronousMethod = true)
  public String createSessionNonce() {
    byte[] bytes = new byte[32];
    SECURE_RANDOM.nextBytes(bytes);
    return Base64.encodeToString(bytes, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
  }

  @ReactMethod
  public void setBikaToken(String token, Promise promise) {
    try {
      String normalized = token == null ? "" : token.trim();
      if (normalized.isEmpty()) {
        clearBikaToken(promise);
        return;
      }
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
      byte[] encrypted = cipher.doFinal(normalized.getBytes(StandardCharsets.UTF_8));
      boolean committed = preferences()
          .edit()
          .putString(VALUE, Base64.encodeToString(encrypted, Base64.NO_WRAP))
          .putString(IV, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
          .commit();
      if (!committed) {
        throw new IllegalStateException("安全凭据写入失败");
      }
      promise.resolve(null);
    } catch (Exception error) {
      promise.reject("SECURE_TOKEN_WRITE_FAILED", "安全保存 Bika Token 失败", error);
    }
  }

  @ReactMethod
  public void getBikaToken(Promise promise) {
    try {
      String encodedValue = preferences().getString(VALUE, null);
      String encodedIv = preferences().getString(IV, null);
      if (encodedValue == null || encodedIv == null) {
        promise.resolve(null);
        return;
      }
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(
          Cipher.DECRYPT_MODE,
          getOrCreateKey(),
          new GCMParameterSpec(128, Base64.decode(encodedIv, Base64.NO_WRAP)));
      byte[] decrypted = cipher.doFinal(Base64.decode(encodedValue, Base64.NO_WRAP));
      promise.resolve(new String(decrypted, StandardCharsets.UTF_8));
    } catch (Exception error) {
      preferences().edit().remove(VALUE).remove(IV).apply();
      promise.reject("SECURE_TOKEN_READ_FAILED", "读取 Bika Token 失败，请重新登录", error);
    }
  }

  @ReactMethod
  public void clearBikaToken(Promise promise) {
    if (preferences().edit().remove(VALUE).remove(IV).commit()) {
      promise.resolve(null);
    } else {
      promise.reject("SECURE_TOKEN_CLEAR_FAILED", "清除 Bika Token 失败");
    }
  }
}
