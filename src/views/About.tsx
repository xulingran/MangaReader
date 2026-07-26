import React, { useEffect, useRef } from 'react';
import {
  Icon,
  Text,
  Button,
  VStack,
  Center,
  ScrollView,
  useDisclose,
  useToast,
  View,
} from 'native-base';
import { action, useAppSelector, useAppDispatch } from '~/redux';
import { Linking } from 'react-native';
import { CacheManager } from '@georstat/react-native-image-cache';
import { AsyncStatus, IconLabel, ThemeMode } from '~/utils';
import ErrorWithRetry from '~/components/ErrorWithRetry';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import SpinLoading from '~/components/SpinLoading';
import PathModal from '~/components/PathModal';
import Overlay from '~/components/Overlay';
import { useResolvedThemeMode, useThemePalette } from '~/utils/theme/hooks';
import ThemeModeSelector from '~/components/ThemeModeSelector';
import IconLabelSelector from '~/components/IconLabelSelector';

const { backup, restore, clearCache, loadLatestRelease, setAndroidDownloadPath, setThemeMode } =
  action;
const { setIconLabel } = action;

// 清除完成后让「清除中…」状态多停留一拍，避免按钮文案闪现、用户感知不到操作已结束
const CLEARING_FEEDBACK_MS = 500;

const About = () => {
  const { isOpen: isClearing, onOpen: openClearing, onClose: closeClearing } = useDisclose();
  const { isOpen: isModalOpen, onOpen: onModalOpen, onClose: onModalClose } = useDisclose();
  const {
    isOpen: isAlbumPathOpen,
    onOpen: onAlbumPathOpen,
    onClose: onAlbumPathClose,
  } = useDisclose();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const clearingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const release = useAppSelector((state) => state.release);
  const clearStatus = useAppSelector((state) => state.datasync.clearStatus);
  const backupStatus = useAppSelector((state) => state.datasync.backupStatus);
  const restoreStatus = useAppSelector((state) => state.datasync.restoreStatus);
  const androidDownloadPath = useAppSelector((state) => state.setting.androidDownloadPath);
  const themeMode = useAppSelector((state) => state.setting.themeMode);
  const iconLabel = useAppSelector((state) => state.setting.iconLabel);
  const resolvedThemeMode = useResolvedThemeMode();
  const palette = useThemePalette();

  useEffect(() => {
    return () => {
      if (clearingTimerRef.current) {
        clearTimeout(clearingTimerRef.current);
      }
    };
  }, []);

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
    if (!release.latest) {
      return;
    }
    const downloadUrl = release.latest.file?.apk.downloadUrl || '';
    Linking.canOpenURL(downloadUrl)
      .then((supported) => {
        if (supported) {
          Linking.openURL(downloadUrl).catch(() => {
            toast.show({ title: '打开下载链接失败' });
          });
        } else {
          toast.show({ title: '当前设备无法打开下载链接' });
        }
      })
      .catch(() => {
        toast.show({ title: '打开下载链接失败' });
      });
  };

  const handleImageCacheClear = () => {
    openClearing();
    CacheManager.clearCache()
      .catch(() => {
        toast.show({ title: '清除图片缓存失败，请稍后重试' });
      })
      .finally(() => {
        clearingTimerRef.current = setTimeout(closeClearing, CLEARING_FEEDBACK_MS);
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
  const handleIconLabelChange = (value: IconLabel) => {
    if (value !== iconLabel) {
      toast.show({
        title: value === IconLabel.Enable ? '已开启图标说明文字' : '已关闭图标说明文字',
      });
      dispatch(setIconLabel(value));
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
            <Center>
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
            <>
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
            </>
          )}

          <ThemeModeSelector
            value={themeMode}
            resolvedMode={resolvedThemeMode}
            onChange={handleThemeModeChange}
          />

          <IconLabelSelector value={iconLabel} onChange={handleIconLabelChange} />

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
