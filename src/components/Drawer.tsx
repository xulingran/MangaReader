import React, {
  forwardRef,
  useImperativeHandle,
  ReactNode,
  ForwardRefRenderFunction,
  Fragment,
  useMemo,
  useState,
} from 'react';
import { Box, Pressable, Text } from 'native-base';
import { useDebouncedSafeAreaFrame, useDebouncedSafeAreaInsets } from '~/hooks';

export const DRAWER_TRIGGER_WIDTH = 32;

export interface DrawerRef {
  open: () => void;
  close: () => void;
}
interface DrawerProps {
  leak?: number;
  content?: number;
  triggerLabel?: string;
  children?: ReactNode;
}

/**
 * 电子墨水版静态抽屉：无滑入动画、无透明遮罩
 * 右侧固定宽度白底黑边面板，条件渲染瞬时开合
 */
const Drawer: ForwardRefRenderFunction<DrawerRef, DrawerProps> = (
  { leak = DRAWER_TRIGGER_WIDTH, content = 300, triggerLabel = '打开', children },
  ref
) => {
  const { width: windowWidth, height: windowHeight } = useDebouncedSafeAreaFrame();
  const { right } = useDebouncedSafeAreaInsets();
  const [visible, setVisible] = useState(false);

  const leakWidth = useMemo(() => leak + right, [leak, right]);
  const contentWidth = useMemo(() => content + right, [content, right]);
  const panelWidth = Math.min(windowWidth * 0.55, contentWidth);

  useImperativeHandle(ref, () => ({
    open: () => setVisible(true),
    close: () => setVisible(false),
  }));

  if (!visible) {
    // 收起时仅保留右缘小把手，点击展开
    return (
      <Pressable
        position="absolute"
        right={0}
        top={0}
        width={leakWidth}
        height={windowHeight}
        bg="white"
        borderLeftWidth={1}
        borderColor="black"
        alignItems="center"
        justifyContent="center"
        onPress={() => setVisible(true)}
        accessibilityLabel={`打开${triggerLabel}`}
      >
        <Text color="black" fontSize="xs" fontWeight="bold" lineHeight={18} textAlign="center">
          {`‹\n${triggerLabel.slice(0, 2)}\n${triggerLabel.slice(2)}`}
        </Text>
      </Pressable>
    );
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
        bg="white"
        borderLeftWidth={1}
        borderColor="black"
      >
        {children}
      </Box>
    </Fragment>
  );
};

export default forwardRef(Drawer);
