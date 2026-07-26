import { NativeModules, Platform } from 'react-native';

/** 安全凭据的存储 key；原生侧仅接受白名单内的值 */
export type SecureCredentialKey = 'bika' | 'hcomic' | 'nh';

interface SecureTokenNativeModule {
  createSessionNonce(): string;
  setCredential(key: string, value: string): Promise<void>;
  getCredential(key: string): Promise<string | null>;
  clearCredential(key: string): Promise<void>;
}

const requireModule = (): SecureTokenNativeModule => {
  const nativeModule = NativeModules.SecureTokenModule as SecureTokenNativeModule | undefined;
  if (Platform.OS !== 'android' || !nativeModule) {
    throw new Error('当前平台不支持安全凭据存储');
  }
  return nativeModule;
};

// 插件 ID（Plugin 枚举的字符串值）→ 凭据 key；不 import ~/plugins 避免与插件系统形成模块环
const credentialKeyByPlugin: Record<string, SecureCredentialKey> = {
  BIKA: 'bika',
  HCOMIC: 'hcomic',
  NH: 'nh',
};

/** 插件对应的凭据 key；不支持在线凭据的插件返回 undefined */
export const pluginCredentialKey = (plugin: string): SecureCredentialKey | undefined =>
  credentialKeyByPlugin[plugin];

/** 凭据 key → syncExtraData 的 extra 字段名 */
export const credentialExtraField: Record<SecureCredentialKey, string> = {
  bika: 'bikaToken',
  hcomic: 'hcomicToken',
  nh: 'nhApiKey',
};

export const secureCredentialKeys = Object.keys(credentialExtraField) as SecureCredentialKey[];

export const SecureToken = {
  createSessionNonce: () => requireModule().createSessionNonce(),
  setCredential: (key: SecureCredentialKey, value: string) =>
    requireModule().setCredential(key, value),
  getCredential: (key: SecureCredentialKey) => requireModule().getCredential(key),
  clearCredential: (key: SecureCredentialKey) => requireModule().clearCredential(key),
};
