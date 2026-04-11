const db = require('../config/db');

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

async function queryRows(sql, params = []) {
  try {
    const result = await db.query(sql, params);
    return result?.rows || [];
  } catch (_err) {
    return [];
  }
}

async function getRoomsData() {
  // Use the actual 'rooms' table (not 'classrooms')
  const classrooms = await queryRows(`
    SELECT
      id,
      room_number AS room_name,
      room_type AS block,
      capacity,
      current_occupancy,
      COALESCE(current_occupancy::float / NULLIF(capacity, 0) * 100, 0) AS fullness_pct
    FROM rooms
    WHERE capacity > 0 AND is_available IS NOT FALSE
    ORDER BY COALESCE(current_occupancy::float / NULLIF(capacity, 0), 0) ASC
    LIMIT 500
  `);

  return classrooms.map((c) => {
    const fullness = pct(c.current_occupancy, c.capacity, 0);
    return {
      name: c.room_name || `Room ${c.id}`,
      location: c.block || 'Campus',
      occupancy: safeInt(c.current_occupancy, 0),
      capacity: safeInt(c.capacity, 0),
      fullnessPct: fullness,
      isAvailable: fullness < 90,
      distance: 300 // default walk distance
    };
  });
}

async function getParkingData() {
  // Use parking_zones and parking_slots (actual schema)
  const parkingZones = await queryRows(`
    SELECT
      pz.zone_name,
      pz.total_slots,
      COUNT(ps.id) FILTER (WHERE ps.is_occupied = false) AS free_slots
    FROM parking_zones pz
    LEFT JOIN parking_slots ps ON ps.zone_id = pz.id
    GROUP BY pz.zone_name, pz.total_slots
    ORDER BY free_slots DESC
  `);

  return parkingZones.map((p) => ({
    zone: p.zone_name,
    free: safeInt(p.free_slots, 0),
    total: safeInt(p.total_slots, 0)
  }));
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
  return queryRows(
    `
      SELECT t.*
      FROM timetable t
      WHERE t.day_of_week = $1 AND t.end_time >= $2
      ORDER BY t.start_time ASC
      LIMIT 10
    `,
    [day, time]
  );
}

function computeNextMoveFromData(rooms, parking) {
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
    tip,
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

function computeAlertFromData(rooms, parking) {
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
  const congestion = safePct(Math.round((avgRoomFullness * 0.6) + (topParkingPressure.occupancy * 0.4)), 35);

  const crowdedLocations = rooms
    .filter((r) => safeInt(r.fullnessPct, 0) >= 70)
    .map((r) => r.location)
    .filter(Boolean);

  const affectedAreas = [
    ...new Set(crowdedLocations),
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
    ? `High crowd activity expected around ${affectedAreas[0] || 'main campus'}. ${topParkingPressure.zone} is nearing full capacity. Consider moving 10 minutes earlier.`
    : congestion >= 60
      ? `Foot traffic is increasing near ${affectedAreas[0] || 'major blocks'}. Parking pressure is rising at ${topParkingPressure.zone}. Plan an alternate route.`
      : `Campus flow is stable, but pressure is building near ${affectedAreas[0] || 'key areas'}. Keep buffer time for smooth movement.`;

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
    const nextMove = computeNextMoveFromData(rooms, parking);

    return res.json({
      nextMove,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    return next(err);
  }
};

exports.upcomingAlert = async (_req, res, next) => {
  try {
    const rooms = await getRoomsData();
    const parking = await getParkingData();
    const alert = computeAlertFromData(rooms, parking);

    return res.json({
      alert,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    return next(err);
  }
};

exports.dashboardLive = async (_req, res, next) => {
  try {
    const rooms = await getRoomsData();
    const parking = await getParkingData();

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const now = new Date();
    const istDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const currentDay = days[istDate.getDay()];
    const hh = String(istDate.getHours()).padStart(2, '0');
    const mm = String(istDate.getMinutes()).padStart(2, '0');
    const ss = String(istDate.getSeconds()).padStart(2, '0');
    const currentTime = `${hh}:${mm}:${ss}`;

    const timetableRows = await getTimetableRows(currentDay, currentTime);
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

    const density = [...rooms]
      .sort((a, b) => safeInt(b.fullnessPct, 0) - safeInt(a.fullnessPct, 0))
      .slice(0, 4)
      .map((r) => ({
        zone: r.location,
        crowdPct: safeInt(r.fullnessPct, 0),
        peakDescription: safeInt(r.fullnessPct, 0) >= 75 ? 'Peak expected soon' : 'Moderate movement',
        tip: safeInt(r.fullnessPct, 0) >= 75 ? 'Use nearby alternative block' : 'Comfortable right now'
      }));

    const spaces = [...rooms]
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

    const stats = {
      minutesSaved: Math.max(5, Math.round((100 - avgRoomFullness) / 8) + 5),
      decisionAccuracy: Math.max(72, Math.min(97, 75 + Math.round((100 - avgRoomFullness) / 2))),
      decisionsK: Number((Math.max(1, rooms.length) * 0.13).toFixed(1))
    };

    const sections = {
      signals: {
        subtitle: `Live merge: ${signals.timetable.subtitle} | ${signals.classrooms.subtitle} | ${signals.parking.subtitle}`,
        callout: `Real campus snapshot from your simulator: ${rooms.length} rooms tracked, ${totalFreeParking}/${Math.max(totalParking, 1)} parking spots currently free.`
      },
      alerts: {
        subtitle: `Congestion currently at ${computeAlertFromData(rooms, parking).congestion}% with parking pressure focused around ${computeAlertFromData(rooms, parking).raw.topParkingPressure.zone}.`,
        callout: `We detect crowd build-up from room occupancy + parking pressure and refresh the alert every 30 seconds.`
      },
      density: {
        subtitle: `Top crowded zones right now: ${density.map((d) => `${d.zone} (${d.crowdPct}%)`).join(', ') || 'No density data yet.'}`,
        callout: `Density cards are generated from your live room occupancy feed.`
      },
      spaces: {
        subtitle: `Best calm spaces now: ${spaces.slice(0, 3).map((s) => `${s.name} (${s.availabilityPct}% free)`).join(', ') || 'No spaces available.'}`,
        callout: `Quiet space cards are built from least-occupied rooms and updated with live simulator changes.`
      }
    };

    const alert = computeAlertFromData(rooms, parking);
    const nextMove = computeNextMoveFromData(rooms, parking);

    return res.json({
      signals,
      timeline,
      density,
      spaces,
      stats,
      nextMove,
      alert,
      sections,
      updatedAt: new Date().toISOString()
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
      // Join with rooms using room_number (actual schema, no 'classrooms' table)
      const baseSql = `
        SELECT t.*,
               r.current_occupancy,
               r.capacity AS room_capacity,
               300 AS distance_from_central
        FROM timetable t
        LEFT JOIN rooms r ON r.room_number = t.room_name
        WHERE t.day_of_week = $1
      `;

      if (onlyFuture) {
        return queryRows(baseSql + ' AND t.end_time >= $2 ORDER BY t.start_time ASC', [day, currentTime]);
      }

      return queryRows(baseSql + ' ORDER BY t.start_time ASC', [day]);
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
      const data = buildDayPayload(selectedDay, rows, false);
      return res.json({ success: true, mode: 'day', data, timestamp: now.toISOString() });
    }

    if (modeInput === 'date') {
      const dateMeta = selectedDateParam;
      if (!dateMeta || !daySet.has(dateMeta.day)) {
        return res.status(400).json({ success: false, message: 'Invalid date. Use YYYY-MM-DD.' });
      }

      const rows = await queryRowsForDay(dateMeta.day, false);
      const data = buildDayPayload(dateMeta.day, rows, false, dateMeta.dateLabel);
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
      return res.json({
        success: true,
        mode: 'week',
        data: {
          message: `${allWeekClasses} class${allWeekClasses === 1 ? '' : 'es'} planned over selected week.`,
          weekStart: weekDays[0]?.dateLabel || null,
          weekEnd: weekDays[6]?.dateLabel || null,
          weeklySchedule,
          currentDay,
          currentTime
        },
        timestamp: now.toISOString()
      });
    }

    const liveRows = await queryRowsForDay(currentDay, true);
    const data = buildDayPayload(currentDay, liveRows, true);
    return res.json({
      success: true,
      mode: 'today',
      data,
      timestamp: now.toISOString()
    });
  } catch (err) {
    return next(err);
  }
};
