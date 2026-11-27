"""Generate site/data/{categories,games}.json. Deterministic: same output every run."""
import json, os, random, sys, string
sys.path.insert(0, os.path.dirname(__file__))
from categories import CATEGORIES

NUM_GAMES, PER_GAME, MIN_MATCH = 1000, 7, 5
OUT = os.path.join(os.path.dirname(__file__), "..", "site", "data")

def letters(s): return "".join(c for c in s if c.isalpha())
def matches(item, k, v):
    t = letters(item)
    if not t: return False
    if k == "s": return item[0] == v
    if k == "e": return t[-1] == v
    if k == "c": return v in t
    if k == "short": return len(t) <= 5
    if k == "long": return len(t) >= 9
    if k == "two": return " " in item
    if k == "len": return len(t) == int(v)
    if k == "dbl": return any(a == b for a, b in zip(t, t[1:]))
    if k == "vow": return item[0] in "aeiou"
    if k == "s2": return item.replace(" ", "").startswith(v)
    if k == "e2": return t.endswith(v)
    return True

cats, names = [], list(CATEGORIES)
for n in names:
    q, items = CATEGORIES[n]
    seen, clean = set(), []
    for i in items:
        if i not in seen: seen.add(i); clean.append(i)
    cats.append({"name": n, "q": q, "items": clean})

prompts = []  # [cat_idx, kind, value]
for ci, c in enumerate(cats):
    items = c["items"]
    preds = [("", "")]
    preds += [("s", ch) for ch in string.ascii_lowercase]
    preds += [("e", ch) for ch in string.ascii_lowercase]
    preds += [("c", ch) for ch in string.ascii_lowercase]
    preds += [("short", ""), ("long", ""), ("two", ""), ("dbl", ""), ("vow", "")]
    preds += [("len", str(n)) for n in range(3, 13)]
    pre = {}
    for i in items:
        t = letters(i)
        if len(t) > 3: pre[t[:2]] = pre.get(t[:2], 0) + 1
    preds += [("s2", a) for a in sorted(pre)]
    suf = {}
    for i in items:
        t = letters(i)
        if len(t) > 3: suf[t[-2:]] = suf.get(t[-2:], 0) + 1
    preds += [("e2", a) for a in sorted(suf)]
    for k, v in preds:
        n = sum(matches(i, k, v) for i in items)
        if k == "" and len(items) < 12: continue  # tiny sets: skip plain prompt
        if k and (n < MIN_MATCH or n > len(items) * 0.6): continue
        if k == "" and False: continue
        prompts.append([ci, k, v])

rng = random.Random(1000)
pool = prompts[:]; rng.shuffle(pool)
games, queue = [], []
used_total = {}
for g in range(NUM_GAMES):
    pick, cats_used = [], set()
    tries = 0
    while len(pick) < PER_GAME:
        if not queue:
            queue = pool[:]; rng.shuffle(queue)
        p = queue.pop()
        if p[0] in cats_used and tries < 200:
            queue.insert(0, p); tries += 1; continue
        cats_used.add(p[0]); pick.append(p)
    games.append(pick)

os.makedirs(OUT, exist_ok=True)
json.dump(cats, open(os.path.join(OUT, "categories.json"), "w"), separators=(",", ":"))
json.dump({"perGame": PER_GAME, "games": games}, open(os.path.join(OUT, "games.json"), "w"), separators=(",", ":"))
flat = {tuple(p) for g in games for p in g}
print(f"{len(cats)} categories, {len(prompts)} unique prompts, {len(games)} games, "
      f"{len(flat)} distinct prompts used across {len(games)*PER_GAME} slots")
