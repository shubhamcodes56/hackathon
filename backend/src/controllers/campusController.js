const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const { getAmenitySimulationSnapshot } = require('../utils/liveAmenitySimulation');
const {
  getLiveSimulationMeta,
  simulateOccupancy,
  simulateParkingStatus,
  getClassLiveLoad,
} = require('../utils/liveCampusSimulation');

const bookingsPath = path.join(__dirname, '../../data/workspace_bookings.json');

function ensureBookingsFile() {
  const dir = path.dirname(bookingsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(bookingsPath)) fs.writeFileSync(bookingsPath, JSON.stringify({}, null, 2));
}

function readBookings() {
  try {
    ensureBookingsFile();
    const raw = fs.readFileSync(bookingsPath, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (_err) {
    return {};
  }
}

function writeBookings(payload) {
  ensureBookingsFile();
  fs.writeFileSync(bookingsPath, JSON.stringify(payload, null, 2));
}

function safeInt(n, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function pct(occ, cap, fallback = null) {
  const o = safeInt(occ, 0);
  const c = safeInt(cap, 0);
  if (c <= 0) return fallback;
  return Math.max(0, Math.min(100, Math.round((o / c) * 100)));
}

function roomZoneFromDistance(distanceFromMain) {
  const d = safeInt(distanceFromMain, 0);
  if (d <= 20) return 'Academic Core';
  if (d <= 50) return 'Central Spine';
  if (d <= 80) return 'North Wing';
  return 'Outer Ring';
}

async function queryRows(sql, params = []) {
  try {
    const result = await db.query(sql, params);
    return result?.rows || [];
  } catch (_err) {
    return [];
  }
}

async function getRoomsData() {
  const classrooms = await queryRows(`
    SELECT
      id,
      room_name,
      distance_from_main,
      capacity,
      current_occupancy,
      COALESCE(current_occupancy::float / NULLIF(capacity, 0) * 100, 0) AS fullness_pct,
      status
    FROM classrooms
    ORDER BY COALESCE(current_occupancy::float / NULLIF(capacity, 0), 0) ASC
  `);

  return classrooms.map((c) => {
    const cap = safeInt(c.capacity, 0);
    const liveOcc = simulateOccupancy({
      key: `room:${c.id || c.room_name}`,
      baseOccupancy: safeInt(c.current_occupancy, 0),
      capacity: cap,
      drift: 0.14,
    });
    const fullness = pct(liveOcc, cap, 0);
    return {
      name: c.room_name || `Room ${c.id}`,
      location: roomZoneFromDistance(c.distance_from_main),
      occupancy: liveOcc,
      capacity: cap,
      fullnessPct: fullness,
      isAvailable: c.status === 'open',
      distance: c.distance_from_main || 300
    };
  });
}

async function getParkingData() {
  const spots = await queryRows(`
    SELECT spot_name, status, distance_from_main
    FROM parking_spots
  `);
  
  const simulatedSpots = spots.map((s) => ({
    ...s,
    live_status: simulateParkingStatus({
      spotName: s.spot_name,
      baseStatus: s.status,
    }),
  }));

  const free = simulatedSpots.filter((s) => s.live_status === 'empty').length;
  // Dashboard expects zones, so we aggregate our individual spots into one "zone"
  return [{
    zone: 'Main Campus Parking',
    free: free,
    total: simulatedSpots.length || 1,
    spots: simulatedSpots
  }];
}

async function getAmenitiesData() {
  const snapshot = getAmenitySimulationSnapshot();
  const students = await queryRows(`SELECT COUNT(*)::int AS total_students FROM people WHERE type = 'student'`);
  const totalStudents = Number(students[0]?.total_students || 100);

  return snapshot.records.map((r) => {
    const studentSharePct = Math.round((Number(r.occupancy || 0) / Math.max(1, totalStudents)) * 100);
    return {
      name: r.name,
      occupancy: Number(r.occupancy || 0),
      capacity: Number(r.capacity || 1),
      emptyPct: Number(r.emptyPct || 0),
      filledPct: Number(r.filledPct || 0),
      predictedEmpty15m: Number(r.predictedEmpty15m || 0),
      studentsPct: studentSharePct,
      suggestion: r.suggestion,
      updatedAt: snapshot.updatedAt
    };
  });
}

function formatClock(date) {
  const h = date.getHours();
  const m = date.getMinutes();
  const hh = ((h + 11) % 12) + 1;
  const mm = m < 10 ? `0${m}` : `${m}`;
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${hh}:${mm} ${ampm}`;
}

function safePct(n, fallback = 0) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(100, Math.round(v)));
}

async function getTimetableRows(day, time) {
  const rows = await queryRows(
    `
      SELECT t.id, t.day, t.time_slot, t.room_name, t.course as course_code, t.course as course_name, t.instructor, t.expected_students,
             SPLIT_PART(t.time_slot, '-', 1) AS start_time,
             SPLIT_PART(t.time_slot, '-', 2) AS end_time
      FROM timetable t
      WHERE t.day = $1 AND TO_TIMESTAMP(SPLIT_PART(t.time_slot, '-', 2), 'HH24:MI')::time >= $2::time
      ORDER BY TO_TIMESTAMP(SPLIT_PART(t.time_slot, '-', 1), 'HH24:MI')::time ASC
      LIMIT 10
    `,
    [day, time]
  );

  return rows.map((row) => {
    const load = getClassLiveLoad({
      classKey: `${row.course_code || row.course_name || 'CLASS'}:${row.room_name || 'ROOM'}`,
      expectedStudents: safeInt(row.expected_students, 0),
      roomCapacity: Math.max(1, safeInt(row.expected_students, 0)),
      startTime: row.start_time,
      endTime: row.end_time,
      nowTime: String(time || '').slice(0, 5),
    });

    return {
      ...row,
      live_expected_students: load.liveStudents,
      live_expected_pct: load.livePct,
      live_is_active: load.isActive,
    };
  });
}

function buildLiveSimulationInfo({ rooms = [], parking = [], amenities = [], timetableRows = [] }) {
  const meta = getLiveSimulationMeta();
  const totalFreeParking = parking.reduce((sum, p) => sum + safeInt(p.free, 0), 0);
  const totalParking = parking.reduce((sum, p) => sum + safeInt(p.total, 0), 0);
  const avgRoomFullness = rooms.length
    ? Math.round(rooms.reduce((sum, r) => sum + safeInt(r.fullnessPct, 0), 0) / rooms.length)
    : 0;

  return {
    refreshSeconds: 60,
    updatedAt: new Date(meta.updatedAt).toISOString(),
    tick: meta.tick,
    summary: {
      roomsTracked: rooms.length,
      avgRoomFullness,
      parkingFree: totalFreeParking,
      parkingTotal: totalParking,
      activeLectures: timetableRows.filter((row) => Boolean(row.live_is_active)).length,
      amenitiesTracked: amenities.length,
    },
  };
}

function computeNextMoveFromData(rooms, parking, amenities = []) {
  const availableRooms = rooms
    .filter((r) => r.capacity > 0)
    .sort((a, b) => safeInt(a.fullnessPct, 100) - safeInt(b.fullnessPct, 100));

  const bestRoom = availableRooms[0] || {
    name: 'No room data yet',
    location: 'Campus',
    occupancy: 0,
    capacity: 0,
    fullnessPct: 0,
    isAvailable: true
  };

  const bestParking = parking[0] || { zone: 'Main Parking', free: 0, total: 0 };
  const startsInMin = 10 + Math.floor(Math.random() * 16);
  const walkTimeMin = 4 + Math.floor(Math.random() * 7);
  const confidence = Math.max(70, Math.min(97, 80 + Math.floor((100 - safeInt(bestRoom.fullnessPct, 0)) / 4)));

  const bestAmenity = [...amenities].sort((a, b) => safeInt(b.emptyPct, 0) - safeInt(a.emptyPct, 0))[0];
  const busiestAmenity = [...amenities].sort((a, b) => safeInt(b.filledPct, 0) - safeInt(a.filledPct, 0))[0];
  const amenityHint = bestAmenity
    ? ` Best amenity now: ${bestAmenity.name} (${bestAmenity.emptyPct}% empty).`
    : '';

  const cautionHint = busiestAmenity && safeInt(busiestAmenity.filledPct, 0) >= 70
    ? ` Avoid ${busiestAmenity.name} for the next 10-15 min (${busiestAmenity.filledPct}% occupied).`
    : '';

  const tip = safeInt(bestRoom.fullnessPct, 0) <= 35
    ? `Great time to move now. ${bestRoom.name} is mostly empty.`
    : safeInt(bestRoom.fullnessPct, 0) <= 65
      ? `Balanced occupancy now. Reach a few minutes early for better seats.`
      : `Crowd rising. Leave early to avoid congestion near ${bestRoom.location}.`;

  return {
    location: bestRoom.location,
    roomLabel: `${bestRoom.name} · Live campus signal`,
    startsIn: `${startsInMin} min`,
    walkTime: `${walkTimeMin} min`,
    parking: `${bestParking.zone} — ${bestParking.free} spots`,
    roomOccupancy: `${safeInt(bestRoom.fullnessPct, 0)}% filled`,
    confidence,
    tip: `${tip}${amenityHint}${cautionHint}`.trim(),
    explainLines: [
      `Room signal: ${bestRoom.name} at ${safeInt(bestRoom.fullnessPct, 0)}% filled`,
      `Parking signal: ${bestParking.zone} has ${safeInt(bestParking.free, 0)} free spots`,
      bestAmenity ? `Amenity signal: ${bestAmenity.name} is ${bestAmenity.emptyPct}% empty` : 'Amenity signal unavailable'
    ],
    raw: {
      room: bestRoom,
      parking: bestParking,
      sampleCounts: {
        rooms: rooms.length,
        parkingZones: parking.length
      }
    }
  };
}

function computeAlertFromData(rooms, parking, amenities = []) {
  const avgRoomFullness = rooms.length
    ? Math.round(rooms.reduce((s, r) => s + safeInt(r.fullnessPct, 0), 0) / rooms.length)
    : 0;

  const parkingPressureScores = parking
    .map((p) => {
      const total = Math.max(1, safeInt(p.total, 0));
      const free = Math.max(0, safeInt(p.free, 0));
      const occupancy = Math.round(((total - free) / total) * 100);
      return { zone: p.zone, occupancy };
    })
    .sort((a, b) => b.occupancy - a.occupancy);

  const topParkingPressure = parkingPressureScores[0] || { zone: 'Main Parking', occupancy: 0 };
  const avgAmenityFullness = amenities.length
    ? Math.round(amenities.reduce((s, a) => s + safeInt(a.filledPct, 0), 0) / amenities.length)
    : 0;

  const topAmenityPressure = [...amenities]
    .map((a) => ({ name: a.name, filledPct: safeInt(a.filledPct, 0), predictedEmpty15m: safeInt(a.predictedEmpty15m, 0) }))
    .sort((a, b) => b.filledPct - a.filledPct)[0] || { name: 'Library', filledPct: 0, predictedEmpty15m: 0 };

  const congestion = safePct(Math.round((avgRoomFullness * 0.5) + (topParkingPressure.occupancy * 0.3) + (avgAmenityFullness * 0.2)), 35);

  const crowdedLocations = rooms
    .filter((r) => safeInt(r.fullnessPct, 0) >= 70)
    .map((r) => r.location)
    .filter(Boolean);

  const affectedAreas = [
    ...new Set(crowdedLocations),
    ...amenities.filter((a) => safeInt(a.filledPct, 0) >= 65).map((a) => a.name),
    topParkingPressure.zone,
    'Central Walkway'
  ].filter(Boolean).slice(0, 4);

  const now = new Date();
  const start = new Date(now.getTime() + (15 * 60000));
  const end = new Date(now.getTime() + (55 * 60000));
  const timeWindow = `${formatClock(start)} — ${formatClock(end)}`;

  const title = congestion >= 80
    ? 'Heavy Crowd Build-up Expected'
    : congestion >= 60
      ? 'Busy Period Ahead'
      : 'Moderate Flow Alert';

  const description = congestion >= 80
    ? `High pressure around ${affectedAreas[0] || 'Academic Core'} (${congestion}%). ${topParkingPressure.zone} is near full, and ${topAmenityPressure.name} is at ${topAmenityPressure.filledPct}% occupancy.`
    : congestion >= 60
      ? `Traffic is building near ${affectedAreas[0] || 'Central Spine'} (${congestion}%). Parking pressure is rising at ${topParkingPressure.zone}; ${topAmenityPressure.name} may tighten soon.`
      : `Flow is stable (${congestion}%), but pressure is gradually building near ${affectedAreas[0] || 'North Wing'}. Keep a small buffer in transit time.`;

  return {
    title,
    timeWindow,
    description,
    congestion,
    affectedAreas,
    raw: {
      avgRoomFullness,
      topParkingPressure,
      roomCount: rooms.length,
      parkingZoneCount: parking.length
    }
  };
}

exports.nextMove = async (_req, res, next) => {
  try {
    const rooms = await getRoomsData();
    const parking = await getParkingData();
    const amenities = await getAmenitiesData();
    const nextMove = computeNextMoveFromData(rooms, parking, amenities);
    const liveSimulation = buildLiveSimulationInfo({ rooms, parking, amenities });

    return res.json({
      nextMove,
      amenities,
      liveSimulation,
      updatedAt: liveSimulation.updatedAt
    });
  } catch (err) {
    return next(err);
  }
};

exports.upcomingAlert = async (_req, res, next) => {
  try {
    const rooms = await getRoomsData();
    const parking = await getParkingData();
    const amenities = await getAmenitiesData();
    const alert = computeAlertFromData(rooms, parking, amenities);
    const liveSimulation = buildLiveSimulationInfo({ rooms, parking, amenities });

    return res.json({
      alert,
      amenities,
      liveSimulation,
      updatedAt: liveSimulation.updatedAt
    });
  } catch (err) {
    return next(err);
  }
};

exports.dashboardLive = async (_req, res, next) => {
  try {
    const rooms = await getRoomsData();
    const parking = await getParkingData();
    const amenities = await getAmenitiesData();

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const now = new Date();
    const istDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const currentDay = days[istDate.getDay()];
    const hh = String(istDate.getHours()).padStart(2, '0');
    const mm = String(istDate.getMinutes()).padStart(2, '0');
    const ss = String(istDate.getSeconds()).padStart(2, '0');
    const currentTime = `${hh}:${mm}:${ss}`;

    const timetableRows = await getTimetableRows(currentDay, currentTime);
    const liveSimulation = buildLiveSimulationInfo({ rooms, parking, amenities, timetableRows });
    const nextClass = timetableRows[0] || null;

    const avgRoomFullness = rooms.length
      ? Math.round(rooms.reduce((s, r) => s + safeInt(r.fullnessPct, 0), 0) / rooms.length)
      : 0;

    const totalFreeParking = parking.reduce((s, p) => s + safeInt(p.free, 0), 0);
    const totalParking = parking.reduce((s, p) => s + safeInt(p.total, 0), 0);

    const signals = {
      timetable: {
        title: 'Timetable',
        subtitle: nextClass
          ? `Next: ${nextClass.course_code || nextClass.course_name || 'Class'} at ${nextClass.start_time || '--:--'}`
          : `No upcoming classes for ${currentDay}`,
        badge: nextClass ? 'SYNCED' : 'IDLE'
      },
      classrooms: {
        title: 'Classrooms',
        subtitle: `${rooms.length} tracked • Avg ${avgRoomFullness}% filled`,
        badge: 'LIVE'
      },
      parking: {
        title: 'Parking',
        subtitle: `${totalFreeParking}/${Math.max(totalParking, 1)} spots free campus-wide`,
        badge: 'LIVE'
      },
      amenities: {
        title: 'Amenities',
        subtitle: amenities.length
          ? amenities.map((a) => `${a.name}: ${a.emptyPct}% empty`).join(' • ')
          : 'No amenity simulation data',
        badge: 'LIVE'
      }
    };

    const timeline = (timetableRows.length ? timetableRows.slice(0, 3) : [
      { course_name: 'Campus Transit Window', room_name: 'Central Walkway', start_time: formatClock(new Date(now.getTime() + 10 * 60000)), end_time: formatClock(new Date(now.getTime() + 40 * 60000)), event_type: 'alert' }
    ]).map((row) => ({
      title: row.course_name || row.course_code || 'Campus Event',
      location: row.room_name || row.location || 'Campus',
      time: `${row.start_time || '--:--'} — ${row.end_time || '--:--'}`,
      type: (row.event_type || '').toLowerCase().includes('lab') ? 'lab' : (row.event_type || '').toLowerCase().includes('free') ? 'free' : 'class'
    }));

    const densityFromAmenities = amenities.map((a) => ({
      zone: a.name,
      crowdPct: safeInt(a.filledPct, 0),
      peakDescription: `15 min prediction: ${safeInt(a.predictedEmpty15m, 0)}% empty`,
      tip: a.suggestion
    }));

    const densityFromRooms = [...rooms]
      .sort((a, b) => safeInt(b.fullnessPct, 0) - safeInt(a.fullnessPct, 0))
      .slice(0, 4)
      .map((r) => ({
        zone: r.location,
        crowdPct: safeInt(r.fullnessPct, 0),
        peakDescription: safeInt(r.fullnessPct, 0) >= 75 ? 'Peak expected soon' : 'Moderate movement',
        tip: safeInt(r.fullnessPct, 0) >= 75 ? 'Use nearby alternative block' : 'Comfortable right now'
      }));

    const density = [...densityFromAmenities, ...densityFromRooms]
      .sort((a, b) => safeInt(b.crowdPct, 0) - safeInt(a.crowdPct, 0))
      .slice(0, 4);

    const spacesFromAmenities = amenities
      .map((a) => ({
        name: a.name,
        location: a.name,
        availableSeats: Math.max(0, safeInt(a.capacity, 0) - safeInt(a.occupancy, 0)),
        availabilityPct: safeInt(a.emptyPct, 0),
        walkMin: a.name === 'Library' ? 6 : 4,
        noiseLevel: safeInt(a.filledPct, 0) >= 70 ? 'High' : safeInt(a.filledPct, 0) >= 45 ? 'Moderate' : 'Low',
        wifi: a.name === 'Library' ? 'Strong' : 'Good'
      }));

    const spacesFromRooms = [...rooms]
      .filter((r) => r.capacity > 0)
      .sort((a, b) => safeInt(a.fullnessPct, 100) - safeInt(b.fullnessPct, 100))
      .slice(0, 6)
      .map((r) => {
        const availableSeats = Math.max(0, safeInt(r.capacity, 0) - safeInt(r.occupancy, 0));
        const noiseLevel = safeInt(r.fullnessPct, 0) <= 35 ? 'Low' : safeInt(r.fullnessPct, 0) <= 65 ? 'Moderate' : 'High';
        return {
          name: r.name,
          location: r.location,
          availableSeats,
          availabilityPct: Math.max(0, 100 - safeInt(r.fullnessPct, 0)),
          walkMin: 3 + Math.floor(Math.random() * 8),
          noiseLevel
        };
      });

    const spaces = [...spacesFromAmenities, ...spacesFromRooms]
      .sort((a, b) => safeInt(b.availabilityPct, 0) - safeInt(a.availabilityPct, 0))
      .slice(0, 6);

    const stats = {
      minutesSaved: Math.max(5, Math.round((100 - avgRoomFullness) / 8) + 5),
      decisionAccuracy: Math.max(72, Math.min(97, 75 + Math.round((100 - avgRoomFullness) / 2))),
      decisionsK: Number((Math.max(1, rooms.length) * 0.13).toFixed(1))
    };

    const sections = {
      signals: {
        subtitle: `Live merge: ${signals.timetable.subtitle} | ${signals.classrooms.subtitle} | ${signals.parking.subtitle}`,
        callout: `Real campus snapshot: ${rooms.length} rooms, ${totalFreeParking}/${Math.max(totalParking, 1)} parking spots free, and live campus simulation every 1 minute.`
      },
      alerts: {
        subtitle: `Congestion currently at ${computeAlertFromData(rooms, parking, amenities).congestion}% with parking pressure focused around ${computeAlertFromData(rooms, parking, amenities).raw.topParkingPressure.zone}.`,
        callout: `We detect crowd build-up from room occupancy + parking pressure and refresh the alert every minute.`
      },
      density: {
        subtitle: `Top crowded zones right now: ${density.map((d) => `${d.zone} (${d.crowdPct}%)`).join(', ') || 'No density data yet.'}`,
        callout: `Density cards are generated from live room occupancy + canteen/library simulation feed.`
      },
      spaces: {
        subtitle: `Best calm spaces now: ${spaces.slice(0, 3).map((s) => `${s.name} (${s.availabilityPct}% free)`).join(', ') || 'No spaces available.'}`,
        callout: `Quiet space cards combine classrooms and amenities with live simulator updates.`
      }
    };

    const alert = computeAlertFromData(rooms, parking, amenities);
    const nextMove = computeNextMoveFromData(rooms, parking, amenities);

    return res.json({
      signals,
      timeline,
      density,
      spaces,
      amenities,
      liveSimulation,
      stats,
      nextMove,
      alert,
      sections,
      updatedAt: liveSimulation.updatedAt
    });
  } catch (err) {
    return next(err);
  }
};

exports.timetableLive = async (req, res, next) => {
  try {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const daySet = new Set(days);
    const now = new Date();
    const opts = { timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' };
    const istTimeStr = new Intl.DateTimeFormat('en-US', opts).format(now);

    const currentDay = days[now.getDay()];
    const currentTime = istTimeStr;
    const amenities = await getAmenitiesData();
    const amenitySummary = amenities.map((a) => `${a.name}: ${a.emptyPct}% empty`).join(' | ');

    const normalizeDay = (value) => {
      if (!value) return null;
      const normalized = String(value).trim().toLowerCase();
      const matched = days.find((d) => d.toLowerCase() === normalized);
      return matched || null;
    };

    const formatDateLabel = (dateObj) => {
      const yyyy = dateObj.getFullYear();
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
      const dd = String(dateObj.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    const toDayFromDateInput = (dateInput) => {
      if (!dateInput) return null;
      const parsed = new Date(dateInput);
      if (Number.isNaN(parsed.getTime())) return null;
      return {
        day: days[parsed.getDay()],
        dateLabel: formatDateLabel(parsed)
      };
    };

    const queryRowsForDay = async (day, onlyFuture) => {
      const currentDay = days[now.getDay()];
      const currentTime = istTimeStr;
      
      const baseSql = `SELECT 
               t.course_code,
               t.course_name,
               t.room_name,
               t.day,
               t.time_slot,
               c.distance_from_main AS distance_from_central,
               SPLIT_PART(t.time_slot, '-', 1) AS start_time,
               SPLIT_PART(t.time_slot, '-', 2) AS end_time
        FROM timetable t
        LEFT JOIN classrooms c ON c.room_name = t.room_name
        WHERE t.day = $1
      `;

      if (onlyFuture) {
        return queryRows(baseSql + ' AND TO_TIMESTAMP(SPLIT_PART(t.time_slot, \'-\', 2), \'HH24:MI\')::time >= $2::time ORDER BY TO_TIMESTAMP(SPLIT_PART(t.time_slot, \'-\', 1), \'HH24:MI\')::time ASC', [day, currentTime]);
      }

      return queryRows(baseSql + ' ORDER BY TO_TIMESTAMP(SPLIT_PART(t.time_slot, \'-\', 1), \'HH24:MI\')::time ASC', [day]);
    };

    const computeStartsInMinutes = (startTime) => {
      if (!startTime) return 0;
      return Math.round((new Date(`1970-01-01T${startTime}Z`) - new Date(`1970-01-01T${currentTime}Z`)) / 60000);
    };

    const buildDayPayload = (selectedDay, rows, isLiveToday, dateLabel = null) => {
      const label = dateLabel ? `${selectedDay} (${dateLabel})` : selectedDay;
      const emptyMessage = isLiveToday
        ? 'No more classes for today. Head to the library or hostel!'
        : `No classes scheduled for ${label}.`;

      const payload = {
        message: emptyMessage,
        nextClass: null,
        upcomingClasses: [],
        currentDay: selectedDay,
        currentTime,
        selectedDate: dateLabel,
        isLiveToday,
        allClasses: rows
      };

      if (!rows.length) return payload;

      const nextClass = rows[0];
      const upcomingClasses = rows.slice(1, 5);
      const isOngoing = Boolean(isLiveToday && currentTime >= nextClass.start_time && currentTime <= nextClass.end_time);
      const startsInMinutes = isLiveToday ? computeStartsInMinutes(nextClass.start_time) : null;

      if (isLiveToday) {
        if (isOngoing) {
          payload.message = `You have an ongoing class: ${nextClass.course_code} - ${nextClass.course_name} at ${nextClass.room_name}.`;
        } else {
          const walkMin = nextClass.distance_from_central ? Math.ceil(nextClass.distance_from_central / 80) : 5;
          if (startsInMinutes <= walkMin) {
            payload.message = `HURRY! ${nextClass.course_code} starts in ${startsInMinutes} mins at ${nextClass.room_name}.`;
          } else {
            payload.message = `Your next class, ${nextClass.course_code}, starts in ${startsInMinutes} mins at ${nextClass.room_name}. Walk time is ${walkMin} mins.`;
          }
        }
      } else {
        payload.message = `${rows.length} class${rows.length === 1 ? '' : 'es'} scheduled for ${label}.`;
      }

      payload.nextClass = {
        ...nextClass,
        isOngoing,
        startsInMinutes: isLiveToday ? (isOngoing ? 0 : startsInMinutes) : null
      };
      payload.upcomingClasses = upcomingClasses;
      return payload;
    };

    const modeInput = String(req.query.mode || 'today').toLowerCase();
    const selectedDayParam = normalizeDay(req.query.day);
    const selectedDateParam = toDayFromDateInput(req.query.date);
    const weekStartParam = toDayFromDateInput(req.query.weekStart);

    if (modeInput === 'day') {
      const selectedDay = selectedDayParam || currentDay;
      const rows = await queryRowsForDay(selectedDay, false);
      const liveSimulation = buildLiveSimulationInfo({ rooms, parking, amenities, timetableRows: rows });
      const data = buildDayPayload(selectedDay, rows, false);
      data.liveAmenities = amenities;
      data.amenitySummary = amenitySummary;
      data.liveParkingSummary = parkingSummary;
      data.liveRoomSummary = roomSummary;
      data.liveSimulation = liveSimulation;
      return res.json({ success: true, mode: 'day', data, timestamp: now.toISOString() });
    }

    if (modeInput === 'date') {
      const dateMeta = selectedDateParam;
      if (!dateMeta || !daySet.has(dateMeta.day)) {
        return res.status(400).json({ success: false, message: 'Invalid date. Use YYYY-MM-DD.' });
      }

      const rows = await queryRowsForDay(dateMeta.day, false);
      const liveSimulation = buildLiveSimulationInfo({ rooms, parking, amenities, timetableRows: rows });
      const data = buildDayPayload(dateMeta.day, rows, false, dateMeta.dateLabel);
      data.liveAmenities = amenities;
      data.amenitySummary = amenitySummary;
      data.liveParkingSummary = parkingSummary;
      data.liveRoomSummary = roomSummary;
      data.liveSimulation = liveSimulation;
      return res.json({ success: true, mode: 'date', data, timestamp: now.toISOString() });
    }

    if (modeInput === 'week') {
      const start = weekStartParam ? new Date(weekStartParam.dateLabel) : new Date(now);
      const weekDays = [];

      for (let i = 0; i < 7; i += 1) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        weekDays.push({
          day: days[d.getDay()],
          dateLabel: formatDateLabel(d)
        });
      }

      const weeklySchedule = [];
      for (const entry of weekDays) {
        const rows = await queryRowsForDay(entry.day, false);
        weeklySchedule.push({
          day: entry.day,
          date: entry.dateLabel,
          classes: rows
        });
      }

      const allWeekClasses = weeklySchedule.reduce((sum, item) => sum + item.classes.length, 0);
      const weekRows = weeklySchedule.flatMap((entry) => entry.classes || []);
      const liveSimulation = buildLiveSimulationInfo({ rooms, parking, amenities, timetableRows: weekRows });
      return res.json({
        success: true,
        mode: 'week',
        data: {
          message: `${allWeekClasses} class${allWeekClasses === 1 ? '' : 'es'} planned over selected week.`,
          weekStart: weekDays[0]?.dateLabel || null,
          weekEnd: weekDays[6]?.dateLabel || null,
          weeklySchedule,
          liveAmenities: amenities,
          amenitySummary,
          liveParkingSummary: parkingSummary,
          liveRoomSummary: roomSummary,
          liveSimulation,
          currentDay,
          currentTime
        },
        timestamp: now.toISOString()
      });
    }

    const liveRows = await queryRowsForDay(currentDay, true);
    const liveSimulation = buildLiveSimulationInfo({ rooms, parking, amenities, timetableRows: liveRows });
    let data = buildDayPayload(currentDay, liveRows, true);

    // If there are no remaining classes today, show the next day that has classes.
    if (!liveRows.length) {
      for (let offset = 1; offset <= 7; offset += 1) {
        const probe = new Date(now);
        probe.setDate(now.getDate() + offset);
        const probeDay = days[probe.getDay()];
        const rows = await queryRowsForDay(probeDay, false);
        if (rows.length) {
          data = buildDayPayload(probeDay, rows, false, formatDateLabel(probe));
          data.message = `No more classes today. Next classes are on ${probeDay}.`;
          data.fallbackFromToday = true;
          break;
        }
      }
    }

    return res.json({
      success: true,
      mode: 'today',
      data: {
        ...data,
        liveAmenities: amenities,
        amenitySummary,
        liveParkingSummary: parkingSummary,
        liveRoomSummary: roomSummary,
        liveSimulation,
      },
      timestamp: now.toISOString()
    });
  } catch (err) {
    return next(err);
  }
};

exports.workspaceSlots = async (req, res, next) => {
  try {
    const date = String(req.query.date || '2023-10-24');
    const parsed = new Date(date);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const day = Number.isNaN(parsed.getTime()) ? 'Tuesday' : days[parsed.getDay()];

    const rows = await queryRows(
      `SELECT t.course as course_code, t.course as course_name, t.instructor, t.room_name, 
              SPLIT_PART(t.time_slot, '-', 1) AS start_time,
              SPLIT_PART(t.time_slot, '-', 2) AS end_time,
              COALESCE(c.current_occupancy, 0) AS current_occupancy, COALESCE(c.capacity, 0) AS capacity
       FROM timetable t
       LEFT JOIN classrooms c ON c.room_name = t.room_name
       WHERE t.day = $1
       ORDER BY TO_TIMESTAMP(SPLIT_PART(t.time_slot, '-', 1), 'HH24:MI')::time ASC
       LIMIT 12`,
      [day]
    );

    const bookings = readBookings();
    const dayBookings = bookings[date] || {};

    const slots = rows.map((r, idx) => {
      const slotId = `${date}:${r.room_name}:${r.start_time}`;
      const cap = Math.max(1, safeInt(r.capacity, 1));
      const occ = safeInt(r.current_occupancy, 0);
      const occPct = Math.round((occ / cap) * 100);
      const booked = Boolean(dayBookings[slotId]);
      const available = !booked && occPct < 85;

      const label = idx < 2
        ? 'Morning Quiet Session'
        : idx < 5
          ? 'Focus Deep Work Block'
          : idx < 8
            ? 'Project Collaboration Slot'
            : 'Evening Revision Slot';

      return {
        id: slotId,
        time: `${String(r.start_time).slice(0, 5)} - ${String(r.end_time).slice(0, 5)}`,
        label,
        courseCode: r.course_code,
        courseName: r.course_name,
        roomName: r.room_name,
        instructor: r.instructor,
        occupancyPct: occPct,
        available,
        status: booked ? 'booked' : available ? 'available' : 'limited'
      };
    });

    return res.json({
      success: true,
      date,
      day,
      slots,
      recommendedSlotId: (slots.find((s) => s.available) || slots[0] || {}).id || null
    });
  } catch (err) {
    return next(err);
  }
};

exports.bookWorkspaceSlot = async (req, res, next) => {
  try {
    const { slotId, date } = req.body || {};
    if (!slotId || !date) {
      return res.status(400).json({ success: false, message: 'slotId and date are required.' });
    }

    const bookings = readBookings();
    if (!bookings[date]) bookings[date] = {};

    if (bookings[date][slotId]) {
      return res.status(409).json({ success: false, message: 'This slot is already booked.' });
    }

    bookings[date][slotId] = { bookedAt: new Date().toISOString() };
    writeBookings(bookings);

    return res.json({
      success: true,
      message: 'Booking confirmed successfully.',
      data: { slotId, date }
    });
  } catch (err) {
    return next(err);
  }
};
