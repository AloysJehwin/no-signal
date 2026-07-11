"""Simulate an offline device coming online and syncing an unresolved case.

Constructs a fake HandoffReport matching ARCHITECTURE.md §3.3 / cloud/schemas.py,
POSTs it to the cloud /sync endpoint, then GETs /fault-trees and prints the newly
distilled entry.

Usage:
    python scripts/sync_demo.py                 # real network round-trip
    python scripts/sync_demo.py --dry-run       # print intended payload, no network
    python scripts/sync_demo.py --base-url URL  # override http://localhost:8000

Depends on httpx + stdlib only.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from typing import Any

import httpx


DEFAULT_BASE_URL = "http://localhost:8000"


def build_handoff_report() -> dict[str, Any]:
    """Fake HandoffReport for demo — matches ARCHITECTURE.md §3.3."""
    return {
        "session_id": "demo-session-0001",
        "equipment_type": "diesel_genset",
        "full_history": [
            {
                "step": "measure battery voltage at terminals",
                "expected": "12.4V or higher",
                "reported": "11.2V",
                "match": False,
            },
            {
                "step": "attempt jump-start from second battery",
                "expected": "engine cranks and starts",
                "reported": "cranks slowly, does not start",
                "match": False,
            },
            {
                "step": "test starter solenoid continuity",
                "expected": "continuity present when key turned",
                "reported": "no continuity",
                "match": False,
            },
        ],
        "ruled_out": ["fuel_starvation", "weak_battery"],
        "leading_hypothesis": "starter_solenoid_failure",
        "confidence": 0.35,
        "safety_flag": False,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def dump(label: str, payload: Any) -> None:
    print(f"\n=== {label} ===")
    print(json.dumps(payload, indent=2, default=str))


def run(base_url: str, dry_run: bool) -> int:
    report = build_handoff_report()
    dump("HandoffReport (outbound)", report)

    if dry_run:
        print("\n[dry-run] skipping network — would POST the above to", f"{base_url}/sync")
        return 0

    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(f"{base_url}/sync", json=[report])
            resp.raise_for_status()
            sync_response = resp.json()
            dump("SyncResponse", sync_response)

            trees = client.get(f"{base_url}/fault-trees")
            trees.raise_for_status()
            entries = trees.json()
    except httpx.HTTPError as exc:
        print(f"\n[error] network call failed: {exc}", file=sys.stderr)
        print(
            "Is the cloud running? Try:  cd cloud && uvicorn cloud.main:app --reload",
            file=sys.stderr,
        )
        return 1

    dump(f"/fault-trees ({len(entries)} total entries)", entries)

    distilled = sync_response.get("distilled", 0)
    rejected = sync_response.get("rejected", 0)
    if distilled:
        print(f"\n[ok] {distilled} new fault-tree entr{'y' if distilled == 1 else 'ies'} distilled.")
    if rejected:
        print(f"[warn] {rejected} report(s) rejected by Validation Agent (contradictory sources).")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help=f"cloud API base URL (default: {DEFAULT_BASE_URL})")
    parser.add_argument("--dry-run", action="store_true", help="print intended payload, no network calls")
    args = parser.parse_args()
    return run(args.base_url, args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
