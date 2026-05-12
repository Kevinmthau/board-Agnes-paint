# Paint Board

Generated Board Web SDK game scaffold.

## Layout

- `web/`: Vite + TypeScript web game source copied from the SDK example.
- `android/`: Android harness project with this game's package identity.
- `vendor/`: Local Board Web SDK npm tarball used by `web/package.json`.
- `scripts/build_android.sh`: Builds web + Android, copies the debug APK,
  and can install/launch with `bdb`.

## Identity

- Android package/application id: `co.harrishill.paintboard`
- Android display label: `Paint Board`
- Board app id: `paint-board`
- APK output path: `Builds/Android/paint-board-debug.apk`
- Current model path: `android/app/src/main/assets/model.tflite`

Android treats the package/application id as the install identity. The display
label is only the name shown to users.

## Build

```bash
./scripts/build_android.sh
```

The script builds `web/dist`, runs the Android wrapper build, and copies the
debug APK to `Builds/Android/paint-board-debug.apk`. Use `--install --launch` to
deploy through `bdb` when Board device tooling is installed.

```bash
bdb status
./scripts/build_android.sh --install --launch
adb install Builds/Android/paint-board-debug.apk
```

The Android build copies `web/dist` into APK assets by default. Use
`./scripts/build_android.sh --web-target raw` only for the raw bridge test
page.
