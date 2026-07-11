# GemmaInference — Android native module

Bridges the RN `NativeModules.GemmaInference` facade in `src/decide/GemmaBridge.ts` to a
LiteRT-LM-backed Gemma 4 E4B runtime.

## Contract (must not drift from `GemmaBridge.ts`)

- Module name: `GemmaInference`
- `runInference(prompt: String, promise: Promise)` — resolves to a JSON string
  matching `{hypothesis, step, expected, confidence}`.
- `isReady(promise: Promise)` — resolves boolean, no reject.

## Linking into the RN Android project

1. Copy both `.kt` files under
   `mobile/android/app/src/main/java/com/nosignal/gemma/`.
2. Add the LiteRT-LM gradle dependency in `mobile/android/app/build.gradle`
   (exact coord depends on the LiteRT-LM release you use).
3. Patch `mobile/android/app/src/main/java/com/nosignal/MainApplication.kt`:

   ```kotlin
   import com.nosignal.gemma.GemmaInferencePackage
   // inside getPackages():
   add(GemmaInferencePackage())
   ```

4. Drop the Gemma 4 E4B `.task` (or equivalent) into
   `mobile/android/app/src/main/assets/models/` and load it lazily on the first
   `runInference` call. Keep the engine warm for the duration of the process.
5. Declare `<uses-permission android:name="android.permission.RECORD_AUDIO" />`
   and camera + network permissions in `AndroidManifest.xml`.

## Verifying

```
adb logcat | grep GemmaInference
```
