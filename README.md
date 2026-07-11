# no-signal

> Offline multi-turn diagnostic agent for field technicians

![build](https://img.shields.io/badge/build-passing-brightgreen)
![license](https://img.shields.io/badge/license-MIT-blue)
![react-native](https://img.shields.io/badge/React%20Native-0.75-61dafb)
![python](https://img.shields.io/badge/Python-3.11-3776ab)

Google DeepMind Bangalore Hackathon — Special Prize Track (Gemma 4 Local-First Agents)

---

## 🔧 The Problem

Field technicians (diesel gensets, irrigation pumps) work in low-connectivity rural areas where cloud AI is unreachable. Existing "on-device AI" is a single-turn chatbot that lost the plot the second it left the datacenter — it doesn't hold state, doesn't revise when a fix fails, and doesn't know when to defer to a human.

no-signal is a real sense→decide→act→check agent that runs entirely offline, revises hypotheses when a step fails, escalates when it should, and — the fun part — **improves the entire fleet's local knowledge the moment any single device reconnects**.

---

## 🗺️ System Diagram

```text
┌─────────────────────────────────────────────────────────────────────┐
│                         ON-DEVICE (ANDROID)                          │
│                         Fully offline capable                        │
│                                                                        │
│  ┌──────────┐    ┌──────────────┐    ┌─────────────┐                │
│  │  SENSE   │───▶│    DECIDE    │───▶│     ACT     │                │
│  │ (input)  │    │ Gemma 4 E4B  │    │ (show step) │                │
│  └──────────┘    │  + Local RAG │    └──────┬──────┘                │
│       ▲          └──────────────┘           │                       │
│       │                  ▲                  ▼                       │
│       │           ┌──────┴───────┐    ┌─────────────┐               │
│       └───────────│    CHECK     │◀───│  Technician  │               │
│                    │ (compare    │    │   reports     │               │
│                    │  outcome)   │    │   result      │               │
│                    └──────┬──────┘    └─────────────┘               │
│                           │                                          │
│                  ┌────────┴────────┐                                │
│                  │  Hypothesis     │                                │
│                  │  resolved?      │                                │
│                  └────┬───────┬────┘                                │
│                    NO │       │ YES                                 │
│                       ▼       ▼                                     │
│              ┌────────────┐ ┌──────────┐                            │
│              │  REVISE &  │ │  RESOLVE │                            │
│              │  RETRY     │ │  session │                            │
│              │ (loop back │ └──────────┘                            │
│              │  to DECIDE)│                                         │
│              └─────┬──────┘                                         │
│                     │ after N failures OR safety flag                │
│                     ▼                                                │
│              ┌─────────────┐                                        │
│              │    DEFER    │                                        │
│              │  Generate   │                                        │
│              │  structured │                                        │
│              │  handoff    │                                        │
│              │  report     │──────┐                                 │
│              └─────────────┘      │                                 │
│                                    ▼                                 │
│                         ┌─────────────────────┐                     │
│                         │  LOCAL SYNC QUEUE    │                     │
│                         │ (unresolved cases +  │                     │
│                         │  session logs, held  │                     │
│                         │  until connectivity) │                     │
│                         └──────────┬───────────┘                     │
└────────────────────────────────────┼─────────────────────────────────┘
                                      │ connectivity restored
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CLOUD (iAPI / Managed Agents)                     │
│                                                                        │
│   ┌───────────────┐   ┌────────────────┐   ┌─────────────────────┐  │
│   │ RESEARCH AGENT│──▶│ VALIDATION     │──▶│  DISTILLATION AGENT │  │
│   │ Gemini 3.5    │   │ AGENT          │   │  Compresses verified │  │
│   │ Flash +       │   │ Cross-checks   │   │  fix into structured │  │
│   │ web search     │   │ against 2nd    │   │  fault-tree JSON     │  │
│   │               │   │ source          │   │                      │  │
│   └───────────────┘   └────────────────┘   └──────────┬───────────┘  │
│                                                          │             │
│              ┌───────────────────────────────────────────┘            │
│              ▼                                                        │
│   ┌─────────────────────┐        ┌─────────────────────┐             │
│   │  NB2 LITE            │        │   OMNI FLASH         │             │
│   │  Generates annotated │        │  Generates short      │             │
│   │  diagnostic          │        │  instructional repair │             │
│   │  illustration         │        │  video clip           │             │
│   └──────────┬───────────┘        └──────────┬───────────┘             │
│              │                                │                        │
│              └────────────┬───────────────────┘                        │
│                            ▼                                           │
│               ┌─────────────────────────┐                              │
│               │  FLEET KNOWLEDGE STORE   │                              │
│               │  (aggregated across all  │                              │
│               │   field devices)         │                              │
│               └────────────┬─────────────┘                              │
│                             │                                           │
│                  (stretch) periodic LoRA                                │
│                  fine-tune on aggregated                                │
│                  unresolved-case data                                   │
│                             ▼                                           │
│               ┌─────────────────────────┐                              │
│               │  LoRA Adapter Delta      │                              │
│               │  (small, shippable)      │                              │
│               └────────────┬─────────────┘                              │
└────────────────────────────┼──────────────────────────────────────────┘
                              │ pushed on next sync
                              ▼
                 back to ON-DEVICE Local RAG +
                 (stretch) adapter merge into Gemma 4 E4B
```

---

## 📁 Repo Layout

```
no-signal/
├── mobile/          # React Native (TypeScript) Android app + native Gemma bridge
├── cloud/           # FastAPI + Research/Validation/Distillation agents
├── fault_trees/     # Seed fault-tree JSON KB + schema
├── docs/            # Architecture, demo runbook, dev setup, deep-dives
├── scripts/         # sync_demo.py, seed_local_rag.py
└── .github/         # CI workflows
```

---

## 🚀 Quickstart

**Mobile (Android):**
```bash
cd mobile && npm install && npx react-native run-android
```

**Cloud (FastAPI):**
```bash
cd cloud && pip install -e . && uvicorn cloud.main:app --reload
```

**Simulated sync demo:**
```bash
python scripts/sync_demo.py
```

Full setup details: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

---

## 🎬 Demo (3 minutes)

- ✈️ Airplane mode **ON** — visible on the device
- Technician reports "genset won't start" (voice)
- Agent proposes diagnostic step 1 → **step 1 fails** → live hypothesis revision (not a repeat)
- Failure threshold hit → DEFER → structured handoff report displayed
- Toggle connectivity **ON** → sync fires → cloud pipeline runs → new fault-tree entry lands in Local RAG
- Simulated second session resolves the same fault instantly using the freshly-learned entry

Full runbook: [`docs/DEMO.md`](docs/DEMO.md).

---

## 👥 Team Split

**Person A — On-device Agent Core**
- Gemma E4B integration (LiteRT-LM / AICore)
- State Manager, Reasoning Loop Controller
- CHECK / revise / DEFER logic

**Person B — Knowledge, UI, Cloud Sync**
- Fault-tree KB curation (5-6 genset / pump scenarios)
- Android UI (voice, text, camera, offline indicator)
- Sync layer + cloud agent pipeline (iAPI) + NB2 Lite / Omni Flash

---

## 📄 License

MIT — see [`LICENSE`](LICENSE).

Authoritative design doc: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
