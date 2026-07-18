import React, { FC, memo, ReactNode, useEffect } from 'react';
import { ScrollView, Icon, Pressable, HStack, Text } from 'native-base';
import { sourceMap } from './VectorIcon';
import { Keyboard } from 'react-native';
import Overlay from './Overlay';

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
    onClose && onClose();
  };
  const handleChange = (value: string) => {
    return () => {
      onChange && onChange(value);
      handleClose();
    };
  };

  return (
    <Overlay isOpen={isOpen} onClose={handleClose}>
      {headerComponent}
      <ScrollView w="full">
        {options.map((item) => (
          <Pressable
            key={item.value}
            disabled={item.disabled}
            onPress={handleChange(item.value)}
            borderBottomWidth={1}
            borderColor="gray.200"
            opacity={item.disabled ? 0.4 : 1}
          >
            <HStack px={4} py={3} alignItems="center" space={3}>
              {item.icon && (
                <Icon
                  as={sourceMap[item.icon.source]}
                  size="md"
                  name={item.icon.name}
                  color="black"
                />
              )}
              <Text fontSize="md" color="black">
                {item.label}
              </Text>
            </HStack>
          </Pressable>
        ))}
      </ScrollView>
    </Overlay>
  );
};

export default memo(ActionsheetSelect);
