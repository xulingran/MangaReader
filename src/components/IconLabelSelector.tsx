import React from 'react';
import { HStack, Icon, Pressable, Text, VStack } from 'native-base';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { IconLabel } from '~/utils/enum';
import { usePressedState, useThemePalette } from '~/utils/theme/hooks';

interface IconLabelSelectorProps {
  value: IconLabel;
  onChange: (value: IconLabel) => void;
}

const options = [
  { label: '显示', value: IconLabel.Enable },
  { label: '隐藏', value: IconLabel.Disabled },
] as const;

interface IconLabelOptionProps {
  label: string;
  selected: boolean;
  onSelect: () => void;
}

/** 单个选项：按压瞬时反色（已选中项回落正色），无动画；与 ThemeModeSelector 同款 */
const IconLabelOption = ({ label, selected, onSelect }: IconLabelOptionProps) => {
  const palette = useThemePalette();
  const [pressed, bind] = usePressedState();
  const inverted = selected !== pressed;
  const foreground = inverted ? palette.selectedText : palette.text;
  return (
    <Pressable
      flex={1}
      px={2}
      py={3}
      bg={inverted ? palette.selectedBg : palette.bg}
      borderWidth={1}
      borderColor={palette.border}
      {...bind}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onSelect}
    >
      <HStack alignItems="center" justifyContent="center" space={1}>
        <Icon
          as={MaterialIcons}
          name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
          size="sm"
          color={foreground}
        />
        <Text color={foreground} fontSize="md" fontWeight="bold">
          {label}
        </Text>
      </HStack>
    </Pressable>
  );
};

const IconLabelSelector = ({ value, onChange }: IconLabelSelectorProps) => {
  const palette = useThemePalette();

  return (
    <VStack space={2} accessibilityRole="radiogroup" accessibilityLabel="图标说明文字">
      <Text color={palette.text} fontSize="md" fontWeight="bold">
        图标说明文字
      </Text>
      <HStack space={2}>
        {options.map((option) => (
          <IconLabelOption
            key={option.value}
            label={option.label}
            selected={value === option.value}
            onSelect={() => onChange(option.value)}
          />
        ))}
      </HStack>
    </VStack>
  );
};

export default IconLabelSelector;
