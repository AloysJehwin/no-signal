from __future__ import annotations

from cloud.schemas import FaultTreeEntry


async def generate_illustration(entry: FaultTreeEntry) -> str:
    # TODO: call NB2 Lite; return a cache-friendly URL/path. Stub returns a
    # deterministic placeholder so the pipeline can be end-to-end demoed offline.
    return f"/media/illustrations/{entry.fault_id}.png"
