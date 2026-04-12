const AMENITY_CAPACITY = {
  Canteen1: 40,
  Canteen2: 40,
  Library: 60,
};

const amenityLiveState = {
  Canteen1: { occupancy: 14, history: [14] },
  Canteen2: { occupancy: 21, history: [21] },
  Library: { occupancy: 28, history: [28] },
  lastUpdatedAt: Date.now(),
};

function clamp(min, value, max) {
  return Math.max(min, Math.min(value, max));
}

function updateAmenitySimulationTick() {
  const keys = ['Canteen1', 'Canteen2', 'Library'];
  keys.forEach((name) => {
    const cap = AMENITY_CAPACITY[name];
    const current = amenityLiveState[name].occupancy;

    const target = Math.round(cap * 0.55);
    const bias = current < target ? 1 : (current > target ? -1 : 0);
    const noise = Math.floor(Math.random() * 5) - 2;
    const delta = bias + noise;

    const next = clamp(0, current + delta, cap);
    amenityLiveState[name].occupancy = next;
    amenityLiveState[name].history.push(next);
    if (amenityLiveState[name].history.length > 8) {
      amenityLiveState[name].history.shift();
    }
  });
  amenityLiveState.lastUpdatedAt = Date.now();
}

setInterval(updateAmenitySimulationTick, 60 * 1000);

function getTrendDelta(history) {
  if (!Array.isArray(history) || history.length < 2) return 0;
  if (history.length >= 3) {
    const deltas = [];
    for (let i = 1; i < history.length; i++) deltas.push(history[i] - history[i - 1]);
    return deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
  }
  return history[history.length - 1] - history[history.length - 2];
}

function getAmenitySimulationSnapshot() {
  const names = ['Canteen1', 'Canteen2', 'Library'];
  const records = names.map((name) => {
    const cap = AMENITY_CAPACITY[name];
    const occ = amenityLiveState[name].occupancy;
    const emptyPct = Math.round(((cap - occ) / cap) * 100);
    const filledPct = 100 - emptyPct;

    const trendDelta = getTrendDelta(amenityLiveState[name].history);
    const projectedTicks = 15;
    const damping = 0.2;
    const predictedOcc15m = clamp(0, Math.round(occ + (trendDelta * projectedTicks * damping)), cap);
    const predictedEmpty15m = Math.round(((cap - predictedOcc15m) / cap) * 100);

    const suggestion = emptyPct >= 55
      ? 'Best time to go now.'
      : emptyPct >= 30
        ? 'Moderate crowd; still manageable.'
        : 'Crowded right now; consider another option.';

    return {
      name,
      capacity: cap,
      occupancy: occ,
      emptyPct,
      filledPct,
      predictedOcc15m,
      predictedEmpty15m,
      suggestion,
    };
  });

  return {
    updatedAt: amenityLiveState.lastUpdatedAt,
    records,
  };
}

module.exports = {
  AMENITY_CAPACITY,
  getAmenitySimulationSnapshot,
  SIMULATION_REFRESH_MS: 60 * 1000,
};
