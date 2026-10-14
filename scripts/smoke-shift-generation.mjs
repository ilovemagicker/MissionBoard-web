import assert from "node:assert/strict";

const MAX = 400;

function toDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function enumerateDayKeys(startKey, endKey, maxDays = MAX) {
  const [ys, ms, ds] = startKey.split("-").map(Number);
  const [ye, me, de] = endKey.split("-").map(Number);
  let cur = new Date(ys, ms - 1, ds);
  const end = new Date(ye, me - 1, de);
  if (end < cur) return { days: [startKey], capped: false };
  const days = [];
  let capped = false;
  while (cur <= end) {
    if (days.length >= maxDays) {
      capped = true;
      break;
    }
    days.push(toDateKey(cur));
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
  return { days, capped };
}

const r = enumerateDayKeys("2026-01-01", "2026-01-03");
assert.equal(r.days.length, 3);
assert.equal(r.capped, false);

const big = enumerateDayKeys("2026-01-01", "2028-01-01");
assert.equal(big.days.length, 400);
assert.equal(big.capped, true);

console.log("smoke-shift-generation: ok");
