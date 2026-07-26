/**
 * native-base / theme hooks 的共享测试 mock。
 *
 * jest.mock 的工厂函数不允许引用外部作用域变量（mock 前缀除外），
 * 且工厂是懒执行的，因此各测试文件统一这样使用：
 *
 *   jest.mock('native-base', () =>
 *     require('./helpers/mockNativeBase').createNativeBaseMock({ viewComponents: ['Box'], text: 'react-native' })
 *   );
 *
 * mockPalette 可以直接 import 后在 jest.mock 工厂闭包内引用（mock 前缀 + 懒执行）。
 */

// 直接复用 src/utils/theme/tokens.ts 的亮色色板作为单一真相源：
// 任何 token 调整都会自动反映到测试，避免手写色板漂移导致断言对错颜色。
// getThemePalette 在 jest 环境可直接 import（pressFeedback.test.tsx 已验证可行）。
import { getThemePalette } from '~/utils/theme/tokens';

/** 亮色色板（与生产 tokens 同源），供 useThemePalette mock 返回 */
export const mockPalette = getThemePalette('light');

interface MockNativeBaseOptions {
  /** 映射为 RN View 包装组件（props 原样透传到宿主 View） */
  viewComponents?: string[];
  /** 映射为宿主字符串组件 'NativeBaseComponent'（保留 w/h/variant 等自定义 props） */
  hostComponents?: string[];
  /** Text 的映射方式：'react-native' 用 RN Text，'view' 用 View 包装组件；缺省不透出 Text */
  text?: 'react-native' | 'view';
  /** 追加的静态导出（extendTheme、useDisclose、Toast 等），同名键会覆盖上面的组件映射 */
  extra?: Record<string, unknown>;
}

export const createNativeBaseMock = (options: MockNativeBaseOptions = {}) => {
  const mockReact = require('react');
  const { Text, View } = require('react-native');
  const ViewComponent = (props: object) => mockReact.createElement(View, props);
  const HostComponent = (props: object) => mockReact.createElement('NativeBaseComponent', props);

  const module: Record<string, unknown> = {};
  (options.viewComponents || []).forEach((name) => {
    module[name] = ViewComponent;
  });
  (options.hostComponents || []).forEach((name) => {
    module[name] = HostComponent;
  });
  if (options.text === 'react-native') {
    module.Text = Text;
  }
  if (options.text === 'view') {
    module.Text = ViewComponent;
  }
  return { ...module, ...(options.extra || {}) };
};
