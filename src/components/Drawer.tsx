import React, { useImperativeHandle, ReactNode, Ref, Fragment, useState } from 'react';
import { Box, Pressable } from 'native-base';
import { useDebouncedSafeAreaFrame, useDebouncedSafeAreaInsets } from '~/hooks';
import { useThemePalette } from '~/utils/theme/hooks';

export interface DrawerRef {
  open: () => void;
  close: () => void;
}
interface DrawerProps {
  ref?: Ref<DrawerRef>;
  /** 面板内容宽度（不含右侧安全区） */
  contentWidth?: number;
  children?: ReactNode;
}

/**
 * 电子墨水版静态抽屉：无滑入动画、无透明遮罩
 * 右侧固定宽度高对比面板，条件渲染瞬时开合
 */
const Drawer = ({ ref, contentWidth = 300, children }: DrawerProps) => {
  const { width: windowWidth, height: windowHeight } = useDebouncedSafeAreaFrame();
  const { right } = useDebouncedSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const palette = useThemePalette();

  const panelWidth = Math.min(windowWidth * 0.55, contentWidth + right);

  useImperativeHandle(ref, () => ({
    open: () => setVisible(true),
    close: () => setVisible(false),
  }));

  if (!visible) {
    return null;
  }

  return (
    <Fragment>
      {/* 外部区域：点击关闭（无视觉遮罩） */}
      <Pressable
        position="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
        onPress={() => setVisible(false)}
        accessibilityLabel="关闭任务抽屉"
      />
      <Box
        position="absolute"
        right={0}
        top={0}
        width={panelWidth}
        height={windowHeight}
        bg={palette.bg}
        borderLeftWidth={1}
        borderColor={palette.border}
      >
        {children}
      </Box>
    </Fragment>
  );
};

export default Drawer;
