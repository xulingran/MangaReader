import { useRef } from 'react';
import { useSafeAreaFrame, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Orientation } from '~/utils';

/**
 * 阅读器专用：挂载时冻结 safe area frame / insets（orientation 派生自冻结
 * frame，与 useDebouncedSafeAreaFrame 的返回结构保持一致）。
 * 呼出菜单会显示状态栏，frame 与 insets 随之变化；若响应这个变化，
 * Reader/Controller/ComicImage 会整体重布局，表现为漫画页面"缩小"，
 * 低端设备开销大。阅读器尺寸只需随屏幕方向变化，而方向变化会立即触发
 * Reader remount（Chapter 中 key={orientation} 取实时方向），冻结值随
 * 重挂刷新，因此在挂载时冻结即可。
 * 注意冻结源必须是不防抖的实时值：remount 由实时方向翻转触发，若此处
 * 仍取防抖 frame，重挂瞬间防抖值尚未更新，会把旧方向尺寸再次冻结。
 */
export const useStaticSafeAreaFrame = () => {
  const frame = useSafeAreaFrame();
  return useRef({
    ...frame,
    orientation: frame.width > frame.height ? Orientation.Landscape : Orientation.Portrait,
  }).current;
};

export const useStaticSafeAreaInsets = () => {
  const insets = useSafeAreaInsets();
  return useRef(insets).current;
};
