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
import java.security.UnrecoverableKeyException;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** 将插件凭据（Token / API Key）加密后保存在应用私有目录，密钥仅存在于 Android Keystore。 */
public class SecureTokenModule extends ReactContextBaseJavaModule {
  public static final String NAME = "SecureTokenModule";
  private static final String KEYSTORE = "AndroidKeyStore";
  private static final String KEY_ALIAS = "MangaReader.BikaToken";
  private static final String PREFS = "mangareader_secure_credentials";
  private static final Set<String> ALLOWED_KEYS =
      new HashSet<>(Arrays.asList("bika", "hcomic", "nh"));
  private static final SecureRandom SECURE_RANDOM = new SecureRandom();
  // containsAlias/getKey/deleteEntry/generateKey 不是原子操作，串行化避免并发下重复重建
  private static final Object KEYSTORE_LOCK = new Object();

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

  private static String valueKey(String key) {
    return "credential_" + key;
  }

  private static String ivKey(String key) {
    return "credential_" + key + "_iv";
  }

  /** 旧版本（仅支持 Bika）使用的存储键，读取时做一次懒迁移 */
  private static final String LEGACY_BIKA_VALUE = "bika_token";
  private static final String LEGACY_BIKA_IV = "bika_token_iv";

  private static String checkedKey(String key) {
    if (key == null || !ALLOWED_KEYS.contains(key)) {
      throw new IllegalArgumentException("不支持的凭据类型");
    }
    return key;
  }

  /**
   * 读取或创建加解密密钥。alias 存在但密钥已损坏（UnrecoverableKeyException 或取回 null）时，
   * 删除坏 alias 后重建并重试一次；重建后旧密文随之失效，由读取侧走「清除 + 重新登录」流程。
   * 除密钥损坏外的异常原样抛出，不在这里吞掉。
   */
  private SecretKey getOrCreateKey() throws Exception {
    synchronized (KEYSTORE_LOCK) {
      KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
      keyStore.load(null);
      if (keyStore.containsAlias(KEY_ALIAS)) {
        SecretKey key = tryGetKey(keyStore);
        if (key != null) {
          return key;
        }
        keyStore.deleteEntry(KEY_ALIAS);
      }
      KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
      generator.init(
          new KeyGenParameterSpec.Builder(
                  KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
              .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
              .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
              .build());
      generator.generateKey();
      return (SecretKey) keyStore.getKey(KEY_ALIAS, null);
    }
  }

  /** 取回密钥；仅在密钥损坏（UnrecoverableKeyException）时返回 null，其余异常原样上抛。 */
  private static SecretKey tryGetKey(KeyStore keyStore) throws Exception {
    try {
      return (SecretKey) keyStore.getKey(KEY_ALIAS, null);
    } catch (UnrecoverableKeyException corrupted) {
      return null;
    }
  }

  /** WebView 凭据桥接使用的每会话随机数，不依赖 JS Math.random。 */
  @ReactMethod(isBlockingSynchronousMethod = true)
  public String createSessionNonce() {
    byte[] bytes = new byte[32];
    SECURE_RANDOM.nextBytes(bytes);
    return Base64.encodeToString(bytes, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
  }

  @ReactMethod
  public void setCredential(String key, String value, Promise promise) {
    try {
      String checked = checkedKey(key);
      String normalized = value == null ? "" : value.trim();
      if (normalized.isEmpty()) {
        if (doClear(checked)) {
          promise.resolve(null);
        } else {
          promise.reject("SECURE_TOKEN_CLEAR_FAILED", "清除安全凭据失败");
        }
        return;
      }
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
      byte[] encrypted = cipher.doFinal(normalized.getBytes(StandardCharsets.UTF_8));
      boolean committed = preferences()
          .edit()
          .putString(valueKey(checked), Base64.encodeToString(encrypted, Base64.NO_WRAP))
          .putString(ivKey(checked), Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
          .commit();
      if (!committed) {
        throw new IllegalStateException("安全凭据写入失败");
      }
      promise.resolve(null);
    } catch (Exception error) {
      promise.reject("SECURE_TOKEN_WRITE_FAILED", "安全保存凭据失败", error);
    }
  }

  @ReactMethod
  public void getCredential(String key, Promise promise) {
    try {
      String checked = checkedKey(key);
      String encodedValue = preferences().getString(valueKey(checked), null);
      String encodedIv = preferences().getString(ivKey(checked), null);
      // 旧版本 Bika Token 懒迁移：命中旧键则改存新键并删除旧键
      if (encodedValue == null && "bika".equals(checked)) {
        String legacyValue = preferences().getString(LEGACY_BIKA_VALUE, null);
        String legacyIv = preferences().getString(LEGACY_BIKA_IV, null);
        if (legacyValue != null && legacyIv != null) {
          preferences()
              .edit()
              .putString(valueKey(checked), legacyValue)
              .putString(ivKey(checked), legacyIv)
              .remove(LEGACY_BIKA_VALUE)
              .remove(LEGACY_BIKA_IV)
              .apply();
          encodedValue = legacyValue;
          encodedIv = legacyIv;
        }
      }
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
      try {
        String checked = checkedKey(key);
        preferences().edit().remove(valueKey(checked)).remove(ivKey(checked)).apply();
      } catch (Exception ignored) {
        // key 本身非法时无需清理
      }
      promise.reject("SECURE_TOKEN_READ_FAILED", "读取安全凭据失败，请重新登录", error);
    }
  }

  @ReactMethod
  public void clearCredential(String key, Promise promise) {
    try {
      if (doClear(checkedKey(key))) {
        promise.resolve(null);
      } else {
        promise.reject("SECURE_TOKEN_CLEAR_FAILED", "清除安全凭据失败");
      }
    } catch (Exception error) {
      promise.reject("SECURE_TOKEN_CLEAR_FAILED", "清除安全凭据失败", error);
    }
  }

  private boolean doClear(String key) {
    return preferences().edit().remove(valueKey(key)).remove(ivKey(key)).commit();
  }
}
