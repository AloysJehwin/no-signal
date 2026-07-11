# FieldFix Fault Trees

Seed knowledge base for the on-device Local RAG store. Each entry is a structured JSON fault-tree consumed by the SENSE-DECIDE-ACT-CHECK loop on the Android client and produced by the cloud Distillation Agent on sync. The canonical schema is defined in `docs/ARCHITECTURE.md` §3.3.

## Schema (summary)

Each entry (validated against `schema.json`, JSON Schema Draft 2020-12) has:

| Field | Type | Notes |
|---|---|---|
| `fault_id` | string (snake_case) | Unique. **Must equal the file name** (without `.json`). |
| `equipment_type` | enum | `diesel_genset` or `irrigation_pump`. |
| `symptoms` | string[] | Short phrases used for keyword/vector lookup against `SymptomInput`. |
| `hypotheses` | object[] | Ordered candidate hypotheses. Each has `name`, `diagnostic_step`, `expected_result`, `if_confirmed`, `if_ruled_out`. |
| `safety_flags` | string[] | Keywords that trigger the DEFER path when present in technician input. Leave empty (`[]`) when not warranted. |

See `schema.json` for full constraints (length limits, patterns, enums).

## Current entries

| File | Equipment | Fault |
|---|---|---|
| `genset_no_start_001.json` | diesel_genset | Won't start / no crank |
| `genset_runs_rough_002.json` | diesel_genset | Rough idle / stalling / misfire |
| `genset_overheating_003.json` | diesel_genset | High coolant temp / overheat shutdown |
| `pump_no_prime_004.json` | irrigation_pump | Won't prime / loses suction |
| `pump_low_flow_005.json` | irrigation_pump | Runs but low flow / low discharge pressure |
| `pump_electrical_fault_006.json` | irrigation_pump | Won't start electrically / trips breaker |

## Adding a new entry

1. Pick the next sequential ID for the equipment class, e.g. `genset_<slug>_004`.
2. Copy the closest existing entry as a template.
3. Set `fault_id` to the new ID and save the file as `<fault_id>.json` (they **must** match).
4. Keep `diagnostic_step` and `expected_result` concrete and measurable — voltages, pressures, clearances, visual markers with units. Avoid vague phrasing like "check the thing."
5. Order `hypotheses` from most likely / cheapest to test first to progressively more invasive.
6. Only populate `safety_flags` for genuinely dangerous scenarios (fire, electrical arc, high-pressure steam, fuel leak). Empty array is normal.
7. Validate before committing (see below).

## Validation

Install [`check-jsonschema`](https://github.com/python-jsonschema/check-jsonschema):

```bash
pipx install check-jsonschema
# or: pip install check-jsonschema
```

Validate a single file:

```bash
check-jsonschema --schemafile fault_trees/schema.json fault_trees/genset_no_start_001.json
```

Validate every entry in the directory:

```bash
check-jsonschema --schemafile fault_trees/schema.json fault_trees/*.json
```

The command exits non-zero on any violation and prints the offending JSON path. CI should run this on every PR that touches `fault_trees/`.

## Notes for the Distillation Agent

Any entry produced by the cloud Distillation Agent (see `docs/ARCHITECTURE.md` §4.1) **must** validate against the same `schema.json`. Reject and re-run distillation on validation failure — do not push malformed entries to the Fleet Knowledge Store.
