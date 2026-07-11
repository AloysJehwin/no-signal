from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from google.cloud import storage

from cloud.schemas import TrainingLog

logger = logging.getLogger(__name__)


class GcsTrainingLogStore:
    """Writes and reads training logs to/from a Google Cloud Storage bucket."""

    def __init__(self, bucket_name: str | None = None) -> None:
        self.bucket_name = bucket_name
        self.client = storage.Client() if bucket_name else None

    def add_log(self, log: TrainingLog) -> None:
        if not self.bucket_name or not self.client:
            logger.warning("GCS log bucket not configured; skipping log write.")
            return

        try:
            bucket = self.client.bucket(self.bucket_name)
            # Create a unique filename: YYYY-MM-DD/HHMMSS_UUID.json
            timestamp_str = log.timestamp.strftime("%Y-%m-%d/%H%M%S")
            blob_name = f"{timestamp_str}_{log.log_id}.json"
            blob = bucket.blob(blob_name)
            
            # Serialize the Pydantic model to dict, then to JSON string
            # using model_dump_json to handle datetimes automatically
            blob.upload_from_string(
                log.model_dump_json(),
                content_type="application/json"
            )
            logger.info("Wrote training log to gs://%s/%s", self.bucket_name, blob_name)
        except Exception:
            logger.exception("Failed to write training log to GCS")

    def list_logs(self, limit: int = 50) -> list[TrainingLog]:
        if not self.bucket_name or not self.client:
            return []

        try:
            bucket = self.client.bucket(self.bucket_name)
            # List all blobs. In production, we'd paginate or filter by date prefix.
            blobs = list(bucket.list_blobs())
            # Sort by name descending (newest first based on timestamp prefix)
            blobs.sort(key=lambda b: b.name, reverse=True)
            
            logs = []
            for blob in blobs[:limit]:
                content = blob.download_as_string()
                data = json.loads(content)
                logs.append(TrainingLog(**data))
            return logs
        except Exception:
            logger.exception("Failed to list training logs from GCS")
            return []
