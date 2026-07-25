import React, { Fragment } from 'react';
import { Icon, Text, Button, VStack, Center, ScrollView, useDisclose, View } from 'native-base';
import { action, useAppSelector, useAppDispatch } from '~/redux';
import { Linking } from 'react-native';
import { CacheManager } from '@georstat/react-native-image-cache';
import { AsyncStatus, ThemeMode } from '~/utils';
import ErrorWithRetry from '~/components/ErrorWithRetry';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import SpinLoading from '~/components/SpinLoading';
import PathModal from '~/components/PathModal';
import Overlay from '~/components/Overlay';
import { useResolvedThemeMode, useThemePalette } from '~/utils/theme/hooks';
import ThemeModeSelector from '~/components/ThemeModeSelector';

const { backup, restore, clearCache, loadLatestRelease, setAndroidDownloadPath, setThemeMode } =
  action;

const About = () => {
  const { isOpen: isClearing, onOpen: openClearing, onClose: closeClearing } = useDisclose();
  const { isOpen: isModalOpen, onOpen: onModalOpen, onClose: onModalClose } = useDisclose();
  const {
    isOpen: isAlbumPathOpen,
    onOpen: onAlbumPathOpen,
    onClose: onAlbumPathClose,
  } = useDisclose();
  const dispatch = useAppDispatch();
  const release = useAppSelector((state) => state.release);
  const clearStatus = useAppSelector((state) => state.datasync.clearStatus);
  const backupStatus = useAppSelector((state) => state.datasync.backupStatus);
  const restoreStatus = useAppSelector((state) => state.datasync.restoreStatus);
  const androidDownloadPath = useAppSelector((state) => state.setting.androidDownloadPath);
  const themeMode = useAppSelector((state) => state.setting.themeMode);
  const resolvedThemeMode = useResolvedThemeMode();
  const palette = useThemePalette();

  const handleRetry = () => {
    dispatch(loadLatestRelease());
  };

  const handleBackup = () => {
    dispatch(backup());
  };
  const handleRestore = () => {
    dispatch(restore());
  };

  const handleApkDownload = () => {
    if (release.latest) {
      Linking.canOpenURL(release.latest.file?.apk.downloadUrl || '').then((supported) => {
        supported && Linking.openURL(release.latest?.file?.apk.downloadUrl || '');
      });
    }
  };

  const handleImageCacheClear = () => {
    openClearing();
    CacheManager.clearCache().finally(() => {
      setTimeout(closeClearing, 500);
    });
  };
  const handleStorageCacheClear = () => {
    dispatch(clearCache());
    onModalClose();
  };

  const handleAlbumPathClose = (path: string) => {
    onAlbumPathClose();
    dispatch(setAndroidDownloadPath(path));
  };
  const handleThemeModeChange = (mode: ThemeMode) => {
    if (mode !== themeMode) {
      dispatch(setThemeMode(mode));
    }
  };

  return (
    <View flex={1} bg={palette.bg}>
      <ScrollView>
        <VStack space={6} px={8} py={8} safeAreaX safeAreaBottom>
          <VStack alignItems="center">
            <Text fontSize="3xl" fontWeight="bold" color={palette.text}>
              {release.name}
            </Text>
            <Text fontSize="md" fontWeight="bold" color={palette.text}>
              {`${release.publishTime}  ${release.version}`}
            </Text>
          </VStack>

          {release.loadStatus === AsyncStatus.Pending && <SpinLoading />}
          {release.loadStatus === AsyncStatus.Rejected && (
            <ErrorWithRetry color={palette.text} onRetry={handleRetry} />
          )}
          {release.loadStatus === AsyncStatus.Fulfilled && release.latest === undefined && (
            <Center alignItems="center">
              <Icon
                as={MaterialIcons}
                name="check-circle-outline"
                size={20}
                color={palette.text}
              />
              <Text color={palette.text} pb={4} fontWeight="bold">
                暂无更新
              </Text>
            </Center>
          )}
          {release.loadStatus === AsyncStatus.Fulfilled && release.latest !== undefined && (
            <Fragment>
              <Text color={palette.text} fontSize="lg" fontWeight="bold">
                {release.latest.publishTime} {release.latest.version}
              </Text>
              <Text color={palette.text} pb={4} fontSize="md" fontWeight="bold">
                {release.latest.changeLog}
              </Text>

              <Button
                leftIcon={<Icon as={MaterialIcons} name="android" size="lg" />}
                onPress={handleApkDownload}
              >
                APK下载
              </Button>
            </Fragment>
          )}

          <ThemeModeSelector
            value={themeMode}
            resolvedMode={resolvedThemeMode}
            onChange={handleThemeModeChange}
          />

          <Button
            isDisabled={backupStatus === AsyncStatus.Pending}
            leftIcon={<Icon as={MaterialIcons} name="backup" size="lg" />}
            onPress={handleBackup}
          >
            {backupStatus === AsyncStatus.Pending ? '备份中…' : '备份'}
          </Button>
          <Button
            isDisabled={restoreStatus === AsyncStatus.Pending}
            leftIcon={<Icon as={MaterialIcons} name="restore" size="lg" />}
            onPress={handleRestore}
          >
            {restoreStatus === AsyncStatus.Pending ? '恢复中…' : '恢复'}
          </Button>
          <Button
            leftIcon={<Icon as={MaterialIcons} name="drive-file-move" size="lg" />}
            onPress={onAlbumPathOpen}
          >
            漫画导出目录
          </Button>
          <Button
            isDisabled={isClearing}
            leftIcon={<Icon as={MaterialIcons} name="image-not-supported" size="lg" />}
            onPress={handleImageCacheClear}
          >
            {isClearing ? '清除中…' : '清除图片缓存'}
          </Button>
          {__DEV__ && (
            <Button
              isDisabled={clearStatus === AsyncStatus.Pending}
              leftIcon={<Icon as={MaterialIcons} name="clear-all" size="lg" />}
              onPress={onModalOpen}
            >
              {clearStatus === AsyncStatus.Pending ? '清除中…' : '清除本地离线数据'}
            </Button>
          )}
        </VStack>

        <Overlay isOpen={isModalOpen} title="警告" onClose={onModalClose}>
          <View p={4}>
            <Text color={palette.text} fontSize="md">
              此操作会清空收藏列表、漫画数据、插件和观看设置，请谨慎！
            </Text>
            <Button.Group size="sm" space="sm" mt={4} justifyContent="flex-end">
              <Button px={5} variant="outline" colorScheme="gray" onPress={onModalClose}>
                取消
              </Button>
              <Button px={5} onPress={handleStorageCacheClear}>
                确认
              </Button>
            </Button.Group>
          </View>
        </Overlay>

        <PathModal
          isOpen={isAlbumPathOpen}
          defaultValue={androidDownloadPath}
          onClose={handleAlbumPathClose}
        />
      </ScrollView>
    </View>
  );
};

export default About;
