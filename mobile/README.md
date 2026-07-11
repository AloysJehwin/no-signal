# nosignal-mobile

React Native (TypeScript) implementation of the FieldFix on-device agent. Android only for hackathon.

## Run

```bash
npm install
npx react-native run-android
```

Requires an Android device or emulator with the Gemma 4 E4B model asset present. See `android-native/gemma/README.md` for native module linking.

## Permissions (AndroidManifest)

- `RECORD_AUDIO` — voice input
- `CAMERA` — fault photo capture
- `ACCESS_NETWORK_STATE` + `INTERNET` — sync when reachable

## LiteRT-LM native setup — TODO

1. Add LiteRT-LM AAR/gradle dep to `android/app/build.gradle`.
2. Place `gemma_4_e4b.task` (or equivalent) in `android/app/src/main/assets/models/`.
3. Register `GemmaInferencePackage` in `MainApplication.kt` (see native README).
4. Verify with `adb logcat | grep GemmaInference`.

## Layout

- `src/sense/` — input capture (voice, camera, symptom shape)
- `src/decide/` — Gemma bridge + reasoning loop
- `src/state/` — session store
- `src/rag/` — local fault-tree store (SQLite)
- `src/check/` — outcome comparison
- `src/sync/` — offline queue, cloud handoff
- `src/ui/` — screens and small components
