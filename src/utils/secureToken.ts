import { NativeModules, Platform } from 'react-native';

interface SecureTokenNativeModule {
  createSessionNonce(): string;
  setBikaToken(token: string): Promise<void>;
  getBikaToken(): Promise<string | null>;
  clearBikaToken(): Promise<void>;
}

const requireModule = (): SecureTokenNativeModule => {
  const nativeModule = NativeModules.SecureTokenModule as SecureTokenNativeModule | undefined;
  if (Platform.OS !== 'android' || !nativeModule) {
    throw new Error('当前平台不支持安全凭据存储');
  }
  return nativeModule;
};

export const SecureToken = {
  createSessionNonce: () => requireModule().createSessionNonce(),
  setBikaToken: (token: string) => requireModule().setBikaToken(token),
  getBikaToken: () => requireModule().getBikaToken(),
  clearBikaToken: () => requireModule().clearBikaToken(),
};
