import React, { FC, memo, ReactNode, useEffect } from 'react';
import { ScrollView, Icon, Pressable, HStack, Text } from 'native-base';
import { sourceMap } from './VectorIcon';
import { Keyboard } from 'react-native';
import Overlay from './Overlay';
import { usePressedState, useThemePalette } from '~/utils/theme/hooks';

export interface ActionsheetSelectProps {
  isOpen?: boolean;
  options: {
    label: string;
    value: string;
    disabled?: boolean;
    icon?: { source: keyof typeof sourceMap; name: string };
  }[];
  onClose?: () => void;
  onChange?: (value: string) => void;
  headerComponent?: ReactNode;
}

type Option = ActionsheetSelectProps['options'][number];

/** 单个选项行：按压瞬时反色，无动画；禁用项不反色 */
const OptionRow = ({ item, onPress }: { item: Option; onPress: () => void }) => {
  const palette = useThemePalette();
  const [pressed, bind] = usePressedState();
  const inverted = pressed && !item.disabled;
  const foreground = item.disabled
    ? palette.disabled
    : inverted
    ? palette.selectedText
    : palette.text;
  return (
    <Pressable
      isDisabled={item.disabled}
      _disabled={{ opacity: 1 }}
      {...bind}
      bg={inverted ? palette.selectedBg : 'transparent'}
      borderBottomWidth={1}
      borderColor={palette.border}
      onPress={onPress}
    >
      <HStack px={4} py={3} alignItems="center" space={3}>
        {item.icon && (
          <Icon
            as={sourceMap[item.icon.source]}
            size="md"
            name={item.icon.name}
            color={foreground}
          />
        )}
        <Text fontSize="md" color={foreground}>
          {item.label}
        </Text>
      </HStack>
    </Pressable>
  );
};

/** 电子墨水版：Actionsheet 滑出面板改为无动画静态覆盖层 */
const ActionsheetSelect: FC<ActionsheetSelectProps> = ({
  options,
  isOpen,
  onClose,
  onChange,
  headerComponent,
}) => {
  useEffect(() => {
    isOpen && Keyboard.dismiss();
  }, [isOpen]);

  const handleClose = () => {
    onClose?.();
  };
  const handleChange = (value: string) => {
    return () => {
      onChange?.(value);
      handleClose();
    };
  };

  return (
    <Overlay isOpen={isOpen} onClose={handleClose}>
      {headerComponent}
      <ScrollView w="full">
        {options.map((item) => (
          <OptionRow key={item.value} item={item} onPress={handleChange(item.value)} />
        ))}
      </ScrollView>
    </Overlay>
  );
};

export default memo(ActionsheetSelect);
