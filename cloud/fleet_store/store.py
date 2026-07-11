from __future__ import annotations

import threading
from datetime import datetime, timezone

from cloud.schemas import FaultTreeEntry


class FleetKnowledgeStore:
    """In-memory fleet-wide fault-tree store.

    Process-singleton: instantiating twice returns the same underlying data.
    TODO: swap the in-memory dict for Firestore or Postgres before deploying
    beyond the hackathon demo — the public methods here are the contract that
    downstream callers (pipeline, /fault-trees endpoint) rely on.
    """

    _instance: FleetKnowledgeStore | None = None
    _lock = threading.Lock()

    def __new__(cls) -> FleetKnowledgeStore:
        with cls._lock:
            if cls._instance is None:
                inst = super().__new__(cls)
                inst._entries = {}  # type: ignore[attr-defined]
                inst._entry_lock = threading.Lock()  # type: ignore[attr-defined]
                cls._instance = inst
            return cls._instance

    def add_entry(self, entry: FaultTreeEntry) -> None:
        if entry.created_at is None:
            entry.created_at = datetime.now(timezone.utc)
        with self._entry_lock:  # type: ignore[attr-defined]
            self._entries[entry.fault_id] = entry  # type: ignore[attr-defined]

    def list_entries(self, since: datetime | None = None) -> list[FaultTreeEntry]:
        with self._entry_lock:  # type: ignore[attr-defined]
            entries = list(self._entries.values())  # type: ignore[attr-defined]
        if since is None:
            return entries
        cutoff = since if since.tzinfo else since.replace(tzinfo=timezone.utc)
        return [e for e in entries if e.created_at is not None and e.created_at >= cutoff]

    def clear(self) -> None:
        # Test helper; not part of the production contract.
        with self._entry_lock:  # type: ignore[attr-defined]
            self._entries.clear()  # type: ignore[attr-defined]
