# FieldFix — Offline Multi-Turn Diagnostic Agent
## Complete System Architecture
### Google DeepMind Bangalore Hackathon — Special Prize Track (Gemma 4 Local-First Agents)

---

## 1. Problem Statement

Field technicians (diesel genset / irrigation pump repair, initially) working in low-connectivity rural areas need expert diagnostic guidance but cannot rely on cloud AI. Existing "on-device AI" is a single-turn chatbot moved from cloud to phone — it doesn't hold state, doesn't recover from failed attempts, and doesn't know what to do when it doesn't know something.

FieldFix is a genuine sense-decide-act-check agent that runs entirely offline, revises its own hypotheses when a fix fails, knows when to defer to a human, and — critically — **improves the entire fleet's local knowledge** the moment any single device reconnects to the internet.

---

## 2. High-Level System Diagram

```
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

## 3. On-Device Architecture (Android)

### 3.1 Core Components

| Component | Responsibility | Tech |
|---|---|---|
| **Inference Engine** | Runs Gemma 4 E4B fully offline | LiteRT-LM or AICore Developer Preview |
| **State Manager** | Tracks active session: symptom history, hypotheses tried, outcomes, confidence scores | Local object store (Room DB / SQLite) |
| **Local RAG Store** | Structured fault-tree knowledge base, queried before each DECIDE step | SQLite + simple vector/keyword lookup (no internet needed) |
| **Reasoning Loop Controller** | Orchestrates SENSE→DECIDE→ACT→CHECK→REVISE/DEFER | Kotlin state machine |
| **Sync Queue** | Holds unresolved cases + session logs until connectivity returns | Local queue, WorkManager-scheduled sync |
| **Media Cache** | Stores NB2 Lite illustrations / Omni Flash clips fetched on prior syncs, for offline replay | Local file cache |

### 3.2 The Reasoning Loop (detailed)

**SENSE**
- Input: voice or text description of symptom
- Optional: camera photo of the fault
- Normalize into a structured `SymptomInput` object

**DECIDE**
- Query Local RAG for matching/similar fault-tree entries
- Gemma 4 E4B reasons over: `SymptomInput` + `SessionState` (what's been tried) + retrieved fault-tree context
- Outputs: next diagnostic step + expected outcome + confidence score

**ACT**
- Present the step to the technician (text/voice, plus cached illustration/video if available)
- Wait for technician's reported outcome

**CHECK**
- Compare reported outcome vs. expected outcome
- If match → mark hypothesis resolved, close session, log success
- If mismatch → this is NOT a repeat; feed the failed outcome back into DECIDE as new evidence to eliminate that hypothesis branch

**REVISE & RETRY**
- Loop back to DECIDE with updated `SessionState` (excludes ruled-out hypotheses)
- Track failure count

**DEFER** (triggered by either condition)
- Failure count exceeds threshold (e.g., 3 failed hypotheses), OR
- Safety-critical keyword detected (e.g., "sparking," "fuel leak," "burning smell")
- Generates a structured **handoff report**: symptom history, all attempted steps + outcomes, current hypothesis, confidence level
- Session marked "unresolved," pushed to Sync Queue
- Technician is clearly told: "This needs a human expert — here's what we've ruled out so far"

### 3.3 Data Structures (simplified schema)

```json
// SessionState
{
  "session_id": "uuid",
  "equipment_type": "diesel_genset",
  "symptom_raw": "engine won't start, clicking sound",
  "attempted_steps": [
    {"step": "check battery voltage", "expected": ">12V", "reported": "11.2V", "match": false}
  ],
  "ruled_out_hypotheses": ["fuel_starvation"],
  "current_hypothesis": "weak_battery",
  "confidence": 0.62,
  "status": "in_progress" // in_progress | resolved | deferred
}

// Fault-tree entry (Local RAG)
{
  "fault_id": "genset_no_start_001",
  "symptoms": ["won't start", "clicking sound", "no crank"],
  "hypotheses": [
    {
      "name": "weak_battery",
      "diagnostic_step": "measure battery voltage at terminals",
      "expected_result": "12.4V or higher",
      "if_confirmed": "charge or replace battery",
      "if_ruled_out": "move to starter_motor hypothesis"
    }
  ],
  "safety_flags": []
}

// Handoff Report (sent to Sync Queue)
{
  "session_id": "uuid",
  "equipment_type": "diesel_genset",
  "full_history": [ /* attempted_steps */ ],
  "ruled_out": [ "fuel_starvation", "weak_battery" ],
  "leading_hypothesis": "starter_motor_failure",
  "confidence": 0.35,
  "safety_flag": false,
  "timestamp": "..."
}
```

---

## 4. Cloud Architecture (iAPI / Managed Agents)

Triggered automatically when the device regains connectivity and the Sync Queue is non-empty.

### 4.1 Agent Pipeline

**1. Research Agent**
- Model: Gemini 3.5 Flash
- Tool: web search
- Input: Handoff Report (leading hypothesis + ruled-out list + symptoms)
- Task: investigate the unresolved case — search manufacturer docs, repair forums, technical databases for the specific fault pattern
- Output: candidate fix + supporting sources

**2. Validation Agent**
- Input: Research Agent's candidate fix
- Task: cross-check the finding against a second independent source before accepting it; flag contradictions
- Output: validated fix (or "insufficient confidence, escalate to human review")

**3. Distillation Agent**
- Input: validated fix
- Task: compress into the same structured fault-tree JSON schema used on-device (see 3.3)
- Output: new/updated fault-tree entry, ready to push to Local RAG

### 4.2 Media Enrichment (parallel, after Distillation)

- **NB2 Lite**: generates a fast annotated illustration of the fix (e.g., labeled diagram of the failed component) — cached for offline viewing next time this fault appears
- **Omni Flash**: generates a short instructional video clip demonstrating the repair step — same caching purpose

### 4.3 Fleet Knowledge Store

- Aggregates distilled fault-tree entries across all field devices
- New entries pushed down to every device's Local RAG on their next sync — one technician's solved mystery becomes every technician's instant answer

### 4.4 Stretch: LoRA Adapter Fine-Tuning

- Periodically (not per-sync), aggregate unresolved-case + resolution data across the fleet
- Fine-tune a small LoRA adapter for Gemma 4 E4B on this aggregated data
- Ship the lightweight adapter delta down at next sync; merge locally
- **Honesty note for judges**: this is fleet-level continual learning done safely in the cloud, not literal on-device weight training — the phone never trains itself, but the effect (the model gets measurably better at this fleet's real failure patterns over time) is real and demoable in concept even if only partially implemented live.

---

## 5. Optional Escalation Path (Gemini Live API)

For cases too complex even for the cloud agent pipeline:
- Technician can initiate a live voice/video call with a human expert
- **Gemini Live Translate** provides real-time bidirectional translation across regional languages
- Only available when online — clearly gated in UI as an online-only feature, distinct from the offline core loop

---

## 6. Feature-to-Product Mapping (for judging + pitch)

| Google Feature | Where It's Used | Why It's Load-Bearing (not decorative) |
|---|---|---|
| Gemma 4 E4B | On-device reasoning loop | Core agent; runs fully offline |
| iAPI / Managed Agents | Research → Validation → Distillation pipeline | Real multi-agent handoff with conflict resolution (Validation Agent can reject Research Agent's finding) |
| Gemini 3.5 Flash | Powers Research Agent | Investigates real unresolved cases, not canned responses |
| NB2 Lite | Diagnostic illustration generation | Fast enough to generate at sync-time, cached for offline reuse |
| Omni Flash | Instructional repair video generation | Same — sync-time generation, offline reuse |
| Gemini Live + Live Translate | Human escalation call | Only for genuinely complex cases beyond agent capability |

---

## 7. Build Priority (2-person team, ~7 hours)

### Must be real and live-demoable
1. Gemma E4B offline inference working on a physical device
2. SENSE→DECIDE→ACT→CHECK loop with real hypothesis revision (not scripted repeats)
3. DEFER logic with structured handoff report generation
4. At least a simplified Distillation Agent updating Local RAG on simulated sync

### Can be thinner / partially pre-generated
5. Research + Validation Agent pipeline (can simplify to one combined agent if time-constrained)
6. NB2 Lite / Omni Flash generation (pre-generate 1-2 examples if live generation risks time; be transparent in pitch about what's live vs. cached)
7. Gemini Live escalation (describe as designed/next-step if not built)

### Explicitly out of scope for the hackathon
- Actual on-device LoRA weight merging (describe conceptually only)
- Full fleet-scale infrastructure (demo with 1 device + simulated "fleet" of 2-3 mock sessions)

---

## 8. Demo Script (3-minute live pitch)

1. **Airplane mode ON, visibly** — this is the proof, don't skip it
2. Technician reports: "genset won't start" (voice input)
3. Agent asks a clarifying question, proposes diagnostic step 1
4. Step 1 fails — **show live hypothesis revision**, not a repeat
5. Continue to failure threshold → DEFER triggers, handoff report displayed
6. Toggle connectivity back ON → sync fires → cloud agent pipeline runs (can be sped up/narrated for demo) → new fault-tree entry appears in Local RAG
7. Close the loop: show that a *second* simulated session now resolves instantly using the newly learned fix

That final beat — one technician's failure becomes another's instant success — is the strongest "Creativity and Originality" moment. Make sure it's the last thing judges see.

---

## 9. Team Split

**Person A — On-device Agent Core**
- Gemma E4B integration (LiteRT-LM / AICore)
- State Manager, Reasoning Loop Controller
- CHECK/revise logic, DEFER logic

**Person B — Knowledge, UI, Cloud Sync**
- Fault-tree knowledge base curation (5-6 genset/pump scenarios)
- Android UI (voice/text input, camera, step display, offline indicator)
- Sync layer + simplified cloud agent pipeline (iAPI) + NB2 Lite / Omni Flash calls
