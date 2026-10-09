#!/usr/bin/env bash
# code/run_pipeline.sh — the ONE official pipeline for brazil_caps.
#
# CONTRACT (skills/pipeline/SKILL.md):
#   1. fingerprint every tracked artifact (SHA-256)
#   2. run every official step, from raw data
#   3. fingerprint again
#   4. write audits/pipeline_runs/run_<stamp>.json with a per-artifact verdict:
#        confirmed  — existed before, rewritten, byte-identical: REPRODUCED
#        changed    — rewritten and now different: the prior version was inaccurate
#        missing    — existed before, not produced now: orphan
#        untouched  — on disk, mtime unchanged: no official step rewrote it
#        new        — did not exist before, does now
#
# Anything NOT named here is not official. Run from the project root.
#
# LIVE PROGRESS: this script also maintains audits/pipeline_runs/current.json,
# rewritten before each step and once at the end. The dashboard polls it so a
# run in progress is visible while it happens, instead of only afterwards. The
# file carries its own pid, so a runner that was killed mid-flight reads as
# stale rather than as still-running forever.
#
# NOTE ON STEP 7b: 31_csdid_main.R refuses to run without
# ACKNOWLEDGE_DID_VERSION_GAP=1, because the installed did (2.1.1) is behind
# upstream (2.5.1). The acknowledgement is set here so the official pipeline can
# run, and the gap is recorded in analyses/brazil_caps/checklist.md as an open
# gate with a documented consequence (Step 8d cannot run at all on 2.1.1).
set -uo pipefail

STAMP="$(date +%Y%m%d_%H%M%S)"
REPORT_DIR="audits/pipeline_runs"
REPORT="$REPORT_DIR/run_${STAMP}.json"
STATUS="$REPORT_DIR/current.json"
mkdir -p "$REPORT_DIR" data/clean data/derived output/figures output/tables

# Every artifact the pipeline is responsible for.
#
# PDFs are DELIBERATELY not tracked. A PDF writer embeds a creation timestamp, so a
# re-generated PDF is never byte-identical and every run would report CHANGED --
# turning the verdict badge into noise. The byte-verdict is taken on the PNG; the
# PDF is the same figure in another container. Recorded here rather than silently
# dropped, because "we stopped checking that" is exactly what should stay legible.
ARTIFACTS=(
  data/clean/brazil_bite_panel.rds
  data/derived/br_states.geojson
  data/derived/gvar_county.csv
  data/derived/panel_clean.csv
  data/derived/panel_clean_notes.txt
  data/derived/panel_falsif.csv
  data/derived/panel_falsif_notes.txt
  data/derived/power_notes.txt
  data/derived/csdid_main.rds
  data/derived/csdid_main_dynamic.rds
  data/derived/csdid_falsif.rds
)
for f in output/figures/*.png output/tables/*; do
  [ -e "$f" ] && ARTIFACTS+=("$f")
done

# --- the official steps, in dependency order ---------------------------------
STEPS=(
  "bash scripts/verify-raw.sh data/raw"
  "Rscript scripts/r/00_bite_inspect.R"
  "Rscript scripts/r/01_bite_national_trends.R"
  "Rscript scripts/r/02_bite_maps.R"
  "Rscript scripts/r/06_power.R"
  "Rscript scripts/r/30_build_gvar.R"
  "Rscript scripts/r/30b_build_panel_clean.R"
  "Rscript scripts/r/30c_build_panel_falsif.R"
  "ACKNOWLEDGE_DID_VERSION_GAP=1 Rscript scripts/r/31_csdid_main.R"
  "Rscript scripts/r/32_csdid_falsif.R"
)
NSTEPS=${#STEPS[@]}

# --- live status file ---------------------------------------------------------
write_status() {   # state, step_index, cmd, ok(true/false/""), total_seconds("")
  python3 - "$STATUS" "$STAMP" "$$" "$NSTEPS" "$1" "$2" "$3" "$4" "$START" "$5" <<'PY'
import json, sys
p, stamp, pid, nsteps, state, step, cmd, ok, started, tot = sys.argv[1:11]
d = {"stamp": stamp, "state": state, "pid": int(pid), "total_steps": int(nsteps),
     "current_step": int(step), "current_cmd": (cmd or None), "started": int(started)}
if ok in ("true", "false"):
    d["ok"] = (ok == "true")
if tot:
    d["total_seconds"] = int(tot)
json.dump(d, open(p, "w"), indent=1)
PY
}

# --- 1. fingerprint before ----------------------------------------------------
BEFORE="$(mktemp)"; AFTER="$(mktemp)"
snap() {
  local out="$1"
  : > "$out"
  for f in "${ARTIFACTS[@]}"; do
    if [ -f "$f" ]; then
      printf '%s\t%s\t%s\n' "$f" "$(shasum -a 256 "$f" | cut -d' ' -f1)" "$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f")" >> "$out"
    fi
  done
}
snap "$BEFORE"

START=$(date +%s)
LOG="$REPORT_DIR/run_${STAMP}.log"
: > "$LOG"
FAILED=""
STEP_SECONDS=""
write_status running 0 "" "" ""
i=0
for cmd in "${STEPS[@]}"; do
  i=$((i + 1))
  write_status running "$i" "$cmd" "" ""
  echo "=== [$i/$NSTEPS] $cmd" | tee -a "$LOG"
  step_start=$(date +%s)
  if eval "$cmd" >> "$LOG" 2>&1; then
    echo "--- ok in $(( $(date +%s) - step_start ))s" | tee -a "$LOG"
  else
    echo "!!! STEP FAILED: $cmd" | tee -a "$LOG"
    FAILED="$cmd"
    break
  fi
done
TOTAL=$(( $(date +%s) - START ))

if [ -n "$FAILED" ]; then OKVAL=false; else OKVAL=true; fi
write_status finished "$i" "" "$OKVAL" "$TOTAL"

# --- 3. fingerprint after -----------------------------------------------------
snap "$AFTER"

# --- 4. verdicts --------------------------------------------------------------
python3 - "$BEFORE" "$AFTER" "$REPORT" "$STAMP" "$TOTAL" "$FAILED" "$NSTEPS" "$i" <<'PY'
import json, sys
before_p, after_p, report_p, stamp, total, failed, nsteps, ran = sys.argv[1:9]

def load(p):
    d = {}
    for line in open(p):
        path, sha, mtime = line.rstrip("\n").split("\t")
        d[path] = (sha, mtime)
    return d

b, a = load(before_p), load(after_p)
verdicts = {}
for path in sorted(set(b) | set(a)):
    was, now = b.get(path), a.get(path)
    if was and not now:
        v, note = "missing", "existed before, not produced by this run"
    elif not was and now:
        v, note = "new", "did not exist before this run"
    elif was and now:
        if was[1] == now[1]:
            v, note = "untouched", "mtime unchanged: no official step rewrote it"
        elif was[0] == now[0]:
            v, note = "confirmed", "rewritten and byte-identical: reproduced"
        else:
            v, note = "changed", "rewritten and different: the prior version was inaccurate"
    else:
        continue
    verdicts[path] = {"verdict": v, "note": note, "sha256_before": was[0] if was else None,
                      "sha256_after": now[0] if now else None}

json.dump({
    "run": stamp,
    "all_steps_ok": (failed is None or failed == ""),
    "steps_ran": int(ran),
    "steps_total": int(nsteps),
    "total_seconds": int(total),
    "failed_step": failed or None,
    "artifacts_tracked": len(verdicts),
    "counts": {v: sum(1 for x in verdicts.values() if x["verdict"] == v)
               for v in ("confirmed", "changed", "missing", "untouched", "new")},
    "verdicts": verdicts,
}, open(report_p, "w"), indent=2)
print("wrote", report_p)
PY

echo
echo "==================== PIPELINE SUMMARY ===================="
python3 - "$REPORT" <<'PY'
import json, sys
r = json.load(open(sys.argv[1]))
c = r["counts"]
print(f"run {r['run']}  in {r['total_seconds']}s  "
      f"steps {r['steps_ran']}/{r['steps_total']}  failed_step={r['failed_step']}")
print("  " + "  ".join(f"{k}={v}" for k, v in c.items()))
for path, d in sorted(r["verdicts"].items()):
    if d["verdict"] in ("changed", "missing"):
        print(f"  [{d['verdict'].upper()}] {path} — {d['note']}")
PY
echo "========================================================="
[ -n "$FAILED" ] && exit 1
exit 0
