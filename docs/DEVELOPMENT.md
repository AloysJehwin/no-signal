# Development Setup

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20+ | Use `nvm` |
| React Native CLI | latest | `npm install -g react-native-cli` |
| Android Studio | Hedgehog (2023.1.1) or newer | SDK 34, NDK 26+ |
| JDK | 17 | Android Gradle Plugin 8 requires JDK 17 |
| Python | 3.11+ | 3.12 also fine |
| Gemini API key | — | For Research Agent — free tier is enough |

Set credentials in `cloud/secrets.json` (copy from `cloud/secrets.json.example` — this file is gitignored):
```bash
cp cloud/secrets.json.example cloud/secrets.json
# edit cloud/secrets.json and fill in all values
```

See [`docs/TRAINING_API.md`](TRAINING_API.md) for the full credentials reference,
deployment commands, and training API docs.

## Mobile (`mobile/`)

```bash
cd mobile
npm install
# start a device or emulator (API 34+ recommended)
npx react-native run-android
```

Metro bundler runs on `:8081`. For a physical device, forward the cloud port so the app can reach your laptop:
```bash
adb reverse tcp:8000 tcp:8000
```

The native Gemma bridge lives at `mobile/android-native/gemma/`. See [`NATIVE_BRIDGE.md`](NATIVE_BRIDGE.md) for how it's wired into `MainApplication.kt` and where to place the LiteRT-LM model file on-device.

## Cloud (`cloud/`)

```bash
cd cloud
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env  # then edit GEMINI_API_KEY
uvicorn cloud.main:app --reload
```

The API is now at `http://localhost:8000` with:
- `GET  /health` — liveness
- `POST /sync` — accepts `list[HandoffReport]`, returns distilled fault-tree entries
- `GET  /fault-trees` — dumps the in-memory Fleet Knowledge Store

Endpoint contracts: `cloud/schemas.py`. Deep-dive on the pipeline: [`AGENT_PIPELINE.md`](AGENT_PIPELINE.md).

## Adding a Fault Tree

1. Copy an existing entry in `fault_trees/` (e.g. `genset_no_start_001.json`)
2. New file name must equal the `fault_id` field, snake_case, ending `.json`
3. `equipment_type` must be one of `diesel_genset` or `irrigation_pump` (see `fault_trees/schema.json`)
4. Validate locally before pushing:
   ```bash
   pip install check-jsonschema
   check-jsonschema --schemafile fault_trees/schema.json fault_trees/*.json
   ```
5. To simulate loading it into the on-device Local RAG:
   ```bash
   python scripts/seed_local_rag.py
   ```

CI will re-run schema validation on every PR.

## Running Tests

**Mobile:**
```bash
cd mobile
npm test          # jest
npm run lint      # eslint
npx tsc --noEmit  # type-check
```

**Cloud:**
```bash
cd cloud
pytest tests/
```

## Common Gotchas

- `adb reverse` is per-boot — re-run after unplugging the device
- If `npx react-native run-android` hangs on "Installing", check `adb devices` — the device must be listed as `device`, not `unauthorized`
- If the Research Agent errors on `GEMINI_API_KEY`, confirm `cloud/.env` is loaded — restart `uvicorn`
- Airplane-mode-on for offline testing does **not** cut `adb reverse`; that's a feature, not a bug
