# prep/ — data pipeline

Every JSON in `data/` is generated. Run these from the **repo root**, not from
inside `prep/`, because the scripts use paths like `data/all-india-states.json`.

```bash
cd gati-infra-map-visualizer-v3
python3 prep/build_all_india_health.py     # 1
python3 prep/build_all_india_language.py   # 2
python3 prep/build_all_india_rollups.py    # 3  always last
python3 prep/audit_pilot_nabh.py           # 4  independent, any time
```

## Why the order matters

Steps 1 and 2 each write a *point* file and nothing else. Step 3 reads **both**
of those point files, applies `data/manual-overrides.json`, and writes the three
tables the dashboard actually reads (`all-india-states.json`,
`all-india-cities.json`, `all-india-coverage.json`).

So if you re-run step 2 alone and stop, the point file is fresh but the state
and city tables still hold the previous run's totals, and the dashboard will
show stale counts. **Any time you touch a source or an override, finish with
step 3.**

Steps 1 and 2 are independent of each other and can run in either order.

| Script | Reads | Writes |
|---|---|---|
| `build_all_india_health.py` | workbook, `nabh_raw_rows.jsonl` | `all-india-health-points.json` |
| `build_all_india_language.py` | `prep/sources/*.tsv`, uploaded language JSON | `all-india-language-points.json` |
| `build_all_india_rollups.py` | both point files, `manual-overrides.json` | states, cities, coverage |
| `audit_pilot_nabh.py` | `infrastructure-cleaned.json`, `city-summary.json` | `pilot-nabh-audit.json` |
| `enrich_language_v3.py` | pilot layer | rewrites `infrastructure-cleaned.json`, `cities.json` |
| `normalize.py`, `reconcile_flags.py` | 15-city pilot sources | `infrastructure-cleaned.json` |

## Two source paths are absolute

`build_all_india_health.py` and `build_all_india_language.py` point at
`/mnt/user-data/uploads/...` for the workbook, the NABH JSONL and the uploaded
language JSON. Those files are **not in the repo** (the JSONL alone is 8 MB).
Before running on another machine, either move them into the repo and update the
constants at the top of each script, or set the env vars the language script
already supports (`ALL_INDIA_LANG_JSON`, `IISC_TSV_SRC`).

Everything in `prep/sources/` **is** in the repo and is hand-maintained — new
PDOT or SIIC centres go straight into the TSV, then step 2, then step 3.

## Hand corrections

`data/manual-overrides.json`, applied at step 3. See the `_readme` inside it.
Never hand-edit the generated point files; they are overwritten on every run.
