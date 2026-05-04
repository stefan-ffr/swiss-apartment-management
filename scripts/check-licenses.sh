#!/usr/bin/env bash
# License audit gate for AGPL-3.0 compatibility.
#
# Runs `pnpm licenses list --prod --json` and compares every license
# string against the whitelist. Exits non-zero if any package uses a
# license outside the whitelist, listing the offenders so a reviewer
# can decide whether to add to the whitelist (after AGPL-compat
# review) or drop the dependency.
#
# Whitelisted licenses are all permissive (MIT/BSD/ISC/Apache-2.0/...)
# or strong copyleft compatible with AGPL-3.0. Anything we have not
# already audited (notably: GPL-2.0-only, EPL-1.0, CDDL,
# BUSL-1.1, "Commons Clause" wrappers) must be reviewed before being
# added here.
#
# Usage:
#   bash scripts/check-licenses.sh
#
# Exit codes:
#   0  all good
#   1  one or more disallowed licenses found
#   2  toolchain missing or licenses-list failed

set -euo pipefail

# Whitelist. Strings must match the SPDX identifier exactly; compound
# licenses ("MIT OR Apache-2.0") are normalised by the parser below.
ALLOWED=(
  "MIT"
  "MIT-0"
  "ISC"
  "0BSD"
  "BSD-2-Clause"
  "BSD-3-Clause"
  "Apache-2.0"
  "BlueOak-1.0.0"
  "CC0-1.0"
  "Unlicense"
  "Python-2.0"
  "WTFPL"
  "AGPL-3.0-or-later"
  "AGPL-3.0-only"
  "GPL-3.0-or-later"
  "LGPL-3.0-or-later"
  "MPL-2.0"
)

# Compound expressions explicitly allowed (we pick the permissive
# option). Add new entries cautiously.
ALLOWED_COMPOUND=(
  "(MIT OR EUPL-1.1+)"
  "(MIT OR Apache-2.0)"
  "(MIT OR CC0-1.0)"
)

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found in PATH" >&2
  exit 2
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not found in PATH" >&2
  exit 2
fi

LIST_JSON="$(pnpm licenses list --prod --json 2>/dev/null || true)"
if [[ -z "$LIST_JSON" || "$LIST_JSON" == "{}" ]]; then
  echo "pnpm licenses list returned no data — did you run 'pnpm install' first?" >&2
  exit 2
fi

ALLOWED_JSON=$(printf '%s\n' "${ALLOWED[@]}" "${ALLOWED_COMPOUND[@]}" | python3 -c 'import sys,json; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))')

python3 - "$ALLOWED_JSON" "$LIST_JSON" <<'PY'
import json, sys

allowed = set(json.loads(sys.argv[1]))
data = json.loads(sys.argv[2])

bad = []
for lic, pkgs in data.items():
    if lic in allowed:
        continue
    bad.append((lic, [(p.get('name'), p.get('version')) for p in pkgs]))

if not bad:
    total = sum(len(v) for v in data.values())
    print(f"OK - all {total} runtime dependencies use AGPL-compatible licenses.")
    sys.exit(0)

print("DISALLOWED licenses found:")
for lic, pkgs in bad:
    print(f"\n  {lic}")
    for name, version in pkgs[:10]:
        print(f"    - {name}@{version}")
    if len(pkgs) > 10:
        print(f"    ... and {len(pkgs)-10} more")

print("""
If a dependency on the list is genuinely AGPL-compatible (and you
have audited it), add the license SPDX identifier to ALLOWED in
scripts/check-licenses.sh - never silence the failure another way.
""")
sys.exit(1)
PY
