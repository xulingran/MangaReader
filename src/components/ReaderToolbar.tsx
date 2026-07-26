import React, { useCallback, Fragment } from 'react';
import { Box, Text, Flex, HStack, Pressable, useToast } from 'native-base';
import {
  LayoutMode,
  ReaderDirection,
  MultipleSeat,
  PageKeys,
  Timer,
  Orientation,
} from '~/utils';
import { action, useAppDispatch } from '~/redux';
import VectorIcon from '~/components/VectorIcon';
import { usePressedState, useThemePalette } from '~/utils/theme/hooks';

const { setMode, setDirection, setSeat, setPageKeys, setTimer } = action;

const layoutIconDict = {
  [LayoutMode.Horizontal]: 'book-open-page-variant-outline',
  [LayoutMode.Vertical]: 'filmstrip',
  [LayoutMode.Multiple]: 'book-open-outline',
};

interface ReaderToolbarProps {
  title: string;
  current: number;
  max: number;
  mode: LayoutMode;
  inverted: boolean;
  seat: MultipleSeat;
  pageKeys: PageKeys;
  timer: Timer;
  timerGap: number;
  orientation: Orientation;
  prev?: ChapterItem;
  next?: ChapterItem;
  isMenuOpen: boolean;
  onMenuToggle: () => void;
  onGoBack: () => void;
  onReload: () => void;
  onOrientationToggle: () => void;
  onTimerGapOpen: () => void;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  onJumpOpen: () => void;
}

/** 阅读页头部（返回/标题/重载/旋转/设置菜单）与底部工具栏（上一章/跳页/下一章），无动画 */
const ReaderToolbar = ({
  title,
  current,
  max,
  mode,
  inverted,
  seat,
  pageKeys,
  timer,
  timerGap,
  orientation,
  prev,
  next,
  isMenuOpen,
  onMenuToggle,
  onGoBack,
  onReload,
  onOrientationToggle,
  onTimerGapOpen,
  onPrevChapter,
  onNextChapter,
  onJumpOpen,
}: ReaderToolbarProps) => {
  const toast = useToast();
  const dispatch = useAppDispatch();
  const palette = useThemePalette();
  const bg = palette.bg;
  const color = palette.text;
  const [pageBoxPressed, pageBoxBind] = usePressedState();

  const handleSeatToggle = useCallback(() => {
    if (seat === MultipleSeat.AToB) {
      toast.show({ title: '双页漫画顺序: 从右向左' });
      dispatch(setSeat(MultipleSeat.BToA));
    } else {
      toast.show({ title: '双页漫画顺序: 从左向右' });
      dispatch(setSeat(MultipleSeat.AToB));
    }
  }, [dispatch, seat, toast]);
  const handlePageKeysToggle = useCallback(() => {
    if (pageKeys === PageKeys.Enable) {
      toast.show({ title: '已关闭实体键翻页' });
      dispatch(setPageKeys(PageKeys.Disabled));
    } else {
      toast.show({ title: '已开启实体键翻页' });
      dispatch(setPageKeys(PageKeys.Enable));
    }
  }, [dispatch, pageKeys, toast]);
  const handleTimerToggle = useCallback(() => {
    if (timer === Timer.Enable) {
      toast.show({ title: '已关闭定时翻页' });
      dispatch(setTimer(Timer.Disabled));
    } else {
      toast.show({ title: `已开启定时翻页，间隔${(timerGap / 1000).toFixed(1)}s` });
      dispatch(setTimer(Timer.Enable));
    }
  }, [dispatch, timer, timerGap, toast]);
  const handleDirectionToggle = useCallback(() => {
    if (inverted) {
      toast.show({ title: '阅读方向: 从左向右' });
      dispatch(setDirection(ReaderDirection.Right));
    } else {
      toast.show({ title: '阅读方向: 从右向左' });
      dispatch(setDirection(ReaderDirection.Left));
    }
  }, [dispatch, inverted, toast]);
  const handleVertical = useCallback(() => {
    toast.show({ title: '条漫模式' });
    dispatch(setMode(LayoutMode.Vertical));
  }, [dispatch, toast]);
  const handleHorizontal = useCallback(() => {
    toast.show({ title: '翻页模式' });
    dispatch(setMode(LayoutMode.Horizontal));
  }, [dispatch, toast]);
  const handleMultiple = useCallback(() => {
    toast.show({ title: '双页模式' });
    dispatch(setMode(LayoutMode.Multiple));
  }, [dispatch, toast]);
  const handleModeToggle = useCallback(() => {
    switch (mode) {
      case LayoutMode.Horizontal: {
        handleVertical();
        break;
      }
      case LayoutMode.Vertical: {
        handleMultiple();
        break;
      }
      case LayoutMode.Multiple:
      default: {
        handleHorizontal();
        break;
      }
    }
  }, [handleHorizontal, handleMultiple, handleVertical, mode]);

  return (
    <Fragment>
      <Box
        position="absolute"
        top={0}
        left={0}
        right={0}
        bg={bg}
        borderBottomWidth={1}
        borderColor={palette.border}
        safeAreaTop
        safeAreaLeft
        safeAreaRight
      >
        <Flex position="relative" flexDirection="row" alignItems="center">
          <VectorIcon
            name="arrow-back"
            size="2xl"
            color={color}
            accessibilityLabel="返回漫画详情"
            onPress={onGoBack}
          />
          <Text flexShrink={1} fontSize="md" fontWeight="bold" numberOfLines={1} color={color}>
            {title}
          </Text>
          <VectorIcon
            name="replay"
            size="md"
            color={color}
            accessibilityLabel="重新加载章节"
            onPress={onReload}
          />

          <Box w={0} flexGrow={1} />

          <VectorIcon
            name={
              orientation === Orientation.Portrait
                ? 'stay-primary-portrait'
                : 'stay-primary-landscape'
            }
            size="lg"
            color={color}
            accessibilityLabel="切换屏幕方向"
            onPress={onOrientationToggle}
          />
          <VectorIcon
            name="dots-horizontal"
            size="lg"
            source="materialCommunityIcons"
            color={color}
            accessibilityLabel={isMenuOpen ? '关闭阅读设置' : '打开阅读设置'}
            accessibilityState={{ expanded: isMenuOpen }}
            onPress={onMenuToggle}
          />
        </Flex>

        {isMenuOpen && (
          <HStack borderTopWidth={1} borderColor={palette.border} justifyContent="space-around" py={1}>
            <VectorIcon
              name={layoutIconDict[mode]}
              size="lg"
              source="materialCommunityIcons"
              color={color}
              label="布局"
              accessibilityLabel="切换阅读布局"
              onPress={handleModeToggle}
            />
            {mode !== LayoutMode.Vertical && (
              <VectorIcon
                name={inverted ? 'west' : 'east'}
                size="lg"
                color={color}
                label="方向"
                accessibilityLabel={inverted ? '改为从左向右阅读' : '改为从右向左阅读'}
                onPress={handleDirectionToggle}
              />
            )}
            {mode === LayoutMode.Multiple && (
              <VectorIcon
                name={
                  seat === MultipleSeat.AToB
                    ? 'format-letter-starts-with'
                    : 'format-letter-ends-with'
                }
                size="lg"
                source="materialCommunityIcons"
                color={color}
                label="双页"
                accessibilityLabel="切换双页起始位置"
                onPress={handleSeatToggle}
              />
            )}
            <VectorIcon
              name={pageKeys === PageKeys.Enable ? 'keyboard-outline' : 'keyboard-off-outline'}
              size="lg"
              source="materialCommunityIcons"
              color={color}
              label="实体按键"
              accessibilityLabel={pageKeys === PageKeys.Enable ? '关闭实体键翻页' : '开启实体键翻页'}
              accessibilityState={{ checked: pageKeys === PageKeys.Enable }}
              onPress={handlePageKeysToggle}
            />
            <VectorIcon
              name={timer === Timer.Enable ? 'timer-outline' : 'timer-off-outline'}
              size="lg"
              source="materialCommunityIcons"
              color={color}
              label="定时"
              accessibilityLabel={timer === Timer.Enable ? '关闭定时翻页' : '开启定时翻页'}
              accessibilityHint="长按设置翻页间隔"
              accessibilityState={{ checked: timer === Timer.Enable }}
              onPress={handleTimerToggle}
              onLongPress={onTimerGapOpen}
            />
          </HStack>
        )}
      </Box>

      <Flex
        position="absolute"
        left={0}
        right={0}
        bottom={0}
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
        bg={bg}
        borderTopWidth={1}
        borderColor={palette.border}
        safeAreaX
        safeAreaBottom
      >
        <VectorIcon
          name="skip-previous"
          size="lg"
          color={prev ? color : palette.disabled}
          disabled={!prev}
          accessibilityLabel="上一章"
          accessibilityState={{ disabled: !prev }}
          onPress={onPrevChapter}
        />
        <Pressable
          flex={1}
          mx={2}
          py={2}
          borderWidth={1}
          borderColor={palette.border}
          alignItems="center"
          bg={pageBoxPressed ? palette.selectedBg : 'transparent'}
          {...pageBoxBind}
          onPress={onJumpOpen}
        >
          <Text color={pageBoxPressed ? palette.selectedText : color} fontWeight="bold">
            {current} / {max}
          </Text>
        </Pressable>
        <VectorIcon
          name="skip-next"
          size="lg"
          color={next ? color : palette.disabled}
          disabled={!next}
          accessibilityLabel="下一章"
          accessibilityState={{ disabled: !next }}
          onPress={onNextChapter}
        />
      </Flex>
    </Fragment>
  );
};

export default ReaderToolbar;
