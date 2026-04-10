-- IITB Campus Schema
CREATE TABLE IF NOT EXISTS buildings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) UNIQUE NOT NULL,
    block_name VARCHAR(50),
    description TEXT,
    lat DECIMAL(10, 8),
    lng DECIMAL(11, 8),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS floors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    building_id UUID REFERENCES buildings(id) ON DELETE CASCADE,
    floor_number INTEGER NOT NULL,
    floor_alias VARCHAR(50), -- e.g. "Ground", "Basement"
    plan_description TEXT,
    plan_image_url TEXT,
    UNIQUE(building_id, floor_number)
);

CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    floor_id UUID REFERENCES floors(id) ON DELETE CASCADE,
    room_number VARCHAR(20) NOT NULL,
    room_type VARCHAR(50) DEFAULT 'Classroom', -- 'Lab', 'Office', 'Seminar Hall'
    capacity INTEGER,
    has_projector BOOLEAN DEFAULT false,
    has_ac BOOLEAN DEFAULT false,
    is_available BOOLEAN DEFAULT true,
    UNIQUE(floor_id, room_number)
);

CREATE TABLE IF NOT EXISTS parking_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_name VARCHAR(100) UNIQUE NOT NULL,
    location_desc TEXT,
    total_slots INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS parking_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id UUID REFERENCES parking_zones(id) ON DELETE CASCADE,
    slot_number VARCHAR(10) NOT NULL,
    is_occupied BOOLEAN DEFAULT false,
    vehicle_type VARCHAR(20) DEFAULT 'Car', -- 'Bike', 'EV'
    UNIQUE(zone_id, slot_number)
);
