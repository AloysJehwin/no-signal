# nosignal-mobile

Expo React Native (TypeScript) implementation of the FieldFix on-device agent.
Runs Gemma-3n E2B (multimodal, ~3.7 GB) fully on-device via MediaPipe Tasks GenAI.
Android only (MediaPipe LlmInference is Android-first).

## Two run modes

**A. Expo Go (no LLM)** — fast UI iteration. `GemmaBridge` falls back to a stub.

```bash
nvm use 20
npm install
npx expo start --lan
```

Scan QR with Expo Go.

**B. Dev client (real Gemma)** — required for on-device inference.

## Dev-client setup (one time)

1. **Hugging Face**
   - Create account at https://huggingface.co
   - Accept license at https://huggingface.co/google/gemma-3n-E2B-it-litert-lm
   - Create Read token at https://huggingface.co/settings/tokens

2. **Env**
   ```bash
   cp mobile/.env.example mobile/.env
   # edit mobile/.env and paste your HF token
   ```

3. **EAS**
   ```bash
   npm install -g eas-cli
   eas login
   cd mobile
   eas build --profile development --platform android
   ```
   Wait ~15 min. Install the resulting APK on your S23 Ultra.

4. **Run**
   ```bash
   npx expo start --dev-client
   ```
   Open the dev client on the phone → scan QR. On first launch the app prompts
   to download the model (~3.7 GB, Wi-Fi recommended).

## Permissions

- `RECORD_AUDIO` — voice input (Expo Go stubs it)
- `CAMERA` — multimodal photo input
- `ACCESS_NETWORK_STATE` + `INTERNET` — cloud sync + model download

## Layout

- `src/sense/` — voice / camera / symptom input
- `src/decide/` — GemmaBridge, ReasoningLoop, ModelDownloader
- `src/state/` — session store
- `src/rag/` — local fault-tree store (expo-sqlite)
- `src/check/` — outcome comparison
- `src/sync/` — offline queue, cloud handoff
- `src/ui/` — screens (MainScreen, ModelSetupScreen)
- `modules/expo-gemma-llm/` — local Expo module wrapping MediaPipe LlmInference
