#!/usr/bin/env bash
# Run `npm run build`, extract the ESLint warnings block, and diff it
# against the committed baseline at docs/build-baseline.txt. Use this
# instead of `CI=true npm run build` - CI mode turns every pre-existing
# warning into a build failure, which makes an unrelated change look like it
# broke something (see REFACTOR_PLAN.md's Phase 3 resume notes).
#
# Fixed repo path + fixed output location so the Bash invocation is stable
# across sessions and can be allowlisted once
# (Bash(bash scripts/check-build.sh *)).
#
# Usage:
#   scripts/check-build.sh                 build, diff against baseline
#   scripts/check-build.sh --update-baseline   also overwrite the baseline
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASELINE="$REPO_ROOT/docs/build-baseline.txt"
TMP_DIR="$REPO_ROOT/.tmp"
RAW_OUT="$TMP_DIR/build-output.txt"
WARNINGS_OUT="$TMP_DIR/build-warnings.txt"

mkdir -p "$TMP_DIR"
cd "$REPO_ROOT"

npm run build > "$RAW_OUT" 2>&1
BUILD_EXIT=$?

# Isolate the ESLint warnings block: everything between "[eslint]" and
# "Search for the keywords..." - excludes the deprecation/Browserslist
# preamble and the file-size/deployment footer, which change on every build
# and would otherwise swamp the diff with noise.
awk '/^\[eslint\]/{flag=1; next} /^Search for the keywords/{flag=0} flag' "$RAW_OUT" > "$WARNINGS_OUT"

if [ "$BUILD_EXIT" -ne 0 ]; then
    echo "=== BUILD FAILED (exit $BUILD_EXIT) - see $RAW_OUT ==="
    tail -40 "$RAW_OUT"
    exit "$BUILD_EXIT"
fi

if [ ! -f "$BASELINE" ]; then
    echo "No baseline at $BASELINE yet - run with --update-baseline to create one."
    echo "Warning count this build: $(grep -c '  Line ' "$WARNINGS_OUT")"
else
    if diff -q "$BASELINE" "$WARNINGS_OUT" >/dev/null; then
        echo "No warning changes vs baseline ($(grep -c '  Line ' "$WARNINGS_OUT") warnings, matches $BASELINE)."
    else
        echo "=== Warning diff vs baseline ($BASELINE) ==="
        diff "$BASELINE" "$WARNINGS_OUT" || true
        echo "---"
        echo "Baseline: $(grep -c '  Line ' "$BASELINE") warnings. This build: $(grep -c '  Line ' "$WARNINGS_OUT") warnings."
        echo "If every changed line is explained by a move/rename (not a genuinely new or removed warning), update the baseline: scripts/check-build.sh --update-baseline"
    fi
fi

if [ "${1:-}" = "--update-baseline" ]; then
    cp "$WARNINGS_OUT" "$BASELINE"
    echo "Baseline updated: $BASELINE"
fi

exit 0
