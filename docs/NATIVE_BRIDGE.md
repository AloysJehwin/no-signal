# Native Gemma Bridge

How the React Native app calls Gemma 4 E4B fully offline via LiteRT-LM.

## Layout

```
mobile/android-native/gemma/
├── GemmaModule.kt        # @ReactMethod entrypoints exposed to JS
├── GemmaPackage.kt       # ReactPackage — registers GemmaModule with RN
├── LiteRtInference.kt    # Thin Kotlin wrapper around LiteRT-LM engine
└── build.gradle          # Adds LiteRT-LM AAR dependency
```

The JS side calls it through `NativeModules.Gemma.generate(prompt, sessionState)`. Wrapper: `mobile/src/decide/gemma.ts`.

## Registering the Package

In `mobile/android/app/src/main/java/.../MainApplication.kt`, add `GemmaPackage()` to the packages list:

```kotlin
override fun getPackages(): List<ReactPackage> =
    PackageList(this).packages.apply {
        add(GemmaPackage())          // ← FieldFix native bridge
    }
```

If you skip this, JS calls to `NativeModules.Gemma` return `null` and `decide/gemma.ts` will throw `GemmaModule not registered`.

## Model Files On-Device

LiteRT-LM expects the Gemma 4 E4B model at:

```
/data/data/<app.package.id>/files/models/gemma-4-e4b.litertlm
```

For dev, push via adb:

```bash
adb push ./gemma-4-e4b.litertlm \
  /data/local/tmp/gemma-4-e4b.litertlm

adb shell run-as com.fieldfix.app \
  mkdir -p files/models

adb shell run-as com.fieldfix.app \
  cp /data/local/tmp/gemma-4-e4b.litertlm files/models/
```

Do **not** bundle the model in the APK — it's too large for the Play Store size cap and slows every install cycle. Ship a download-on-first-launch flow for prod; keep the adb push for hackathon dev.

## Threading

- `GemmaModule.generate(...)` returns a `Promise` (native side)
- Inference runs on a `Dispatchers.Default` worker — do **not** call from the main thread
- The JS side `await`s the promise; UI stays responsive
- Cancellation: pass an `AbortSignal`-equivalent session id; the Kotlin side keeps a `Job` per session and cancels on new `generate` for the same session

## AICore fallback

If LiteRT-LM engine init fails (older device, missing NDK deps), `LiteRtInference.kt` falls back to the AICore Developer Preview via `AiCore.getInference(...)`. Behavior is functionally equivalent from JS's perspective — same `generate` contract, same output shape.

## Smoke Test

From JS (after `adb reverse tcp:8081 tcp:8081`):

```ts
import { NativeModules } from 'react-native';
const out = await NativeModules.Gemma.generate('ping', {});
console.log(out); // expect a short model response
```

If this hangs > 30s on first call, model file load is likely failing — check `adb logcat | grep -i litert`.
