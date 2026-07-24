import React from 'react';
import { Pressable, Text } from 'native-base';
import { usePressedState, useThemePalette } from '~/utils/theme/hooks';

export interface ContinueReadingTarget {
  chapterHash: string;
  page: number;
  title: string;
}

interface ContinueReadingButtonProps {
  chapters: ChapterItem[];
  lastWatch?: RootState['dict']['lastWatch'][string];
  onContinue: (target: ContinueReadingTarget) => void;
}

export const getContinueReadingTarget = (
  chapters: ChapterItem[],
  lastWatch?: RootState['dict']['lastWatch'][string]
): ContinueReadingTarget | undefined => {
  if (!lastWatch?.chapter) {
    return undefined;
  }

  const chapter = chapters.find((item) => item.hash === lastWatch.chapter);
  if (!chapter) {
    return undefined;
  }

  const page =
    typeof lastWatch.page === 'number' && Number.isInteger(lastWatch.page) && lastWatch.page > 0
      ? lastWatch.page
      : 1;

  return {
    chapterHash: chapter.hash,
    page,
    title: chapter.title,
  };
};

const ContinueReadingButton = ({
  chapters,
  lastWatch,
  onContinue,
}: ContinueReadingButtonProps) => {
  const target = getContinueReadingTarget(chapters, lastWatch);
  const palette = useThemePalette();
  const [pressed, bind] = usePressedState();

  if (!target) {
    return null;
  }

  return (
    <Pressable
      flexShrink={0}
      px={3}
      py={2}
      bg={pressed ? palette.bg : palette.selectedBg}
      borderWidth={1}
      borderColor={palette.border}
      borderRadius="md"
      {...bind}
      accessibilityRole="button"
      accessibilityLabel={`继续阅读：${target.title}，第 ${target.page} 页`}
      accessibilityHint="打开上次阅读的章节并定位到记录页"
      onPress={() => onContinue(target)}
    >
      <Text color={pressed ? palette.text : palette.selectedText} fontSize={13} fontWeight="bold">
        继续阅读
      </Text>
    </Pressable>
  );
};

export default ContinueReadingButton;
