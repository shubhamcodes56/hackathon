-- VisionX minimal production schema (idempotent)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS classrooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT UNIQUE NOT NULL,
  building TEXT NOT NULL,
  floor INTEGER NOT NULL,
  occupancy INTEGER DEFAULT 0 CHECK (occupancy >= 0),
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  gps_h3 BIGINT,
  confidence NUMERIC(3,2) DEFAULT 0.0,
  ends_at TIMESTAMPTZ,
  geom geometry(POINT,4326)
);

CREATE TABLE IF NOT EXISTS timetable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT NOT NULL REFERENCES classrooms(room_id),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  subject TEXT,
  faculty TEXT,
  capacity INTEGER DEFAULT 40
);

CREATE TABLE IF NOT EXISTS parking_spots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spot_id TEXT UNIQUE NOT NULL,
  building TEXT,
  status TEXT DEFAULT 'unknown',
  gps_h3 BIGINT
);

CREATE TABLE IF NOT EXISTS predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT REFERENCES classrooms(room_id),
  target_datetime TIMESTAMPTZ NOT NULL,
  empty_probability NUMERIC(4,3)
);

CREATE TABLE IF NOT EXISTS student_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT UNIQUE NOT NULL,
  subjects TEXT[] NOT NULL,
  gps_h3 BIGINT,
  availability JSONB
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  messages JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

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

CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);
