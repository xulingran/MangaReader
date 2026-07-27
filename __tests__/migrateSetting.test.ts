/**
 * 旧设置 / 旧备份迁移回归测试（电子墨水版）
 * light、animated 被剔除，hearing 映射为 pageKeys，缺少主题时跟随系统
 */
import { migrateSetting, validate, validateSampled, IconLabel, LayoutMode, ThemeMode } from '~/utils';
import { initialState } from '~/redux/slice';
import { it, expect, describe } from '@jest/globals';

import settingSchema from '~/schema/setting.json';
import rootSchema from '~/schema/root.json';

/** 0.7.x 旧版本设置结构 */
const legacySetting = {
  mode: LayoutMode.Vertical,
  light: 'On',
  direction: 'right',
  seat: 0,
  sequence: 'Desc',
  hearing: 0,
  timer: 0,
  timerGap: 3000,
  animated: 0,
  androidDownloadPath: '/sdcard/DCIM/old',
};

describe('migrateSetting', () => {
  it('剔除 light / animated，hearing 映射为 pageKeys', () => {
    const result = migrateSetting(JSON.parse(JSON.stringify(legacySetting)));

    expect('light' in result).toBe(false);
    expect('animated' in result).toBe(false);
    expect('hearing' in result).toBe(false);
    expect(result.pageKeys).toBe(0);
    expect(result.themeMode).toBe(ThemeMode.System);
  });

  it('首次升级（检测到旧字段）强制横向单页', () => {
    const result = migrateSetting(JSON.parse(JSON.stringify(legacySetting)));
    expect(result.mode).toBe(LayoutMode.Horizontal);
  });

  it('hearing=Disabled 正确映射为 pageKeys=Disabled', () => {
    const result = migrateSetting({ ...legacySetting, hearing: 1 });
    expect(result.pageKeys).toBe(1);
  });

  it('收藏以外的设置保持不变（下载路径、定时翻页）', () => {
    const result = migrateSetting(JSON.parse(JSON.stringify(legacySetting)));
    expect(result.androidDownloadPath).toBe('/sdcard/DCIM/old');
    expect(result.timer).toBe(0);
    expect(result.timerGap).toBe(3000);
  });

  it('新版设置（无旧字段）原样保留，不强制模式', () => {
    const newSetting = JSON.parse(JSON.stringify(initialState.setting));
    newSetting.mode = LayoutMode.Multiple;
    const result = migrateSetting(newSetting);
    expect(result.mode).toBe(LayoutMode.Multiple);
    expect(result.pageKeys).toBe(initialState.setting.pageKeys);
  });

  it('已是新结构的设置原样返回同一引用（供启动路径引用比较）', () => {
    const newSetting = JSON.parse(JSON.stringify(initialState.setting));
    expect(migrateSetting(newSetting)).toBe(newSetting);
  });

  it('保留新版显式主题偏好', () => {
    const setting = { ...initialState.setting, themeMode: ThemeMode.Dark };
    expect(migrateSetting(setting).themeMode).toBe(ThemeMode.Dark);
  });

  it('当前电子墨水版设置缺少主题字段时默认跟随系统', () => {
    const settingWithoutTheme = { ...initialState.setting } as Partial<RootState['setting']>;
    delete settingWithoutTheme.themeMode;
    const result = migrateSetting(settingWithoutTheme);
    expect(result.themeMode).toBe(ThemeMode.System);
  });

  it('缺少 iconLabel 字段时默认关闭图标说明文字', () => {
    const settingWithoutIconLabel = { ...initialState.setting } as Partial<RootState['setting']>;
    delete settingWithoutIconLabel.iconLabel;
    const result = migrateSetting(settingWithoutIconLabel);
    expect(result.iconLabel).toBe(IconLabel.Disabled);
    expect(validate(result, settingSchema, initialState.setting)).toBe(true);
  });

  it('已有 iconLabel 偏好迁移后保留', () => {
    const setting = { ...initialState.setting, iconLabel: IconLabel.Enable };
    expect(migrateSetting(setting).iconLabel).toBe(IconLabel.Enable);
  });

  it('非对象输入原样返回', () => {
    expect(migrateSetting(undefined as any)).toBe(undefined);
    expect(migrateSetting(null as any)).toBe(null);
  });

  it('迁移后的旧设置通过新版 setting schema 校验', () => {
    const result = migrateSetting(JSON.parse(JSON.stringify(legacySetting)));
    expect(validate(result, settingSchema, initialState.setting)).toBe(true);
  });

  it('缺字段的旧设置由 initialState 补齐并通过校验', () => {
    const partial = { light: 'Off', hearing: 1 }; // 仅有旧字段
    const result = migrateSetting(partial);
    expect(validate(result, settingSchema, initialState.setting)).toBe(true);
    expect(result.pageKeys).toBe(1);
    expect(result.mode).toBe(LayoutMode.Horizontal);
    expect(result.themeMode).toBe(ThemeMode.System);
  });

  it('旧备份（root 结构）迁移后通过 root schema 校验', () => {
    const backup = JSON.parse(JSON.stringify(initialState));
    backup.release = {
      loadStatus: 0,
      name: 'mangareader',
      version: 'v0.7.10',
      publishTime: '2025-07-19',
    };
    backup.setting = JSON.parse(JSON.stringify(legacySetting));

    backup.setting = migrateSetting(backup.setting);
    expect(validate(backup, rootSchema, initialState)).toBe(true);
  });
});

describe('validate 采样校验', () => {
  // 模拟一个值类型为对象的 schema：用于验证 sampleKeys 参数让大字典只抽样校验
  const objectDictSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    additionalProperties: {
      type: 'object',
      properties: { total: { type: 'number' }, progress: { type: 'number' } },
      required: ['total', 'progress'],
    },
  } as any;

  it('不传 sampleKeys 时全量校验，脏数据返回 false', () => {
    const data: Record<string, any> = {};
    for (let i = 0; i < 20; i++) {
      // 第 15 条缺少 required 字段
      data[`k${i}`] = i === 15 ? { total: 1 } : { total: i, progress: i };
    }
    expect(validate(data, objectDictSchema)).toBe(false);
  });

  it('传 sampleKeys 时只抽样前 N 条，脏数据若不在样本内则通过', () => {
    const data: Record<string, any> = {};
    for (let i = 0; i < 20; i++) {
      data[`k${i}`] = i === 15 ? { total: 1 } : { total: i, progress: i };
    }
    // 采样前 8 条（k0..k7），脏数据在 k15 不在样本内 → 校验通过
    expect(validate(data, objectDictSchema, undefined, 0, 8)).toBe(true);
  });

  it('脏数据落在样本内时采样校验仍能发现', () => {
    const data: Record<string, any> = {};
    for (let i = 0; i < 20; i++) {
      // 第 3 条脏数据，在采样前 8 条范围内
      data[`k${i}`] = i === 3 ? { total: 1 } : { total: i, progress: i };
    }
    expect(validate(data, objectDictSchema, undefined, 0, 8)).toBe(false);
  });

  it('数组类型也支持采样', () => {
    const arraySchema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'array',
      items: { type: 'number' },
    } as any;
    const data = [1, 2, 3, 'bad', 5, 6, 7, 8, 9, 10];
    // 全量校验会发现第 4 项是字符串
    expect(validate(data, arraySchema)).toBe(false);
    // 采样前 3 项（不含脏数据）→ 通过
    expect(validate(data, arraySchema, undefined, 0, 3)).toBe(true);
  });

  it('数据量小于 sampleKeys 时退化为全量校验', () => {
    const data = { a: { total: 1, progress: 1 }, b: { total: 2 } }; // b 缺 progress
    expect(validate(data, objectDictSchema, undefined, 0, 8)).toBe(false);
  });

  it('validateSampled 包装等价于 validate 的采样调用', () => {
    const data: Record<string, any> = {};
    for (let i = 0; i < 20; i++) {
      data[`k${i}`] = i === 15 ? { total: 1 } : { total: i, progress: i };
    }
    // 包装函数与位置参数写法语义一致：采样前 8 条，脏数据在 k15 不在样本内 → 通过
    expect(validateSampled(data, 8, objectDictSchema)).toBe(
      validate(data, objectDictSchema, undefined, 0, 8)
    );
    // 脏数据在样本内时两者都发现
    const dirty: Record<string, any> = {};
    for (let i = 0; i < 20; i++) {
      dirty[`k${i}`] = i === 3 ? { total: 1 } : { total: i, progress: i };
    }
    expect(validateSampled(dirty, 8, objectDictSchema)).toBe(false);
  });
});
