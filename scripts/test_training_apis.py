#!/usr/bin/env python3
"""
scripts/test_training_apis.py
------------------------------
End-to-end test script for all /api/training/* and /api/sync/* endpoints.

Reads the Cloud Run URL from cloud/secrets.json automatically.

Usage:
    # Against the live Cloud Run deployment
    python scripts/test_training_apis.py

    # Against a local uvicorn instance
    python scripts/test_training_apis.py --base-url http://localhost:8000

    # Run only specific test groups
    python scripts/test_training_apis.py --only training
    python scripts/test_training_apis.py --only sync
    python scripts/test_training_apis.py --only gemma

    # Verbose mode (print full response bodies)
    python scripts/test_training_apis.py --verbose
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

import httpx

# ── Load secrets ──────────────────────────────────────────────────────────────

REPO_ROOT = Path(__file__).resolve().parent.parent
SECRETS_PATH = REPO_ROOT / "cloud" / "secrets.json"


def load_secrets() -> dict[str, Any]:
    if SECRETS_PATH.exists():
        with SECRETS_PATH.open() as f:
            return json.load(f)
    return {}


secrets = load_secrets()
DEFAULT_BASE_URL = secrets.get("cloud_run_nosignal_url", "http://localhost:8000")

# ── Helpers ───────────────────────────────────────────────────────────────────

PASS = "\033[92m✓ PASS\033[0m"
FAIL = "\033[91m✗ FAIL\033[0m"
results: list[tuple[str, bool, str]] = []


def run_test(
    label: str,
    client: httpx.Client,
    method: str,
    path: str,
    body: Any = None,
    expected_status: int = 200,
    verbose: bool = False,
    check_keys: list[str] | None = None,
) -> dict | None:
    url = f"{client.base_url}{path}"
    try:
        t0 = time.monotonic()
        resp = client.request(method, path, json=body, timeout=120)
        elapsed = time.monotonic() - t0
        ok = resp.status_code == expected_status
        status_icon = PASS if ok else FAIL
        print(f"  {status_icon}  [{method}] {url}  →  HTTP {resp.status_code}  ({elapsed:.2f}s)")
        data: dict = {}
        try:
            data = resp.json()
        except Exception:
            pass
        if verbose:
            print(f"       {json.dumps(data, indent=6, default=str)[:800]}")
        if ok and check_keys:
            missing = [k for k in check_keys if k not in data]
            if missing:
                print(f"       {FAIL}  missing keys: {missing}")
                ok = False
        results.append((label, ok, f"HTTP {resp.status_code}"))
        return data if ok else None
    except Exception as exc:
        print(f"  {FAIL}  [{method}] {url}  →  {exc}")
        results.append((label, False, str(exc)))
        return None


# ── Test groups ───────────────────────────────────────────────────────────────

def test_health(client: httpx.Client, verbose: bool) -> None:
    print("\n── Health ─────────────────────────────────────────────────────")
    run_test("health", client, "GET", "/health",
             check_keys=["status"], verbose=verbose)


def test_sync(client: httpx.Client, verbose: bool) -> None:
    print("\n── Sync API ───────────────────────────────────────────────────")
    run_test("sync/queue-status", client, "GET", "/api/sync/queue-status",
             check_keys=["total_entries", "status"], verbose=verbose)
    run_test("sync/fault-trees", client, "GET", "/api/sync/fault-trees",
             verbose=verbose)

    report = {
        "session_id": "test-session-001",
        "equipment_type": "diesel_genset",
        "full_history": [
            {"step": "measure battery voltage", "expected": ">12V", "reported": "11.2V", "match": False},
            {"step": "test starter solenoid", "expected": "continuity present", "reported": "no continuity", "match": False},
        ],
        "ruled_out": ["fuel_starvation", "weak_battery"],
        "leading_hypothesis": "starter_solenoid_failure",
        "confidence": 0.35,
        "safety_flag": False,
        "timestamp": "2026-07-11T06:00:00Z",
    }
    sync_data = run_test("sync/post-report", client, "POST", "/api/sync/",
                         body=[report],
                         check_keys=["accepted", "distilled", "rejected", "entries"],
                         verbose=verbose)
    run_test("sync/fault-trees-after-sync", client, "GET", "/api/sync/fault-trees",
             verbose=verbose)
    if sync_data and sync_data.get("entries"):
        fault_id = sync_data["entries"][0]["fault_id"]
        run_test("sync/delete-entry", client, "DELETE",
                 f"/api/sync/fault-trees/{fault_id}",
                 expected_status=200, verbose=verbose)


def test_training(client: httpx.Client, verbose: bool) -> None:
    print("\n── Training API ───────────────────────────────────────────────")
    run_test("training/status", client, "GET", "/api/training/status",
             check_keys=["status", "total_fleet_entries", "gemini_api_configured",
                         "gemma_cloud_run_configured"],
             verbose=verbose)

    run_test(
        "training/continuous-learn",
        client, "POST", "/api/training/continuous-learn",
        body={"query": "diesel genset won't start clicking noise", "equipment_type": "diesel_genset"},
        check_keys=["status", "new_entries_generated", "data"],
        verbose=verbose,
    )

    conversations = [
        {
            "session_id": "offline-conv-001",
            "equipment_type": "irrigation_pump",
            "turns": [
                {"role": "technician", "content": "The pump won't prime, tried filling the casing twice."},
                {"role": "agent", "content": "Check foot valve for debris or damage."},
                {"role": "technician", "content": "Found broken foot valve flap. Replaced it, pump primes now."},
            ],
        }
    ]
    run_test(
        "training/offline-conversations",
        client, "POST", "/api/training/offline-conversations",
        body=conversations,
        check_keys=["status", "new_entries_generated", "data"],
        verbose=verbose,
    )
    run_test("training/retrain-from-fleet", client, "POST", "/api/training/retrain-from-fleet",
             verbose=verbose)

    print("\n── Training Logs API ──────────────────────────────────────────")
    logs = run_test("training/logs", client, "GET", "/api/training/logs",
             check_keys=[], verbose=verbose)
    if logs is not None and isinstance(logs, list) and verbose:
        print(f"       Found {len(logs)} logs in GCS bucket.")


def test_gemma(client: httpx.Client, verbose: bool) -> None:
    print("\n── Gemma 3 4B Cloud Run Inference ─────────────────────────────")
    data = run_test(
        "training/gemma-infer",
        client, "POST", "/api/training/gemma-infer",
        body={"prompt": (
            "A diesel genset won't start. Battery voltage is 11.2V. "
            "Starter solenoid shows no continuity. What is the most likely fault? "
            "Give one diagnostic step in plain English."
        )},
        check_keys=["model", "response"],
        verbose=verbose,
    )
    if data and verbose:
        print(f"\n       Gemma response preview:\n       {data.get('response', '')[:300]}")


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL,
                        help=f"Cloud backend base URL (default: {DEFAULT_BASE_URL})")
    parser.add_argument("--only", choices=["health", "sync", "training", "gemma"],
                        help="Run only one test group")
    parser.add_argument("--verbose", action="store_true",
                        help="Print full response bodies")
    args = parser.parse_args()

    print(f"\n🔬 no-signal API Test Suite")
    print(f"   Target: {args.base_url}\n")

    with httpx.Client(base_url=args.base_url, timeout=120) as client:
        if not args.only or args.only == "health":
            test_health(client, args.verbose)
        if not args.only or args.only == "sync":
            test_sync(client, args.verbose)
        if not args.only or args.only == "training":
            test_training(client, args.verbose)
        if not args.only or args.only == "gemma":
            test_gemma(client, args.verbose)

    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"\n── Summary ─────────────────────────────────────────────────────")
    for label, ok, msg in results:
        icon = PASS if ok else FAIL
        print(f"  {icon}  {label}  ({msg})")
    print(f"\n  {passed}/{total} tests passed")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
