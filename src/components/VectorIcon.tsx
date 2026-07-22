import React from 'react';
import { Icon, IconButton, IIconButtonProps } from 'native-base';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Octicons from 'react-native-vector-icons/Octicons';
import Ionicons from 'react-native-vector-icons/Ionicons';

export const sourceMap = {
  materialIcons: MaterialIcons,
  materialCommunityIcons: MaterialCommunityIcons,
  octicons: Octicons,
  ionicons: Ionicons,
};

export interface VectorIconProps extends IIconButtonProps {
  source?: keyof typeof sourceMap;
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
  color = 'black',
  onPress,
  shadow,
  source = 'materialIcons',
  isDisabled,
  disabled,
  accessibilityLabel,
  accessibilityState,
  ...props
}: VectorIconProps) => {
  const disabledState = Boolean(isDisabled || disabled);
  return (
    <IconButton
      p={2}
      opacity={disabledState ? 0.5 : 1}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || accessibilityLabels[name] || `执行 ${name}`}
      accessibilityState={{ ...accessibilityState, disabled: disabledState }}
      icon={<Icon shadow={shadow} as={sourceMap[source]} name={name} size={size} color={color} />}
      onPress={onPress}
      isDisabled={disabledState}
      disabled={disabledState}
      {...props}
    />
  );
};

export default VectorIcon;
