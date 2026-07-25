import React, { FC, memo, useMemo, useState } from 'react';
import { Button, HStack, useDisclose } from 'native-base';
import { Plugin, PluginMap } from '~/plugins';
import ActionsheetSelect from './ActionsheetSelect';
import { useThemePalette } from '~/utils/theme/hooks';

export interface SearchOptionProps {
  source: Plugin;
  filter: Record<string, string>;
  type: 'discovery' | 'search';
  onChange: (name: string, value: string) => void;
}

/** 发现页/搜索页共用的筛选项栏：点击按钮弹出静态选择层，选中后由 onChange 上报 */
const SearchOption: FC<SearchOptionProps> = ({ source, filter, type, onChange }) => {
  const { isOpen, onOpen, onClose } = useDisclose();
  const [key, setKey] = useState<string>('');
  const [options, setOptions] = useState<OptionItem[]>([]);
  const palette = useThemePalette();

  const searchOptions = useMemo(() => {
    return (PluginMap.get(source)?.option[type] || []).map((item) => {
      const value = filter[item.name] || item.defaultValue;
      const label = item.options.find((option) => option.value === value)?.label || '';
      return {
        ...item,
        value,
        label,
      };
    });
  }, [source, filter, type]);

  const handlePress = (name: string, newOptions: OptionItem[]) => {
    return () => {
      setKey(name);
      setOptions(newOptions);
      onOpen();
    };
  };
  const handleChange = (newVal: string) => {
    onChange(key, newVal);
  };

  if (searchOptions.length <= 0) {
    return null;
  }

  return (
    <HStack
      safeAreaX
      px={2}
      pb={2}
      bg={palette.bg}
      borderBottomWidth={1}
      borderColor={palette.border}
    >
      {searchOptions.map((item) => {
        return (
          <Button
            key={item.name}
            variant="ghost"
            _text={{ color: palette.text, fontWeight: 'bold' }}
            onPress={handlePress(item.name, item.options)}
          >
            {item.label}
          </Button>
        );
      })}

      <ActionsheetSelect
        isOpen={isOpen}
        onClose={onClose}
        options={options}
        onChange={handleChange}
      />
    </HStack>
  );
};

export default memo(SearchOption);
