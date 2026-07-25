import React, { useMemo, useRef, useState } from 'react';
import { action, useAppDispatch } from '~/redux';
import { Plugin } from '~/plugins';
import { WebView } from 'react-native-webview';
import { Center, Text, useToast } from 'native-base';
import { SecureToken } from '~/utils/secureToken';
import { useThemePalette } from '~/utils/theme/hooks';

const { setCredential } = action;

export const isAllowedWebviewUrl = (initialUrl: string, candidateUrl: string): boolean => {
  try {
    const initial = new URL(initialUrl);
    const candidate = new URL(candidateUrl);
    return (
      ['http:', 'https:'].includes(candidate.protocol) &&
      candidate.origin === initial.origin
    );
  } catch {
    return false;
  }
};

export const parseBikaTokenMessage = (
  source: Plugin | undefined,
  value: string,
  expectedNonce: string
) => {
  if (source !== Plugin.BIKA || value.length > 8192) {
    return undefined;
  }
  try {
    const data: unknown = JSON.parse(value);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return undefined;
    }
    const entries = Object.entries(data);
    const { bikaToken: token, nonce } = data as { bikaToken?: unknown; nonce?: unknown };
    return entries.length === 2 && nonce === expectedNonce && typeof token === 'string' && token.trim()
      ? token.trim()
      : undefined;
  } catch {
    return undefined;
  }
};

const Webview = ({ navigation, route }: StackWebviewProps) => {
  const dispatch = useAppDispatch();
  const toast = useToast();
  const { uri, source, userAgent, injectedJavascript } = route.params || {};
  const palette = useThemePalette();
  const [sessionNonce] = useState(() =>
    source === Plugin.BIKA && injectedJavascript ? SecureToken.createSessionNonce() : ''
  );
  const credentialAcceptedRef = useRef(false);
  const titleRef = useRef('');
  const loadErrorToastedRef = useRef(false);
  const origin = useMemo(() => {
    try {
      return new URL(uri).origin;
    } catch {
      return undefined;
    }
  }, [uri]);
  const securedInjectedJavascript = injectedJavascript
    ? `window.__MANGA_READER_NONCE__=${JSON.stringify(sessionNonce)};\n${injectedJavascript}`
    : undefined;

  if (!origin) {
    return (
      <Center flex={1} bg={palette.bg}>
        <Text color={palette.text}>网页地址无效，无法打开</Text>
      </Center>
    );
  }

  return (
    <WebView
      source={{ uri }}
      style={{ backgroundColor: palette.bg }}
      userAgent={userAgent}
      originWhitelist={[origin]}
      onShouldStartLoadWithRequest={({ url }) => isAllowedWebviewUrl(uri, url)}
      sharedCookiesEnabled
      thirdPartyCookiesEnabled
      injectedJavaScript={securedInjectedJavascript}
      onMessage={async (event) => {
        if (
          !credentialAcceptedRef.current &&
          injectedJavascript &&
          isAllowedWebviewUrl(uri, event.nativeEvent.url)
        ) {
          const token = parseBikaTokenMessage(source, event.nativeEvent.data, sessionNonce);
          if (token) {
            credentialAcceptedRef.current = true;
            try {
              await SecureToken.setBikaToken(token);
              dispatch(setCredential({ source: Plugin.BIKA }));
            } catch (error) {
              credentialAcceptedRef.current = false;
              toast.show({
                title: error instanceof Error ? error.message : '安全保存 Bika Token 失败',
              });
            }
          }
        }
      }}
      onError={() => {
        if (!loadErrorToastedRef.current) {
          loadErrorToastedRef.current = true;
          toast.show({ title: '网页加载失败，请检查网络后重试' });
        }
      }}
      onHttpError={({ nativeEvent }) => {
        if (!loadErrorToastedRef.current) {
          loadErrorToastedRef.current = true;
          toast.show({ title: `网页加载失败（HTTP ${nativeEvent.statusCode}）` });
        }
      }}
      onNavigationStateChange={({ title }) => {
        if (title && title !== titleRef.current) {
          titleRef.current = title;
          navigation.setOptions({ title });
        }
      }}
    />
  );
};

export default Webview;
