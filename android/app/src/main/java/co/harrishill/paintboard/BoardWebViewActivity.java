package co.harrishill.paintboard;

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import java.util.Set;

import co.harrishill.board.core.BoardNativePlugin;
import co.harrishill.board.core.WebViewBoardContext;
import co.harrishill.board.touch.detection.RawDataGlyphDetector;
import co.harrishill.board.touch.tracking.TrackerParameters;
import co.harrishill.board.webview.BoardJsBridge;
import co.harrishill.board.webview.BoardTouchChannel;

public class BoardWebViewActivity extends Activity {
    private static final String TAG = "BoardWebTest";
    private static final String APP_ID = "paint-board";
    private static final String ASSET_ORIGIN = "https://appassets.androidplatform.net";

    private WebView webView;
    private BoardTouchChannel touchChannel;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Required order: initialize Board native context/app id before creating
        // the WebView bridge, then load and activate the glyph detector model.
        WebViewBoardContext ctx = new WebViewBoardContext();
        ctx.setActivity(this);
        BoardNativePlugin.setBoardContext(ctx);
        BoardNativePlugin.setAppId(APP_ID);
        BoardNativePlugin.initialize();
        Log.i(TAG, "Board SDK initialized");

        if (RawDataGlyphDetector.loadModel("model.tflite")) {
            Log.i(TAG, "Model loaded, activating touch detection...");
            // Match ArcadeAlt Unity settings
            TrackerParameters params = new TrackerParameters(
                    0.035f,  // positionSmoothing
                    0.004f,  // rotationSmoothing
                    4,       // persistence
                    true     // enableFastTracking
            );
            if (RawDataGlyphDetector.activate(params)) {
                Log.i(TAG, "Touch detection ACTIVE (persistence=4)");
            } else {
                Log.e(TAG, "Failed to activate touch detection");
            }
        } else {
            Log.e(TAG, "Failed to load touch model");
        }

        // Now create the WebView and register the JavaScript bridge/touch channel.
        webView = new WebView(this);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        WebView.setWebContentsDebuggingEnabled(true);
        setContentView(webView);

        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                Log.i(TAG, "Page finished: " + url);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage msg) {
                Log.i("BoardWebJS", msg.sourceId() + ":" + msg.lineNumber() + " " + msg.message());
                return true;
            }
        });

        // Register @JavascriptInterface bridge
        webView.addJavascriptInterface(new BoardJsBridge(webView), "BoardSDK");

        // Register touch push channel
        touchChannel = new BoardTouchChannel();
        Set<String> origins = new java.util.HashSet<>();
        origins.add(ASSET_ORIGIN);
        touchChannel.register(webView, origins);

        Log.i(TAG, "Loading page: " + BuildConfig.WEB_URL);
        webView.loadUrl(ASSET_ORIGIN + BuildConfig.WEB_URL);
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onPause() {
        webView.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (touchChannel != null) {
            touchChannel.destroy();
        }
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
