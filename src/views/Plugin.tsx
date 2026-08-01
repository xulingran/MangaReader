import React, { useState } from 'react';
import { action, useAppSelector, useAppDispatch } from '~/redux';
import { Box, Text, VStack, HStack, ScrollView } from 'native-base';
import { useDebouncedSafeAreaInsets } from '~/hooks';
import { Plugin as PluginType, PluginMap } from '~/plugins';
import ScoreRate from '~/components/ScoreRate';
import VectorIcon from '~/components/VectorIcon';
import LoginModal from '~/components/LoginModal';
import ApiKeyModal from '~/components/ApiKeyModal';
import { useThemePalette } from '~/utils/theme/hooks';
import { ChineseOnly } from '~/utils';

const { sortPlugin, disablePlugin, loginPlugin, saveCredential, setChineseOnly } = action;

const Plugin = ({ navigation: { navigate } }: StackPluginProps) => {
  const dispatch = useAppDispatch();
  const list = useAppSelector((state) => state.plugin.list);
  const chineseOnly = useAppSelector((state) => state.setting.chineseOnly);
  const { left, right, bottom } = useDebouncedSafeAreaInsets();
  const palette = useThemePalette();
  const [loginSource, setLoginSource] = useState<PluginType | null>(null);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);

  const move = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= list.length) {
      return;
    }
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    dispatch(sortPlugin(next));
  };

  return (
    <Box flex={1} bg={palette.bg}>
      <ScrollView contentContainerStyle={{ paddingLeft: left, paddingRight: right, paddingBottom: bottom }}>
        {list.map((item, index) => (
          <HStack
            key={item.value}
            space={3}
            alignItems="center"
            px={4}
            py={3}
            borderBottomWidth={1}
            borderColor={palette.border}
          >
            <VStack space={1} flexGrow={1} w={0}>
              <Text
                fontSize="lg"
                fontWeight="bold"
                color={palette.text}
                accessibilityRole="link"
                onPress={() =>
                  navigate('Webview', {
                    uri: item.href,
                    source: item.value,
                    userAgent: item.userAgent,
                    injectedJavascript: item.injectedJavaScript,
                  })
                }
                textDecorationLine={item.disabled ? 'line-through' : 'none'}
              >
                {item.name} - {item.label} 🔗
              </Text>
              {item.description && (
                <Text color={palette.subText} fontSize="sm">
                  {item.description}
                </Text>
              )}
              <HStack alignItems="center">
                <Text color={palette.text} fontSize="sm">
                  推荐指数：
                </Text>
                <ScoreRate score={item.score} />
              </HStack>
            </VStack>
            <VStack>
              <VectorIcon
                name="keyboard-arrow-up"
                size="lg"
                disabled={index === 0}
                label="上移"
                accessibilityLabel="上移来源"
                accessibilityState={{ disabled: index === 0 }}
                onPress={() => move(index, -1)}
              />
              <VectorIcon
                name="keyboard-arrow-down"
                size="lg"
                disabled={index === list.length - 1}
                label="下移"
                accessibilityLabel="下移来源"
                accessibilityState={{ disabled: index === list.length - 1 }}
                onPress={() => move(index, 1)}
              />
            </VStack>
            <VectorIcon
              name={item.disabled ? 'check-box-outline-blank' : 'check-box'}
              size="lg"
              label="启用"
              accessibilityLabel={item.disabled ? '启用来源' : '停用来源'}
              accessibilityState={{ checked: !item.disabled }}
              onPress={() => dispatch(disablePlugin(item.value))}
            />
            {item.value === PluginType.MANHUAUK && (
              <VectorIcon
                name={chineseOnly === ChineseOnly.Enable ? 'check-box' : 'check-box-outline-blank'}
                size="lg"
                label="只看中文"
                accessibilityLabel={
                  chineseOnly === ChineseOnly.Enable ? '关闭只看中文漫画' : '开启只看中文漫画'
                }
                accessibilityState={{ checked: chineseOnly === ChineseOnly.Enable }}
                onPress={() =>
                  dispatch(
                    setChineseOnly(
                      chineseOnly === ChineseOnly.Enable ? ChineseOnly.Disabled : ChineseOnly.Enable
                    )
                  )
                }
              />
            )}
            {(item.value === PluginType.BIKA || item.value === PluginType.HCOMIC) && (
              <VectorIcon
                name="login"
                size="lg"
                label="登录"
                accessibilityLabel="账号密码登录"
                onPress={() => setLoginSource(item.value)}
              />
            )}
            {item.value === PluginType.NH && (
              <VectorIcon
                name="vpn-key"
                size="lg"
                label="密钥"
                accessibilityLabel="配置 API Key"
                onPress={() => setApiKeyVisible(true)}
              />
            )}
            {!item.disabled && Boolean(PluginMap.get(item.value)?.prepareFavoritesFetch) && (
              <VectorIcon
                name="bookmarks"
                size="lg"
                label="收藏夹"
                accessibilityLabel="查看在线收藏夹"
                onPress={() => navigate('OnlineFavorites', { source: item.value })}
              />
            )}
          </HStack>
        ))}
      </ScrollView>
      <LoginModal
        title={`${loginSource === PluginType.HCOMIC ? 'HComic' : '哔咔'}账号密码登录`}
        isOpen={loginSource !== null}
        onClose={() => setLoginSource(null)}
        onSubmit={(username, password) => {
          const source = loginSource;
          setLoginSource(null);
          if (source) {
            dispatch(loginPlugin({ source, username, password }));
          }
        }}
      />
      <ApiKeyModal
        title="nhentai API Key"
        isOpen={apiKeyVisible}
        onClose={() => setApiKeyVisible(false)}
        onSubmit={(apiKey) => {
          setApiKeyVisible(false);
          dispatch(saveCredential({ source: PluginType.NH, credential: apiKey }));
        }}
      />
    </Box>
  );
};

export default Plugin;
