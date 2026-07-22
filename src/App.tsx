import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createNativeStackNavigator, NativeStackHeaderProps } from '@react-navigation/native-stack';
import { navigationRef, customTheme, AsyncStatus } from '~/utils';
import { HeartAndBrowser, PrehandleDrawer } from '~/views/Detail';
import { SearchAndPlugin, PluginSelect } from '~/views/Discovery';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { store, useAppSelector } from '~/redux';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { NativeBaseProvider } from 'native-base';
import { useMessageToast } from '~/hooks';
import { ErrorBoundary } from 'react-error-boundary';
import { StyleSheet } from 'react-native';
import { Provider } from 'react-redux';
import ErrorFallback from '~/components/ErrorFallback';
import RNBootSplash from 'react-native-bootsplash';
import Header from '~/components/Header';
import { cleanupTemporaryImages } from '~/utils/imageProcessor';
import Home from '~/views/Home';
import Search from '~/views/Search';
import Discovery from '~/views/Discovery';
import Detail from '~/views/Detail';
import Chapter from '~/views/Chapter';
import Plugin from '~/views/Plugin';
import Webview from '~/views/Webview';
import About from '~/views/About';
import { useResolvedThemeMode, useThemePalette } from '~/utils/theme/hooks';
import { syncNativeThemeMode } from '~/utils/theme/native';

interface NavigationScreenProps {
  ready?: boolean;
}

const styles = StyleSheet.create({ wrapper: { flex: 1 } });
const { Navigator, Screen } = createNativeStackNavigator<RootStackParamList>();

const NavigationScreen = ({ ready = false }: NavigationScreenProps) => {
  const launchStatus = useAppSelector((state) => state.app.launchStatus);
  const latestRelease = useAppSelector((state) => state.release.latest);
  const haveUpdate = Boolean(latestRelease);

  const DefaultHeader = useCallback(
    (props: NativeStackHeaderProps) => <Header {...props} showUpdateIndicator={haveUpdate} />,
    [haveUpdate]
  );

  useEffect(() => {
    if (
      ready &&
      (launchStatus === AsyncStatus.Fulfilled || launchStatus === AsyncStatus.Rejected)
    ) {
      RNBootSplash.hide();
    }
  }, [ready, launchStatus]);
  useMessageToast();

  return (
    <ErrorBoundary fallbackRender={ErrorFallback}>
      <Navigator
        initialRouteName="Home"
        screenOptions={{ header: DefaultHeader, freezeOnBlur: true, animation: 'none' }}
      >
        <Screen name="Home" component={Home} />
        <Screen
          name="Discovery"
          options={{ title: '', headerLeft: SearchAndPlugin }}
          component={Discovery}
        />
        <Screen name="Search" options={{ headerRight: PluginSelect }} component={Search} />
        <Screen
          name="Detail"
          options={{ title: 'loading...', headerRight: HeartAndBrowser }}
          component={Detail}
        />
        <Screen name="Chapter" options={{ headerShown: false }} component={Chapter} />
        <Screen name="Plugin" component={Plugin} />
        <Screen name="Webview" component={Webview} />
        <Screen name="About" component={About} />
      </Navigator>
    </ErrorBoundary>
  );
};

const AppShell = () => {
  const [ready, setReady] = useState(false);
  const launchStatus = useAppSelector((state) => state.app.launchStatus);
  const themeMode = useAppSelector((state) => state.setting.themeMode);
  const resolvedThemeMode = useResolvedThemeMode();
  const palette = useThemePalette();
  const navigationTheme = useMemo(
    () => ({
      ...DefaultTheme,
      dark: resolvedThemeMode === 'dark',
      colors: {
        primary: palette.text,
        background: palette.bg,
        card: palette.header,
        text: palette.text,
        border: palette.border,
        notification: palette.selectedBg,
      },
    }),
    [palette, resolvedThemeMode]
  );

  useEffect(() => {
    cleanupTemporaryImages();
  }, []);

  useEffect(() => {
    if (launchStatus === AsyncStatus.Fulfilled || launchStatus === AsyncStatus.Rejected) {
      syncNativeThemeMode(themeMode).catch((error) => {
        console.warn('同步 Android 主题失败', error);
      });
    }
  }, [launchStatus, themeMode]);

  return (
    <GestureHandlerRootView style={[styles.wrapper, { backgroundColor: palette.bg }]}>
      <NativeBaseProvider theme={customTheme}>
        <NavigationContainer
          ref={navigationRef}
          theme={navigationTheme}
          onReady={() => setReady(true)}
        >
          <NavigationScreen ready={ready} />
          <PrehandleDrawer />
        </NavigationContainer>
      </NativeBaseProvider>
    </GestureHandlerRootView>
  );
};

const App = () => (
  <Provider store={store}>
    <AppShell />
  </Provider>
);

/** for the json schema generate */
/** https://github.com/YousefED/typescript-json-schema/issues/307 */
export type RootStateType = RootState;
export type DictStateType = RootState['dict'];
export type TaskStateType = RootState['task'];
export type PluginStateType = RootState['plugin'];
export type SettingStateType = RootState['setting'];
export type FavoritesStateType = RootState['favorites'];
export default App;
