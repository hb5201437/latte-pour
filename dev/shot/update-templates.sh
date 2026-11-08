#!/bin/sh
# 重新量三个 GPU 模板并写回 patterns.js 的 FLUID（改了流体物理之后跑一次）
cd "$(dirname "$0")/../.."
for p in heart tulip rosetta; do NODE_PATH=dev/shot/node_modules node dev/shot/profile.mjs $p | tail -1 > /tmp/lp-prof-$p.json; done
python3 - <<'PY'
import json, re
p = 'patterns.js'; s = open(p).read()
def fmt(a): return ', '.join('[' + ', '.join(repr(v) for v in r) + ']' for r in a)
h = json.load(open('/tmp/lp-prof-heart.json'))
last = h[-1]
side = [round(last[0] + 0.03, 2), round((last[1] + last[2]) / 2, 2)]
s = re.sub(r"  heart: colsOutline\(\[.*?\]\], \[[^\]]*\]\),", "  heart: colsOutline([" + fmt(h) + "], " + json.dumps(side).replace(',', ', ') + "),", s, flags=re.S)
for k in ('tulip', 'rosetta'):
    a = json.load(open(f'/tmp/lp-prof-{k}.json'))
    s = re.sub(r"  %s: rowsOutline\(\[.*?\]\]\)," % k, "  %s: rowsOutline([" % k + fmt(a) + "]),", s, flags=re.S)
open(p, 'w').write(s)
PY
