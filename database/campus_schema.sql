-- CampusGPT VisionX Production PostgreSQL Schema
-- Smart Campus Decision Platform
-- NO INSERTS — only CREATE EXTENSION / TABLE / INDEX / VIEW / FUNCTION

-- Required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;
-- H3 extension name may vary (h3 or h3-pg). Try to create 'h3' if available.
DO $$ BEGIN
  PERFORM 1 FROM pg_available_extensions WHERE name = 'h3';
  IF FOUND THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS h3';
  END IF;
EXCEPTION WHEN others THEN
  -- ignore if extension not available in environment
  RAISE NOTICE 'h3 extension not created (may not be installed)';
END$$;

-- Note: Use UUID primary keys for production-grade identifiers

-- classrooms
CREATE TABLE IF NOT EXISTS classrooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT UNIQUE NOT NULL,
  building TEXT NOT NULL,
  floor INTEGER NOT NULL,
  occupancy INTEGER DEFAULT 0 CHECK (occupancy >= 0),
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  current_class TEXT,
  ends_at TIMESTAMPTZ,
  gps_lat DOUBLE PRECISION,
  gps_lng DOUBLE PRECISION,
  gps_h3 BIGINT, -- H3 index as bigint
  confidence NUMERIC(3,2) DEFAULT 0.0 CHECK (confidence BETWEEN 0 AND 1),
  updated_at TIMESTAMPTZ DEFAULT now(),
  geom geometry(POINT,4326)
);

-- timetable
CREATE TABLE IF NOT EXISTS timetable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT NOT NULL REFERENCES classrooms(room_id),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  subject TEXT,
  faculty TEXT,
  capacity INTEGER DEFAULT 40,
  created_at TIMESTAMPTZ DEFAULT now(),
  CHECK (end_time > start_time)
);

-- parking_spots
CREATE TABLE IF NOT EXISTS parking_spots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spot_id TEXT UNIQUE NOT NULL,
  building TEXT,
  lot_number TEXT,
  status TEXT DEFAULT 'unknown' CHECK (status IN ('empty','occupied','reserved','unknown')),
  gps_lat DOUBLE PRECISION,
  gps_lng DOUBLE PRECISION,
  gps_h3 BIGINT,
  distance_from_gate1 INTEGER,
  updated_at TIMESTAMPTZ DEFAULT now(),
  geom geometry(POINT,4326)
);

-- predictions
CREATE TABLE IF NOT EXISTS predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT REFERENCES classrooms(room_id),
  target_datetime TIMESTAMPTZ NOT NULL,
  empty_probability NUMERIC(4,3) CHECK (empty_probability BETWEEN 0 AND 1),
  confidence NUMERIC(3,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- clashes
CREATE TABLE IF NOT EXISTS clashes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building TEXT NOT NULL,
  predicted_time TIMESTAMPTZ NOT NULL,
  congestion_level NUMERIC(3,2) CHECK (congestion_level BETWEEN 0 AND 1),
  incoming_classes INTEGER DEFAULT 0,
  available_rooms INTEGER DEFAULT 0,
  alert_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- student_profiles
CREATE TABLE IF NOT EXISTS student_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT UNIQUE NOT NULL,
  subjects TEXT[] NOT NULL,
  current_location TEXT,
  gps_h3 BIGINT,
  availability JSONB,
  study_style TEXT DEFAULT 'solo',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- chat_logs
CREATE TABLE IF NOT EXISTS chat_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  message TEXT NOT NULL,
  intent TEXT,
  confidence NUMERIC(3,2),
  response_time_ms INTEGER,
  response JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Audit logs (enterprise)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  details JSONB,
  ip_addr TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RBAC core (lightweight tables to integrate with app logic)
CREATE TABLE IF NOT EXISTS apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  description TEXT,
  UNIQUE(action, resource)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY(role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID,
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(user_id, role_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_classrooms_room ON classrooms(room_id);
CREATE INDEX IF NOT EXISTS idx_classrooms_occupancy ON classrooms(occupancy);
CREATE INDEX IF NOT EXISTS idx_classrooms_geom ON classrooms USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_classrooms_gps_h3 ON classrooms(gps_h3);

CREATE INDEX IF NOT EXISTS idx_parking_status ON parking_spots(status);
CREATE INDEX IF NOT EXISTS idx_parking_geom ON parking_spots USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_parking_gps_h3 ON parking_spots(gps_h3);

CREATE INDEX IF NOT EXISTS idx_timetable_time ON timetable(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_predictions_time ON predictions(target_datetime);
CREATE INDEX IF NOT EXISTS idx_students_location ON student_profiles(gps_h3);
CREATE INDEX IF NOT EXISTS idx_chatlogs_user ON chat_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);

-- GIN index for JSONB availability/response fields
CREATE INDEX IF NOT EXISTS idx_student_availability_gin ON student_profiles USING GIN (availability);
CREATE INDEX IF NOT EXISTS idx_chatlogs_response_gin ON chat_logs USING GIN (response);

-- Views for decision engine
DROP VIEW IF EXISTS v_available_rooms;
CREATE VIEW v_available_rooms AS
SELECT room_id, building, floor, gps_h3, occupancy_pct
FROM (
  SELECT room_id, building, floor, gps_h3,
    (occupancy::double precision / NULLIF(capacity,0)) as occupancy_pct,
    RANK() OVER (PARTITION BY building ORDER BY (occupancy::double precision / NULLIF(capacity,0)) ASC) as rnk
  FROM classrooms
  WHERE capacity > 0 AND occupancy < capacity * 0.7
) sub
WHERE rnk <= 5;

DROP VIEW IF EXISTS v_ghost_rooms;
CREATE VIEW v_ghost_rooms AS
SELECT c.room_id, c.building, (c.ends_at - now()) as time_to_empty
FROM classrooms c
JOIN timetable t ON c.room_id = t.room_id
WHERE c.ends_at BETWEEN now() AND now() + INTERVAL '20 minutes'
  AND NOT EXISTS (
    SELECT 1 FROM timetable t2
    WHERE t2.room_id = c.room_id
      AND t2.start_time < c.ends_at + INTERVAL '10 minutes'
  );

-- H3 helper indexes (if h3 extension exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'h3') THEN
    -- create btree indexes on h3 bigint columns for fast equality/range lookups
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_classrooms_h3 ON classrooms(gps_h3)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_parking_h3 ON parking_spots(gps_h3)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_students_h3 ON student_profiles(gps_h3)';
  END IF;
END$$;

-- Decision engine function: get_move_now
CREATE OR REPLACE FUNCTION get_move_now(building_filter TEXT DEFAULT NULL)
RETURNS TABLE (
  recommended_building TEXT,
  parking_spots_available INTEGER,
  best_room TEXT,
  valid_until TIMESTAMPTZ,
  score NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT v.room_id, v.building, v.occupancy_pct,
      COALESCE(p.empty_spots,0) as empty_spots,
      (1.0 - COALESCE(v.occupancy_pct,1.0)) * 0.7 + (LEAST(COALESCE(p.empty_spots,0),10)::double precision/10.0) * 0.3 as score
    FROM v_available_rooms v
    LEFT JOIN (
      SELECT building, COUNT(*) FILTER (WHERE status = 'empty') as empty_spots
      FROM parking_spots
      GROUP BY building
    ) p ON p.building = v.building
    WHERE (building_filter IS NULL OR v.building = building_filter)
  )
  SELECT building, SUM(empty_spots) as parking_spots_available, room_id as best_room,
         now() + INTERVAL '15 minutes' as valid_until, score
  FROM candidates
  ORDER BY score DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- Utility function: recommend_rooms_by_score
CREATE OR REPLACE FUNCTION recommend_rooms(limit_count INTEGER DEFAULT 5)
RETURNS TABLE (room_id TEXT, building TEXT, occupancy_pct NUMERIC, score NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT v.room_id, v.building, v.occupancy_pct,
    (1.0 - v.occupancy_pct) as score
  FROM v_available_rooms v
  ORDER BY score DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to compute room proximity using PostGIS (returns rooms within X meters of a lat/lng)
CREATE OR REPLACE FUNCTION rooms_within_radius(lat DOUBLE PRECISION, lng DOUBLE PRECISION, meters INTEGER)
RETURNS TABLE (room_id TEXT, building TEXT, distance_m DOUBLE PRECISION) AS $$
BEGIN
  RETURN QUERY
  SELECT room_id, building,
    ST_DistanceSphere(ST_SetSRID(ST_MakePoint(gps_lng, gps_lat),4326), ST_SetSRID(ST_MakePoint(lng,lat),4326)) as distance_m
  FROM classrooms
  WHERE gps_lat IS NOT NULL AND gps_lng IS NOT NULL
    AND ST_DistanceSphere(ST_SetSRID(ST_MakePoint(gps_lng, gps_lat),4326), ST_SetSRID(ST_MakePoint(lng,lat),4326)) <= meters
  ORDER BY distance_m ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- End of schema
