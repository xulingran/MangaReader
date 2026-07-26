import React, { memo, useMemo } from 'react';
import { Icon, IconButton, IIconButtonProps, Text, VStack } from 'native-base';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Octicons from 'react-native-vector-icons/Octicons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { usePressedState, useThemePalette } from '~/utils/theme/hooks';
import { IconLabel } from '~/utils/enum';
import { useAppSelector } from '~/redux';

export const sourceMap = {
  materialIcons: MaterialIcons,
  materialCommunityIcons: MaterialCommunityIcons,
  octicons: Octicons,
  ionicons: Ionicons,
};

export interface VectorIconProps extends IIconButtonProps {
  source?: keyof typeof sourceMap;
  /** 图标下方的简短说明文字（设置开启时显示），缺省回退 accessibilityLabel */
  label?: string;
}

const accessibilityLabels: Record<string, string> = {
  'arrow-back': '返回',
  replay: '重新加载',
  close: '关闭',
  check: '确认',
  restore: '恢复默认值',
  'chevron-up': '上移',
  'chevron-down': '下移',
  home: '主页',
  search: '搜索',
  settings: '设置',
  autorenew: '更新收藏',
  'delete-forever': '删除',
  'open-in-browser': '在浏览器中打开',
  'skip-previous': '上一章',
  'skip-next': '下一章',
};

const VectorIcon = ({
  name = 'check',
  size = 'xl',
  color,
  onPress,
  source = 'materialIcons',
  isDisabled,
  disabled,
  accessibilityLabel,
  accessibilityState,
  label,
  ...props
}: VectorIconProps) => {
  const disabledState = Boolean(isDisabled || disabled);
  const palette = useThemePalette();
  const [pressed, bind] = usePressedState();
  const showLabel = useAppSelector((state) => state.setting.iconLabel) === IconLabel.Enable;
  const iconColor = disabledState
    ? palette.disabled
    : pressed
    ? palette.selectedText
    : color || palette.text;
  // 说明文字在按压反色区块（IconButton 圆形底色）之外，不跟随 pressed 反色，避免白底白字
  const labelColor = disabledState ? palette.disabled : color || palette.text;
  // 合并后的 a11y state 与 icon 元素都做 memo：父组件传入内联 accessibilityState 对象时
  // 引用每次都变，但内容相同；这里按字段依赖重建，避免无谓的 IconButton 重渲染。
  const mergedA11yState = useMemo(
    () => ({ ...accessibilityState, disabled: disabledState }),
    [accessibilityState, disabledState]
  );
  const icon = useMemo(
    () => <Icon as={sourceMap[source]} name={name} size={size} color={iconColor} />,
    [source, name, size, iconColor]
  );
  const button = (
    <IconButton
      p={2}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || accessibilityLabels[name] || `执行 ${name}`}
      accessibilityState={mergedA11yState}
      bg={pressed ? palette.selectedBg : 'transparent'}
      _pressed={{ bg: palette.selectedBg }}
      _disabled={{ opacity: 1, bg: 'transparent' }}
      icon={icon}
      onPress={onPress}
      {...bind}
      isDisabled={disabledState}
      {...props}
    />
  );
  if (!showLabel) {
    return button;
  }
  return (
    <VStack alignItems="center" space={0}>
      {button}
      <Text fontSize="xs" lineHeight={14} numberOfLines={1} color={labelColor}>
        {label || accessibilityLabel || accessibilityLabels[name] || name}
      </Text>
    </VStack>
  );
};

// 自定义比较：抵御调用方传入内联对象（accessibilityState/style/hitSlop 等）造成的 memo 穿透。
// 全 App 最高频组件，必须稳定。设计分两层：
// 1) KNOWN_PROPS 白名单显式比较核心 prop —— 便于快速短路，且 accessibilityState 这类
//    调用方常内联的对象用 shallowEqualRecord 按值比较；
// 2) 其余 prop（onLongPress / hitSlop / style / ... 任意 IconButton 透传项）走通用兜底：
//    引用相等优先，不等再用 shallowEqualRecord 浅比较，覆盖未来新增的对象 prop。
function areVectorIconPropsEqual(prev: VectorIconProps, next: VectorIconProps) {
  if (prev.name !== next.name) return false;
  if (prev.source !== next.source) return false;
  if (prev.size !== next.size) return false;
  if (prev.color !== next.color) return false;
  if (prev.onPress !== next.onPress) return false;
  if (prev.isDisabled !== next.isDisabled) return false;
  if (prev.disabled !== next.disabled) return false;
  if (prev.accessibilityLabel !== next.accessibilityLabel) return false;
  if (prev.accessibilityHint !== next.accessibilityHint) return false;
  if (prev.label !== next.label) return false;
  if (!shallowEqualRecord(prev.accessibilityState, next.accessibilityState)) return false;
  // 通用兜底：VectorIconProps 无字符串索引签名，用 cast 访问其余任意透传 prop。
  const prevRest = prev as unknown as Record<string, unknown>;
  const nextRest = next as unknown as Record<string, unknown>;
  const prevKeys = Object.keys(prevRest).filter((k) => !KNOWN_PROPS.has(k));
  const nextKeys = Object.keys(nextRest).filter((k) => !KNOWN_PROPS.has(k));
  if (prevKeys.length !== nextKeys.length) return false;
  for (const key of prevKeys) {
    if (prevRest[key] !== nextRest[key]) {
      if (!shallowEqualRecord(prevRest[key], nextRest[key])) return false;
    }
  }
  return true;
}

const KNOWN_PROPS = new Set([
  'name',
  'source',
  'size',
  'color',
  'onPress',
  'isDisabled',
  'disabled',
  'accessibilityLabel',
  'accessibilityHint',
  'accessibilityState',
  'label',
]);

function shallowEqualRecord(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (aObj[key] !== bObj[key]) return false;
  }
  return true;
}

export default memo(VectorIcon, areVectorIconPropsEqual);
