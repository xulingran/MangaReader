import React from 'react';
import { HStack, Icon, Pressable, Text, VStack } from 'native-base';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { ThemeMode } from '~/utils/enum';
import { ResolvedThemeMode } from '~/utils/theme/tokens';
import { useThemePalette } from '~/utils/theme/hooks';

interface ThemeModeSelectorProps {
  value: ThemeMode;
  resolvedMode: ResolvedThemeMode;
  onChange: (mode: ThemeMode) => void;
}

const options = [
  { label: '亮色', value: ThemeMode.Light },
  { label: '深色', value: ThemeMode.Dark },
  { label: '跟随系统', value: ThemeMode.System },
] as const;

const ThemeModeSelector = ({ value, resolvedMode, onChange }: ThemeModeSelectorProps) => {
  const palette = useThemePalette();

  return (
    <VStack space={2} accessibilityRole="radiogroup" accessibilityLabel="外观模式">
      <Text color={palette.text} fontSize="md" fontWeight="bold">
        外观模式
      </Text>
      {options.map((option) => {
        const selected = value === option.value;
        const foreground = selected ? palette.selectedText : palette.text;
        const label =
          option.value === ThemeMode.System
            ? `${option.label}（当前${resolvedMode === ThemeMode.Dark ? '深色' : '亮色'}）`
            : option.label;
        return (
          <Pressable
            key={option.value}
            px={4}
            py={3}
            bg={selected ? palette.selectedBg : palette.bg}
            borderWidth={1}
            borderColor={palette.border}
            _pressed={{ bg: selected ? palette.selectedBg : palette.pressedBg }}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(option.value)}
          >
            <HStack alignItems="center" space={3}>
              <Icon
                as={MaterialIcons}
                name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
                size="md"
                color={foreground}
              />
              <Text color={foreground} fontSize="md" fontWeight="bold">
                {label}
              </Text>
            </HStack>
          </Pressable>
        );
      })}
    </VStack>
  );
};

export default ThemeModeSelector;
