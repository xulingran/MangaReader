import { useRef } from 'react';
import { useDebouncedSafeAreaFrame } from './useDebouncedSafeAreaFrame';
import { useDebouncedSafeAreaInsets } from './useDebouncedSafeAreaInsets';

/**
 * 阅读器专用：挂载时冻结 safe area frame / insets。
 * 呼出菜单会显示状态栏，frame 与 insets 随之变化；若响应这个变化，
 * Reader/Controller/ComicImage 会整体重布局，表现为漫画页面"缩小"，
 * 低端设备开销大。阅读器尺寸只需随屏幕方向变化，而方向变化会触发
 * Reader remount（Chapter 中 key={orientation}），冻结值随之刷新，
 * 因此在挂载时冻结即可。
 */
export const useStaticSafeAreaFrame = () => {
  const frame = useDebouncedSafeAreaFrame();
  return useRef(frame).current;
};

export const useStaticSafeAreaInsets = () => {
  const insets = useDebouncedSafeAreaInsets();
  return useRef(insets).current;
};
