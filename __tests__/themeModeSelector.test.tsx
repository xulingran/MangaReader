import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { describe, expect, it, jest } from '@jest/globals';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { NativeBaseProvider } from 'native-base';
import ThemeModeSelector from '~/components/ThemeModeSelector';
import { customTheme, ThemeMode } from '~/utils';

const createStore = (themeMode: ThemeMode) =>
  configureStore({
    reducer: () => ({ setting: { themeMode } }) as RootState,
  });

describe('ThemeModeSelector', () => {
  it('暴露三项 radio 语义并派发所选模式', async () => {
    const onChange = jest.fn();
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <Provider store={createStore(ThemeMode.System)}>
          <NativeBaseProvider
            theme={customTheme}
            initialWindowMetrics={{
              frame: { x: 0, y: 0, width: 800, height: 600 },
              insets: { top: 0, left: 0, right: 0, bottom: 0 },
            }}
          >
            <ThemeModeSelector
              value={ThemeMode.System}
              resolvedMode="dark"
              onChange={onChange}
            />
          </NativeBaseProvider>
        </Provider>
      );
    });

    const radios = tree!.root.findAll(
      (node) => node.props.accessibilityRole === 'radio' && typeof node.props.onPress === 'function'
    );
    expect(new Set(radios.map((node) => node.props.accessibilityLabel))).toEqual(
      new Set(['亮色', '深色', '跟随系统'])
    );
    expect(radios.find((node) => node.props.accessibilityLabel === '跟随系统')?.props).toMatchObject(
      { accessibilityState: { checked: true } }
    );

    const hints = tree!.root.findAll((node) => node.props.children === '外观模式（当前深色）');
    expect(hints.length).toBeGreaterThan(0);

    await act(async () => {
      radios.find((node) => node.props.accessibilityLabel === '深色')?.props.onPress();
    });
    expect(onChange).toHaveBeenCalledWith(ThemeMode.Dark);

    await act(async () => {
      tree!.unmount();
    });
  });
});
