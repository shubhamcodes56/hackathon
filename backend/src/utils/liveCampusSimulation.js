const LIVE_SIM_INTERVAL_MS = 60 * 1000;

function clamp(min, value, max) {
  return Math.max(min, Math.min(value, max));
}

function stableHash(input = '') {
  const str = String(input || '');
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0);
}

function minuteTick(now = Date.now()) {
  return Math.floor(now / LIVE_SIM_INTERVAL_MS);
}

function pseudoRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function getLiveSimulationMeta(now = Date.now()) {
  const tick = minuteTick(now);
  return {
    tick,
    refreshMs: LIVE_SIM_INTERVAL_MS,
    updatedAt: tick * LIVE_SIM_INTERVAL_MS,
  };
}

function simulateOccupancy({ key, baseOccupancy = 0, capacity = 0, now = Date.now(), drift = 0.12 }) {
  const cap = Math.max(1, Number(capacity) || 1);
  const base = clamp(0, Number(baseOccupancy) || 0, cap);
  const { tick } = getLiveSimulationMeta(now);

  const seed = stableHash(`${key}:${tick}`);
  const randomN = pseudoRandom(seed);
  const directional = (randomN * 2) - 1;
  const amplitude = Math.max(1, Math.round(cap * drift));
  const delta = Math.round(directional * amplitude);

  return clamp(0, base + delta, cap);
}

function simulateParkingStatus({ spotName, baseStatus = 'empty', now = Date.now() }) {
  const { tick } = getLiveSimulationMeta(now);
  const seed = stableHash(`parking:${spotName}:${tick}`);
  const randomN = pseudoRandom(seed);

  if (String(baseStatus).toLowerCase() === 'empty') {
    return randomN > 0.32 ? 'empty' : 'occupied';
  }
  return randomN > 0.62 ? 'empty' : 'occupied';
}

function parseTimeToMinutes(timeValue = '') {
  const [hh, mm] = String(timeValue || '').split(':');
  const h = Number(hh);
  const m = Number(mm);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return (h * 60) + m;
}

function getClassLiveLoad({
  classKey,
  expectedStudents = 0,
  roomCapacity = 0,
  startTime,
  endTime,
  nowTime,
  now = Date.now(),
}) {
  const cap = Math.max(1, Number(roomCapacity) || Number(expectedStudents) || 1);
  const expected = clamp(0, Number(expectedStudents) || 0, cap);
  const startMin = parseTimeToMinutes(startTime);
  const endMin = parseTimeToMinutes(endTime);
  const nowMin = parseTimeToMinutes(nowTime);

  const isTimeValid = Number.isFinite(startMin) && Number.isFinite(endMin) && Number.isFinite(nowMin);
  const isActive = isTimeValid ? nowMin >= startMin && nowMin <= endMin : false;

  const seedKey = `${classKey}:${startTime}:${endTime}`;
  const baseline = isActive ? Math.round(expected * 0.92) : Math.round(expected * 0.45);
  const simulated = simulateOccupancy({ key: seedKey, baseOccupancy: baseline, capacity: cap, now, drift: 0.1 });

  return {
    liveStudents: simulated,
    livePct: Math.round((simulated / cap) * 100),
    isActive,
  };
}

module.exports = {
  LIVE_SIM_INTERVAL_MS,
  getLiveSimulationMeta,
  simulateOccupancy,
  simulateParkingStatus,
  parseTimeToMinutes,
  getClassLiveLoad,
};
