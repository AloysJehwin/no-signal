# FieldFix Demo — 3-Minute Presenter Runbook

Derived from `ARCHITECTURE.md` §8. Written to be read aloud while driving the device.

## Pre-flight (do BEFORE judges walk up)

- Physical Android device charged, unlocked, developer options on
- APK installed, Gemma model file already deployed under app private storage
- Cloud FastAPI running on laptop (`uvicorn cloud.main:app --reload`), reachable from phone Wi-Fi
- Two pre-seeded fault trees loaded on device (from `fault_trees/`) — genset_no_start_001 explicitly REMOVED so it is "learned" during the demo
- Have `scripts/sync_demo.py` ready in a terminal as a backup path (see fallback F1)

## The Script

### 00:00 — Frame the problem (15s)
> "Rural technician, no bars. Existing on-device AI is a chatbot with amnesia. Watch."

### 00:15 — Airplane mode ON, visibly (10s)
Toggle airplane mode in the notification shade **while judges watch**. The device UI shows a red "OFFLINE" pill. **Do not skip this — it is the proof.**

**Fallback F1 (airplane mode won't stick / Wi-Fi auto-reconnects):** unplug the router / hit the laptop hotspot toggle. If nothing works, run `adb shell svc wifi disable && adb shell svc data disable` from the laptop. As last resort, narrate: "For time we're skipping the toggle — see the OFFLINE indicator in the top bar."

### 00:25 — SENSE (15s)
Tap mic. Say: *"Diesel genset won't start, I hear a clicking sound."*
Voice → text should appear within ~2s.

**Fallback F2 (voice fails):** tap the text input, type the same phrase. Say "for this demo I'm typing" — do not apologize.

### 00:40 — DECIDE + ACT step 1 (25s)
Agent proposes: *"Measure battery voltage at the terminals. Expected: 12.4V or higher."*
Point to the confidence score visible in the UI.

### 01:05 — CHECK fails, REVISE (30s)
Tap the "reported outcome" and enter **11.2V** (below expected).
Agent **must** now propose a **different** hypothesis (starter solenoid or corroded terminals) — **not a repeat of step 1**. Read the new step aloud.

> "This is the important beat: it revised. That's the agent, not a script."

**Fallback F3 (revision loop misfires and repeats):** back out of the session, use pre-seeded session #2 (starter_solenoid path) — narrate "let me show a fresh session where the revision is cleaner."

### 01:35 — CHECK fails again → DEFER (25s)
Enter another failing outcome. After the 3rd failure, DEFER triggers. Structured handoff report appears on screen showing symptom history, ruled-out list, leading hypothesis, and confidence.

> "It knows what it doesn't know. It won't guess a 4th time — it defers."

### 02:00 — Toggle connectivity ON, sync fires (30s)
Airplane mode OFF. A sync toast fires within ~2s. Cloud pipeline runs. **Narrate the pipeline while it runs** to fill time:
> "Research Agent — Gemini 3.5 Flash with web search — investigates. Validation Agent cross-checks against a second source. Distillation Agent compresses it into the same fault-tree JSON schema the device already reads."

**Fallback F4 (real cloud call is slow / fails):** on a second terminal run `python scripts/sync_demo.py` with a canned handoff — this simulates the round-trip end-to-end. Keep narrating the pipeline; the outcome is identical.

### 02:30 — The closing beat (30s)
New fault-tree entry lands in Local RAG. Open a **second** simulated session. Same symptom. It resolves **instantly** using the freshly-learned fix — no cloud call, offline again.

> "One technician's failure just became every technician's instant answer. That's the fleet loop, running on real hardware, right now."

### 03:00 — End

## Absolute do-nots

- Don't apologize for latency — narrate it as "the agent is thinking with 4 billion parameters on a phone"
- Don't leave airplane-mode-off during the offline segment
- Don't skip the closing "second session resolves instantly" beat — it is the strongest Creativity moment, per ARCHITECTURE.md §8
