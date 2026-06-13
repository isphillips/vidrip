package com.reaxn

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun getMainComponentName(): String = "Vidrip"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  // "Share to Vidrip": rewrite an incoming ACTION_SEND (shared text/link) into a
  // reaxn://share VIEW intent so it flows through RN's existing Linking pipeline
  // (RootNavigator.handleDeepLink). Done before super so cold-start getInitialURL
  // and warm-start the 'url' event both see it.
  override fun onCreate(savedInstanceState: Bundle?) {
    rewriteShareIntent(intent)
    // Pass null, not savedInstanceState: react-native-screens fragments can't be
    // restored from saved state — on a background-kill/restore (or rotation) the
    // restore path throws "Unable to instantiate fragment ScreenStackFragment".
    // Letting RN rebuild the screen stack from scratch avoids that crash.
    super.onCreate(null)
  }

  override fun onNewIntent(intent: Intent) {
    rewriteShareIntent(intent)
    super.onNewIntent(intent)
  }

  private fun rewriteShareIntent(intent: Intent?) {
    if (intent?.action == Intent.ACTION_SEND && intent.type == "text/plain") {
      val text = intent.getStringExtra(Intent.EXTRA_TEXT)
      if (!text.isNullOrBlank()) {
        intent.action = Intent.ACTION_VIEW
        intent.data = Uri.parse("reaxn://share?text=" + Uri.encode(text))
        setIntent(intent)
      }
    }
  }

  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    ReaxnScreenRecorderModule.onActivityResult(requestCode, resultCode, data)
  }
}
