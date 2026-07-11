# no-signal

> True Autonomous, Offline-First Multimodal Diagnostic Agent

![build](https://img.shields.io/badge/build-passing-brightgreen)
![license](https://img.shields.io/badge/license-MIT-blue)
![react-native](https://img.shields.io/badge/React%20Native-0.75-61dafb)
![python](https://img.shields.io/badge/Python-3.11-3776ab)

Built for the **Google DeepMind Bangalore Hackathon** — Targetting: 
1. **Problem Statement 1:** Real-Time Multimodal Interaction (Gemini Live API)
2. **Special Prize:** Best Use of Gemma 4 - Local-First Agents on Gemma

---

## 🎯 The Vision: Breaking the Chatbot Paradigm

### 1. Real-Time Multimodal Interaction (Gemini Live)
Most "voice assistants" are just text interfaces wearing a microphone—wait, process, respond, repeat. **no-signal** breaks this rigid turn-based structure. Leveraging the **Gemini Live API** and **Gemma Multimodal**, the agent can see what the technician sees through a live camera feed and listen to real-time audio. Users can interrupt the agent mid-response, the model reads vocal tone, and it proactively points out anomalies in the video feed that the user hasn't explicitly mentioned. It’s a fluid, uninterrupted collaboration, not a staggered Q&A.

### 2. True Local-First Agency (Gemma 4 On-Device)
Most "on-device AI" simply moves a cloud chatbot onto a phone. It forgets context, fails rigidly, and assumes a server connection will eventually return. Real agency means holding state across a complex diagnostic task, deciding what to do next based on what’s already been learned, and recovering when a plan breaks—entirely offline.

Across regions with spotty connectivity, sending data to a server is a non-starter. **no-signal** runs a complete, autonomous **Sense → Decide → Act → Check** loop entirely on-device using **Gemma 4**. It isn't a straight arrow from input to output. It maintains local state, attempts a fix, evaluates if the fix worked, revises its hypothesis upon failure, and knows exactly when to draw a boundary and defer to a human.

### 3. Fleet-Wide Continuous Learning
When the local agent hits a dead end, it caches the unresolved session. The moment the device reconnects to the internet, our orchestration pipeline syncs the session to the cloud. **Gemini Flash** conducts web-grounded research to find the fix, **Nano banana** generates visual guides, and **Gemini Flash Live** synthesizes real-time audio instructions. This new knowledge is distilled into a structured fault-tree and instantly pushed back to the local device. The next time *any* technician faces the issue offline, Gemma 4 resolves it instantly.

---

## 🗺️ System Architecture

```text
┌─────────────────────────────────────────────────────────────────────┐
│                         ON-DEVICE (ANDROID)                          │
│                Gemma 4 E2B/E4B • Fully offline capable               │
│                                                                        │
│  ┌──────────┐    ┌──────────────┐    ┌─────────────┐                │
│  │  SENSE   │───▶│    DECIDE    │───▶│     ACT     │                │
│  │ (audio/  │    │ Gemma 4      │    │ (speak/     │                │
│  │  video)  │    │  + Local RAG │    │  show step) │                │
│  └──────────┘    └──────────────┘    └──────┬──────┘                │
│       ▲                  ▲                  ▼                       │
│       │           ┌──────┴───────┐    ┌─────────────┐               │
│       └───────────│    CHECK     │◀───│ Technician  │               │
│                   │ (did it work?│    │ (Live feed  │               │
│                   │  interrupts) │    │  interrupts)│               │
│                   └──────┬──────┘    └─────────────┘               │
│                          │                                          │
│                 ┌────────┴────────┐                                 │
│                 │  Hypothesis     │                                 │
│                 │  resolved?      │                                 │
│                 └────┬───────┬────┘                                 │
│                   NO │       │ YES                                  │
│                      ▼       ▼                                      │
│             ┌────────────┐ ┌──────────┐                             │
│             │  REVISE &  │ │  RESOLVE │                             │
│             │  RETRY     │ │  session │                             │
│             │ (loop back │ └──────────┘                             │
│             │  to DECIDE)│                                          │
│             └─────┬──────┘                                          │
│                   │ after N failures OR safety flag                 │
│                   ▼                                                 │
│             ┌─────────────┐                                         │
│             │    DEFER    │                                         │
│             │  Generate   │                                         │
│             │  structured │                                         │
│             │  handoff    │──────┐                                  │
│             └─────────────┘      │                                  │
│                                  ▼                                  │
│                       ┌─────────────────────┐                       │
│                       │  LOCAL SYNC QUEUE    │                       │
│                       │ (held until network) │                       │
│                       └──────────┬───────────┘                       │
└──────────────────────────────────┼──────────────────────────────────┘
                                   │ connectivity restored
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CLOUD (Orchestration Pipeline)                    │
│                                                                        │
│   ┌───────────────┐   ┌────────────────┐   ┌─────────────────────┐  │
│   │ RESEARCH AGENT│──▶│ VALIDATION     │──▶│  DISTILLATION AGENT │  │
│   │ Gemini Flash  │   │ AGENT          │   │  Compresses verified │  │
│   │ + web search  │   │ Cross-checks   │   │  fix into structured │  │
│   │               │   │ against 2nd    │   │  fault-tree JSON     │  │
│   │               │   │ source         │   │                      │  │
│   └───────────────┘   └────────────────┘   └──────────┬───────────┘  │
│                                                          │             │
│              ┌───────────────────────────────────────────┘            │
│              ▼                                                        │
│   ┌─────────────────────┐        ┌─────────────────────┐             │
│   │  NANO BANANA         │        │   GEMINI FLASH LIVE  │             │
│   │  Generates dynamic   │        │  Synthesizes real-   │             │
│   │  repair illustration │        │  time audio guide    │             │
│   └──────────┬───────────┘        └──────────┬───────────┘             │
│              │                                │                        │
│              └────────────┬───────────────────┘                        │
│                           ▼                                            │
│               ┌─────────────────────────┐                              │
│               │  FLEET KNOWLEDGE STORE   │                              │
│               │ (pushed on next sync)    │                              │
│               └─────────────────────────┘                              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Repo Layout

```text
no-signal/
├── mobile/          # React Native Android app + Gemma 4 native bridge
├── cloud/           # FastAPI backend + Orchestration Pipeline (Research/Validate/Distill)
├── fault_trees/     # Seed fault-tree JSON KB + schema
├── docs/            # Architecture, API endpoints, dev setup
├── scripts/         # End-to-end test suites and sync simulators
└── .github/         # CI workflows
```

---

## 🚀 Quickstart

**Mobile (Android):**
```bash
cd mobile && npm install && npx react-native run-android
```

**Cloud Backend (FastAPI):**
```bash
cd cloud && pip install -e . && uvicorn cloud.main:app --reload
```
*Note: Ensure `cloud/secrets.json` is configured. See `docs/TRAINING_API.md` for Cloud Run deployment commands.*

---

## 🎬 3-Minute Demo Runbook

1. **Airplane mode ON** — Start device offline.
2. Technician initiates a **live audio/video session** and reports an engine fault.
3. **Gemma 4** takes over locally. The tech interrupts mid-sentence to point the camera at a leaking valve. The agent adapts instantly without breaking the conversational flow.
4. Agent proposes a fix → **Fix fails**.
5. The local **State Manager** catches the failure, revises the hypothesis, and loops back to DECIDE. 
6. After 3 local failures, the agent determines it lacks the knowledge, gracefully **DEFERS** the issue, and caches a highly detailed Handoff Report.
7. **Airplane mode OFF**. The app instantly syncs the failure to the cloud. 
8. The cloud **Orchestration Pipeline** (Gemini Flash + Nano Banana + Flash Live) resolves the anomaly, updates the Fleet Knowledge Store, and syncs the new rules back down.
9. **Simulated second offline session** resolves the identical fault instantly using the freshly-learned, on-device data.

---

## 📄 License
MIT — see [`LICENSE`](LICENSE).
