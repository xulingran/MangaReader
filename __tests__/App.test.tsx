/**
 * @format
 */

import 'react-native';
import React from 'react';
import App from '../src/App';

// Note: import explicitly to use the types shiped with jest.
import { it } from '@jest/globals';

// Note: test renderer must be required after react-native.
import renderer, { act } from 'react-test-renderer';

it('renders correctly', async () => {
  let tree: renderer.ReactTestRenderer | undefined;
  await act(async () => {
    tree = renderer.create(<App />);
  });
  // 冒烟测试：至少渲染出根视图，避免「零断言」退化成只验证「没抛异常」
  expect(tree?.root.children.length).toBeGreaterThan(0);
  await act(async () => {
    tree?.unmount();
  });
});
