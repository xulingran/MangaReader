package com.mangareader

import android.os.Bundle
import android.view.KeyEvent
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.mangareader.eink.EInkKeyModule
import com.swmansion.rnscreens.fragment.restoration.RNScreensFragmentFactory
import com.zoontek.rnbootsplash.RNBootSplash

class MainActivity : ReactActivity() {

  override fun getMainComponentName(): String = "MangaReader"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onCreate(savedInstanceState: Bundle?) {
    supportFragmentManager.fragmentFactory = RNScreensFragmentFactory()
    RNBootSplash.init(this)
    super.onCreate(savedInstanceState)
  }

  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    // 阅读页激活时拦截实体翻页键（音量键/翻页键/方向键）
    if (EInkKeyModule.handleKeyEvent(event)) {
      return true
    }
    return super.dispatchKeyEvent(event)
  }
}
