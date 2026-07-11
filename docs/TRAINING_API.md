# no-signal — Training API & Cloud Deployment Guide

> Continuous learning, Gemma Cloud Run inference, and the full deployment reference.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Credentials Setup](#2-credentials-setup)
3. [Cloud Run Services](#3-cloud-run-services)
4. [Training API Reference](#4-training-api-reference)
5. [Sync API Reference](#5-sync-api-reference)
6. [Deployment Commands](#6-deployment-commands)
7. [Testing the APIs](#7-testing-the-apis)
8. [How Continuous Learning Works End-to-End](#8-how-continuous-learning-works-end-to-end)

---

## 1. Architecture Overview

```
Mobile Device (offline)
│
│  ReasoningLoop → HandoffReport → SyncQueue
│
└─── (connectivity restored) ──────────────────────────────────┐
                                                                ▼
                              nosignal-cloud (Cloud Run)
                              ┌────────────────────────────────┐
                              │  POST /api/sync/               │
                              │   └─ Research → Validation     │
                              │       └─ Distillation Agent    │
                              │                                 │
                              │  POST /api/training/            │
                              │   ├─ continuous-learn          │
                              │   │   └─ Gemini Flash          │
                              │   │       (web search)         │
                              │   ├─ offline-conversations     │
                              │   ├─ gemma-infer ─────────────►│──► gemma3-4b (Cloud Run)
                              │   └─ retrain-from-fleet        │        NVIDIA L4 GPU
                              │                                 │
                              │  Fleet Knowledge Store         │
                              └────────────────────────────────┘
                                              │
                              GET /api/sync/fault-trees
                                              │
                                              ▼
                              Mobile pulls updated LocalRagStore
```

---

## 2. Credentials Setup

All credentials live in `cloud/secrets.json`. **This file is gitignored and never committed.**

### Create your secrets file

```bash
cp cloud/secrets.json.example cloud/secrets.json
```

Then edit `cloud/secrets.json`:

```json
{
  "gemini_api_key": "AQ.Ab8RN6...",
  "gcp_project_id": "deepmind-hack26blr-4285",
  "gcp_project_number": "115075076514",
  "gcp_account": "devstar4285@gcplab.me",
  "cloud_run_nosignal_url": "https://nosignal-cloud-115075076514.us-central1.run.app",
  "cloud_run_gemma_url":    "https://gemma3-4b-115075076514.us-central1.run.app",
  "gcp_region": "us-central1"
}
```

The backend (`cloud/api/training.py`) reads this file at startup via `_load_secrets()`.
If the file is missing it falls back to the `GEMINI_API_KEY` environment variable.

> [!CAUTION]
> Never commit `cloud/secrets.json`. It contains API keys and GCP credentials.
> Use `cloud/secrets.json.example` as the template that lives in the repo.

---

## 3. Cloud Run Services

### nosignal-cloud (FastAPI backend)

| Field | Value |
|---|---|
| **Service name** | `nosignal-cloud` |
| **URL** | `https://nosignal-cloud-115075076514.us-central1.run.app` |
| **Swagger UI** | `https://nosignal-cloud-115075076514.us-central1.run.app/docs` |
| **ReDoc** | `https://nosignal-cloud-115075076514.us-central1.run.app/redoc` |
| **Region** | `us-central1` |
| **Project** | `deepmind-hack26blr-4285` |

### gemma3-4b (On-cloud Gemma 3 inference)

| Field | Value |
|---|---|
| **Service name** | `gemma3-4b` |
| **URL** | `https://gemma3-4b-115075076514.us-central1.run.app` |
| **Model** | `gemma3:4b` (Ollama-compatible API) |
| **GPU** | NVIDIA L4 — 8 vCPU, 32 GiB RAM |
| **Inference endpoint** | `POST /api/generate` |

---

## 4. Training API Reference

Base path: `/api/training`
Swagger: [/docs#Continuous Learning](https://nosignal-cloud-115075076514.us-central1.run.app/docs#/Continuous%20Learning)

---

### `POST /api/training/continuous-learn`

Fetches fresh web knowledge via **Gemini Flash** and mints new `FaultTreeEntry` objects.
Runs automatically after each successful device sync drain.

**Request body:**
```json
{
  "query": "diesel genset won't start clicking noise",
  "equipment_type": "diesel_genset"
}
```

**Response:**
```json
{
  "status": "success",
  "new_entries_generated": 2,
  "data": [
    {
      "fault_id": "diesel_genset_no_start_a1b2c3d4",
      "symptoms": ["won't start", "clicking noise"],
      "hypotheses": [
        {
          "name": "weak_battery",
          "diagnostic_step": "Measure battery voltage at terminals",
          "expected_result": "≥12.4 V",
          "if_confirmed": "Charge or replace battery",
          "if_ruled_out": "Move to starter solenoid hypothesis"
        }
      ],
      "safety_flags": [],
      "created_at": "2026-07-11T07:00:00Z"
    }
  ]
}
```

**cURL:**
```bash
curl -X POST https://nosignal-cloud-115075076514.us-central1.run.app/api/training/continuous-learn \
  -H 'Content-Type: application/json' \
  -d '{"query": "diesel genset won'\''t start clicking noise", "equipment_type": "diesel_genset"}'
```

---

### `POST /api/training/offline-conversations`

Ingests offline conversation logs and extracts structured diagnostic knowledge.

**Request body:**
```json
[
  {
    "session_id": "offline-conv-001",
    "equipment_type": "irrigation_pump",
    "turns": [
      {"role": "technician", "content": "Pump won't prime, tried filling casing twice."},
      {"role": "agent",      "content": "Check foot valve for debris or damage."},
      {"role": "technician", "content": "Found broken foot valve flap. Replaced it, pump primes now."}
    ]
  }
]
```

**cURL:**
```bash
curl -X POST https://nosignal-cloud-115075076514.us-central1.run.app/api/training/offline-conversations \
  -H 'Content-Type: application/json' \
  -d '[{"session_id":"s1","equipment_type":"irrigation_pump","turns":[{"role":"technician","content":"Pump won'\''t prime"},{"role":"technician","content":"Replaced foot valve, fixed"}]}]'
```

---

### `POST /api/training/gemma-infer`

Sends a prompt to the **Gemma 3 4B** model running on Cloud Run (GPU-accelerated, NVIDIA L4).

**Request body:**
```json
{
  "prompt": "A diesel genset won't start. Battery voltage 11.2V. Starter solenoid shows no continuity. What is the most likely fault? One diagnostic step please."
}
```

**Response:**
```json
{
  "model": "gemma3:4b",
  "endpoint": "https://gemma3-4b-115075076514.us-central1.run.app",
  "prompt": "...",
  "response": "The most likely fault is a failed starter solenoid..."
}
```

**cURL:**
```bash
curl -X POST https://nosignal-cloud-115075076514.us-central1.run.app/api/training/gemma-infer \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "Diesel genset won'\''t start, starter solenoid no continuity. One diagnostic step."}'
```

---

### `GET /api/training/status`

Returns Fleet Knowledge Store state and model configuration.

**cURL:**
```bash
curl https://nosignal-cloud-115075076514.us-central1.run.app/api/training/status
```

---

### `POST /api/training/retrain-from-fleet`

Aggregates all fleet entries → Gemini produces a **LoRA-style training summary**.
Requires at least one entry in the Fleet Knowledge Store (run `/continuous-learn` first).

**cURL:**
```bash
curl -X POST https://nosignal-cloud-115075076514.us-central1.run.app/api/training/retrain-from-fleet
```

---

## 5. Sync API Reference

Base path: `/api/sync`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/sync/` | Push a batch of `HandoffReport` objects from mobile |
| `GET`  | `/api/sync/fault-trees` | Pull all fleet fault-tree entries (accepts `?since=<ISO-8601>`) |
| `GET`  | `/api/sync/queue-status` | Fleet store entry count |
| `DELETE` | `/api/sync/fault-trees/{fault_id}` | Remove a poisoned entry |

---

## 6. Deployment Commands

### Prerequisites

```bash
# Authenticate
gcloud auth login
gcloud config set project deepmind-hack26blr-4285
gcloud config set run/region us-central1

# Enable APIs
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com
```

### Deploy nosignal-cloud (FastAPI backend)

```bash
cd cloud

# Deploy from source (uses Dockerfile)
gcloud run deploy nosignal-cloud \
  --source . \
  --project deepmind-hack26blr-4285 \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=<your_key> \
  --memory 512Mi \
  --cpu 1 \
  --timeout 120 \
  --max-instances 5
```

### Deploy Gemma 3 4B (GPU inference)

```bash
# Uses Google's pre-built Gemma image — GPU quota required
gcloud run deploy gemma3-4b \
  --image us-docker.pkg.dev/cloudrun/container/gemma/gemma3-4b \
  --cpu 8 \
  --memory 32Gi \
  --gpu 1 \
  --gpu-type nvidia-l4 \
  --region us-central1 \
  --project deepmind-hack26blr-4285 \
  --allow-unauthenticated
```

> [!IMPORTANT]
> If you see the GPU zonal redundancy quota error, answer `Y` to deploy with no zonal redundancy.
> To request full GPU quota: https://g.co/cloudrun/gpu-quota

### View services & logs

```bash
# List services
gcloud run services list --region us-central1 --project deepmind-hack26blr-4285

# Live logs
gcloud run services logs read nosignal-cloud --region us-central1 --limit 50
gcloud run services logs read gemma3-4b      --region us-central1 --limit 50
```

### Update env vars without redeploy

```bash
gcloud run services update nosignal-cloud \
  --region us-central1 \
  --update-env-vars GEMINI_API_KEY=<new_key>
```

---

## 7. Testing the APIs

### Quick smoke test (curl)

```bash
curl https://nosignal-cloud-115075076514.us-central1.run.app/health
curl https://nosignal-cloud-115075076514.us-central1.run.app/api/training/status
curl -X POST https://nosignal-cloud-115075076514.us-central1.run.app/api/training/gemma-infer \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "What causes a diesel genset to click but not crank?"}'
```

### Full automated test suite

```bash
pip install httpx

# Against live Cloud Run (reads URL from cloud/secrets.json automatically)
python scripts/test_training_apis.py

# Against local server
python scripts/test_training_apis.py --base-url http://localhost:8000

# Only Gemma tests with verbose output
python scripts/test_training_apis.py --only gemma --verbose

# Only training tests
python scripts/test_training_apis.py --only training --verbose
```

### Swagger UI (interactive, try-it-out buttons)

👉 **https://nosignal-cloud-115075076514.us-central1.run.app/docs**

---

## 8. How Continuous Learning Works End-to-End

```
1. 📱 Technician works offline
       └─ ReasoningLoop: SENSE → DECIDE → ACT → CHECK
       └─ 3 failures or safety keyword → DEFER
       └─ HandoffReport pushed to SyncQueue (AsyncStorage)

2. 📶 Phone reconnects
       └─ SyncQueue.drain() fires via NetInfo listener

3. ☁️  POST /api/sync/
       └─ Research Agent (Gemini Flash + web search)
       └─ Validation Agent (cross-check)
       └─ Distillation Agent → FaultTreeEntry stored

4. 📡 POST /api/training/continuous-learn
       └─ Gemini searches: "{equipment} {hypothesis} repair"
       └─ New FaultTreeEntry minted + stored in Fleet Store

5. 📥 GET /api/sync/fault-trees
       └─ All entries pulled into device LocalRagStore (SQLite)

6. 🧠 Next offline session
       └─ LocalRagStore returns freshly learned entry
       └─ Gemma resolves instantly — no cloud needed
       └─ "One technician's failure → every technician's instant answer"
```

> [!NOTE]
> **Gemma 3 4B (Cloud Run, NVIDIA L4)** serves as the cloud-side model twin for:
> - Testing prompts before shipping on-device
> - Generating high-quality training examples for the retraining pipeline
> - Heavier fallback inference when the device is online
