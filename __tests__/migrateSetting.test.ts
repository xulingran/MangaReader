/**
 * 旧设置 / 旧备份迁移回归测试（电子墨水版）
 * light、animated 被剔除，hearing 映射为 pageKeys，缺少主题时跟随系统
 */
import { migrateSetting, validate, LayoutMode, ThemeMode } from '~/utils';
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
