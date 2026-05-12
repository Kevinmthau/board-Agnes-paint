# Paint Board Agent Guide

## Scope

These instructions apply to this generated Board Web SDK game project.

## Project Identity

- Android package/application id: `co.harrishill.paintboard`
- Android display label: `Paint Board`
- Board app id: `paint-board`
- APK output path: `Builds/Android/paint-board-debug.apk`
- Current model path: `android/app/src/main/assets/model.tflite`
- WebView asset origin: `https://appassets.androidplatform.net/assets/web/index.html`

Android install identity is the package/application id, not the display label.

## Workflow

1. Keep game code in `web/` TypeScript/ESM-compatible unless the user asks for another stack.
2. Import Board APIs from `@harrishill/board-sdk`.
3. Do not edit the SDK repo's `sample/` harness into this game. This project already has its own Android wrapper and app identity.
4. Preserve `web/vite.config.ts` `base: "./"` so Android asset loading keeps working.
5. Preserve the Android wrapper setup order: initialize `BoardNativePlugin` context and app id, load `model.tflite`, activate `RawDataGlyphDetector`, then create/register the WebView bridge and touch channel.

## Board Input Rules

- Always guard Board APIs with `Board.isOnDevice`; bridge-backed APIs throw in a normal browser.
- Keep `Board.isOnDevice` truthful. Simulate browser gameplay input in app code, not by creating fake bridge globals.
- Treat `Board.input.subscribe(...)` as a live frame stream. Stationary pieces keep reporting until `Ended`.
- Track physical piece instances by `contactId`, never by `glyphId`.
- Treat `glyphId` as the detected piece/type id only.
- Filter `BoardContactType.Glyph` when handling physical pieces.
- Use `Board.bridgeVersion ?? 0` to gate newer host-bridge features.

## Build And Device Loop

```bash
./scripts/build_android.sh
bdb status
./scripts/build_android.sh --install --launch
```

Use `adb install Builds/Android/paint-board-debug.apk` as a fallback when `bdb` is unavailable.
