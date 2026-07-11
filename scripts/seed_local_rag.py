"""Read + validate all fault_trees/*.json and print the payload the mobile
LocalRagStore.upsertEntry() would consume.

This is the *seed-time* equivalent of what the cloud Distillation Agent produces
at sync-time. It does not actually push to the device — see the TODO block at
the bottom for the adb push mechanism to wire in.

Usage:
    python scripts/seed_local_rag.py
    python scripts/seed_local_rag.py --tree-dir /custom/path
    python scripts/seed_local_rag.py --schema fault_trees/schema.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_TREE_DIR = REPO_ROOT / "fault_trees"
DEFAULT_SCHEMA = DEFAULT_TREE_DIR / "schema.json"


def load_schema(path: Path) -> dict[str, Any]:
    with path.open() as f:
        return json.load(f)


def iter_tree_files(tree_dir: Path) -> list[Path]:
    return sorted(
        p for p in tree_dir.glob("*.json") if p.name not in {"schema.json"}
    )


def validate(entry: dict[str, Any], schema: dict[str, Any], source: Path) -> list[str]:
    """Best-effort structural validation using jsonschema if available, else
    fall back to a minimal required-keys check so this script runs on a bare
    Python install (useful for the seed step on the demo laptop)."""
    try:
        import jsonschema  # type: ignore

        validator = jsonschema.Draft202012Validator(schema)
        return [f"{source.name}: {err.message}" for err in validator.iter_errors(entry)]
    except ImportError:
        errors: list[str] = []
        for key in schema.get("required", []):
            if key not in entry:
                errors.append(f"{source.name}: missing required field '{key}'")
        return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tree-dir", type=Path, default=DEFAULT_TREE_DIR)
    parser.add_argument("--schema", type=Path, default=DEFAULT_SCHEMA)
    args = parser.parse_args()

    schema = load_schema(args.schema)
    files = iter_tree_files(args.tree_dir)
    if not files:
        print(f"[warn] no fault-tree files found in {args.tree_dir}", file=sys.stderr)
        return 1

    payload: list[dict[str, Any]] = []
    all_errors: list[str] = []

    for path in files:
        with path.open() as f:
            entry = json.load(f)
        errs = validate(entry, schema, path)
        if errs:
            all_errors.extend(errs)
            continue
        payload.append(entry)

    if all_errors:
        print("[fail] schema errors — refusing to emit seed payload:", file=sys.stderr)
        for e in all_errors:
            print(f"  - {e}", file=sys.stderr)
        return 2

    print(f"# LocalRagStore.upsertEntry() payload — {len(payload)} entr{'y' if len(payload) == 1 else 'ies'}")
    print(json.dumps(payload, indent=2))

    # TODO(hackathon): wire the actual adb-push flow to deliver this to the
    # device's app-private storage. Suggested sequence, to be implemented
    # once the mobile side lands its LocalRagStore init path:
    #
    #   1. Serialize `payload` to a temp file, e.g. /tmp/seed_local_rag.json
    #   2. adb push /tmp/seed_local_rag.json /data/local/tmp/seed_local_rag.json
    #   3. adb shell run-as com.fieldfix.app \
    #        cp /data/local/tmp/seed_local_rag.json files/seed_local_rag.json
    #   4. Launch the app with an intent extra that triggers
    #      LocalRagStore.upsertEntry(...) on each element of the JSON array.
    #
    # For now this script only emits the payload to stdout so it can be piped
    # into a manual `adb push` or a follow-up script.
    return 0


if __name__ == "__main__":
    sys.exit(main())
