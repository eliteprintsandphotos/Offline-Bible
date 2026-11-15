package com.offlinebible.reader;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Shows the bundled offline reader (assets/index.html) full screen.
 * Everything is loaded from the APK; the app needs no network permission.
 */
public class MainActivity extends Activity {
    private static final String START_PAGE = "file:///android_asset/index.html";
    private static final int BAR_LIGHT = Color.parseColor("#f3eee5");
    private static final int BAR_DARK = Color.parseColor("#1f1c16");

    private WebView webView;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        boolean dark = (getResources().getConfiguration().uiMode
                & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        applyBarColor(dark);

        webView = new WebView(this);
        webView.setBackgroundColor(dark ? Color.parseColor("#17150f") : Color.parseColor("#fbf8f2"));
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);      // remembers place, text size, theme
        s.setAllowFileAccess(true);        // assets are served from file:///android_asset
        s.setAllowContentAccess(false);
        s.setBuiltInZoomControls(false);
        s.setSupportZoom(false);

        webView.addJavascriptInterface(new Bridge(), "AndroidApp");
        webView.setWebViewClient(new WebViewClient() {
            // The (WebView, String) form works on every version: newer Android's
            // request-based overload delegates to it by default.
            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return openExternally(Uri.parse(url));
            }
        });

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(START_PAGE + "?theme=" + (dark ? "dark" : "light"));
        }
    }

    /** Keep in-app pages in the WebView; hand anything else (e.g. web links) to the system. */
    private boolean openExternally(Uri uri) {
        if ("file".equals(uri.getScheme())) return false;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception ignored) {
            // No app can open it; just stay put.
        }
        return true;
    }

    private void applyBarColor(boolean dark) {
        Window w = getWindow();
        int color = dark ? BAR_DARK : BAR_LIGHT;
        w.setStatusBarColor(color);
        w.setNavigationBarColor(color);
        if (Build.VERSION.SDK_INT >= 23) {
            View decor = w.getDecorView();
            int flags = decor.getSystemUiVisibility();
            if (dark) flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            else flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            decor.setSystemUiVisibility(flags);
        }
    }

    /** Called from reader/app.js when the reader's theme changes. */
    private class Bridge {
        @JavascriptInterface
        public void setTheme(final String theme) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    applyBarColor("dark".equals(theme));
                }
            });
        }
    }

    @Override
    public void onBackPressed() {
        // Back steps through chapters/searches you visited, then leaves the app.
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
