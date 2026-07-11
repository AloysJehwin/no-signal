from __future__ import annotations

from cloud.schemas import FaultTreeEntry


async def generate_video(entry: FaultTreeEntry) -> str:
    # TODO: call Omni Flash; return a cache-friendly URL/path. Stub returns a
    # deterministic placeholder so devices can prefetch without needing the
    # real generator during offline demos.
    return f"/media/videos/{entry.fault_id}.mp4"
