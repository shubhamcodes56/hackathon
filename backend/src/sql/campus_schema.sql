-- Mini Campus Reset Schema
-- Drops the older campus tables and recreates a small, fast demo dataset.

DROP TABLE IF EXISTS timetable CASCADE;
DROP TABLE IF EXISTS people CASCADE;
DROP TABLE IF EXISTS parking_spots CASCADE;
DROP TABLE IF EXISTS classrooms CASCADE;
DROP TABLE IF EXISTS campus_paths CASCADE;
DROP TABLE IF EXISTS parking_slots CASCADE;
DROP TABLE IF EXISTS parking_zones CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS floors CASCADE;
DROP TABLE IF EXISTS buildings CASCADE;
DROP TABLE IF EXISTS distances CASCADE;

CREATE TABLE classrooms (
    id SERIAL PRIMARY KEY,
    room_name VARCHAR(10) UNIQUE NOT NULL,
    capacity INT DEFAULT 25,
    current_occupancy INT DEFAULT 0,
    distance_from_main INT,
    status VARCHAR(20) DEFAULT 'open'
);

CREATE TABLE parking_spots (
    id SERIAL PRIMARY KEY,
    spot_name VARCHAR(10) UNIQUE NOT NULL,
    status VARCHAR(10) DEFAULT 'empty',
    distance_from_main INT
);

CREATE TABLE people (
    id SERIAL PRIMARY KEY,
    type VARCHAR(20) NOT NULL,
    name VARCHAR(50) NOT NULL,
    current_room VARCHAR(10) DEFAULT NULL
);

CREATE TABLE timetable (
    id SERIAL PRIMARY KEY,
    day VARCHAR(10) NOT NULL,
    time_slot VARCHAR(20) NOT NULL,
    room_name VARCHAR(10) NOT NULL,
    course VARCHAR(50) NOT NULL,
    instructor VARCHAR(50) NOT NULL,
    expected_students INT NOT NULL
);

CREATE INDEX idx_classrooms_distance ON classrooms(distance_from_main);
CREATE INDEX idx_timetable_day_time_room ON timetable(day, time_slot, room_name);

INSERT INTO classrooms (room_name, capacity, current_occupancy, distance_from_main, status) VALUES
('C101', 25, 7, 0, 'open'),
('C102', 25, 22, 10, 'open'),
('C103', 25, 18, 20, 'open'),
('C104', 25, 10, 30, 'open'),
('C105', 25, 23, 40, 'open'),
('C106', 25, 9, 50, 'open'),
('C107', 25, 15, 60, 'open'),
('C108', 25, 13, 70, 'open'),
('C109', 25, 5, 80, 'open'),
('C110', 25, 2, 90, 'open');

INSERT INTO parking_spots (spot_name, status, distance_from_main) VALUES
('P01', 'empty', 5),
('P02', 'empty', 10),
('P03', 'occupied', 15),
('P04', 'empty', 20),
('P05', 'occupied', 25),
('P06', 'empty', 30),
('P07', 'empty', 35),
('P08', 'occupied', 40),
('P09', 'empty', 45),
('P10', 'empty', 50);

INSERT INTO people (type, name, current_room) VALUES
('student', 'S001', NULL),
('student', 'S002', NULL),
('student', 'S003', NULL),
('student', 'S004', NULL),
('student', 'S005', NULL),
('student', 'S006', NULL),
('student', 'S007', NULL),
('student', 'S008', NULL),
('student', 'S009', NULL),
('student', 'S010', NULL),
('student', 'S011', NULL),
('student', 'S012', NULL),
('student', 'S013', NULL),
('student', 'S014', NULL),
('student', 'S015', NULL),
('student', 'S016', NULL),
('student', 'S017', NULL),
('student', 'S018', NULL),
('student', 'S019', NULL),
('student', 'S020', NULL),
('student', 'S021', NULL),
('student', 'S022', NULL),
('student', 'S023', NULL),
('student', 'S024', NULL),
('student', 'S025', NULL),
('student', 'S026', NULL),
('student', 'S027', NULL),
('student', 'S028', NULL),
('student', 'S029', NULL),
('student', 'S030', NULL),
('student', 'S031', NULL),
('student', 'S032', NULL),
('student', 'S033', NULL),
('student', 'S034', NULL),
('student', 'S035', NULL),
('student', 'S036', NULL),
('student', 'S037', NULL),
('student', 'S038', NULL),
('student', 'S039', NULL),
('student', 'S040', NULL),
('student', 'S041', NULL),
('student', 'S042', NULL),
('student', 'S043', NULL),
('student', 'S044', NULL),
('student', 'S045', NULL),
('student', 'S046', NULL),
('student', 'S047', NULL),
('student', 'S048', NULL),
('student', 'S049', NULL),
('student', 'S050', NULL),
('student', 'S051', NULL),
('student', 'S052', NULL),
('student', 'S053', NULL),
('student', 'S054', NULL),
('student', 'S055', NULL),
('student', 'S056', NULL),
('student', 'S057', NULL),
('student', 'S058', NULL),
('student', 'S059', NULL),
('student', 'S060', NULL),
('student', 'S061', NULL),
('student', 'S062', NULL),
('student', 'S063', NULL),
('student', 'S064', NULL),
('student', 'S065', NULL),
('student', 'S066', NULL),
('student', 'S067', NULL),
('student', 'S068', NULL),
('student', 'S069', NULL),
('student', 'S070', NULL),
('student', 'S071', NULL),
('student', 'S072', NULL),
('student', 'S073', NULL),
('student', 'S074', NULL),
('student', 'S075', NULL),
('student', 'S076', NULL),
('student', 'S077', NULL),
('student', 'S078', NULL),
('student', 'S079', NULL),
('student', 'S080', NULL),
('student', 'S081', NULL),
('student', 'S082', NULL),
('student', 'S083', NULL),
('student', 'S084', NULL),
('student', 'S085', NULL),
('student', 'S086', NULL),
('student', 'S087', NULL),
('student', 'S088', NULL),
('student', 'S089', NULL),
('student', 'S090', NULL),
('student', 'S091', NULL),
('student', 'S092', NULL),
('student', 'S093', NULL),
('student', 'S094', NULL),
('student', 'S095', NULL),
('student', 'S096', NULL),
('student', 'S097', NULL),
('student', 'S098', NULL),
('student', 'S099', NULL),
('student', 'S100', NULL),
('admin', 'Admin01', NULL),
('faculty', 'F01', 'C101'),
('faculty', 'F02', 'C102'),
('faculty', 'F03', 'C103'),
('faculty', 'F04', 'C104'),
('faculty', 'F05', 'C105'),
('canteen', 'Canteen1', NULL),
('canteen', 'Canteen2', NULL),
('library', 'Lib01', NULL);

INSERT INTO timetable (day, time_slot, room_name, course, instructor, expected_students) VALUES
-- MONDAY (Heavy Schedule)
('Monday', '09:00-10:00', 'C101', 'Calculus I', 'Prof. Rajesh Sharma', 22),
('Monday', '10:10-11:10', 'C102', 'Physics Mechanics', 'Prof. Anita Patel', 20),
('Monday', '11:20-12:20', 'C103', 'Data Structures', 'Prof. Vikram Gupta', 24),
('Monday', '14:00-15:00', 'C104', 'Digital Electronics', 'Prof. Meera Singh', 18),
('Monday', '15:10-16:10', 'C105', 'Chemistry Lab', 'Prof. Sanjay Desai', 15),

-- TUESDAY
('Tuesday', '09:00-10:00', 'C106', 'Linear Algebra', 'Prof. Priya Rao', 23),
('Tuesday', '10:10-11:10', 'C101', 'Computer Networks', 'Prof. Arjun Khan', 25),
('Tuesday', '11:20-12:20', 'C107', 'Thermodynamics', 'Prof. Neha Joshi', 19),
('Tuesday', '14:00-15:00', 'C108', 'Algorithms', 'Prof. Rahul Bose', 22),
('Tuesday', '15:10-16:10', 'C102', 'Electrical Circuits', 'Prof. Kavita Verma', 20),

-- WEDNESDAY
('Wednesday', '09:00-10:00', 'C103', 'Probability', 'Prof. Sunita Nair', 21),
('Wednesday', '10:10-11:10', 'C109', 'Operating Systems', 'Prof. Amit Iyer', 24),
('Wednesday', '14:00-15:00', 'C110', 'Machine Learning', 'Prof. Deepak Reddy', 25),
('Wednesday', '15:10-16:10', 'C104', 'Fluid Mechanics', 'Prof. Rina Malhotra', 18),

-- THURSDAY
('Thursday', '09:00-10:00', 'C105', 'Discrete Math', 'Prof. Karan Sethi', 20),
('Thursday', '10:10-11:10', 'C106', 'Database Systems', 'Prof. Pooja Agarwal', 23),
('Thursday', '11:20-12:20', 'C101', 'Signals & Systems', 'Prof. Vikrant Das', 22),
('Thursday', '14:00-15:00', 'C107', 'Control Systems', 'Prof. Mona Kapoor', 19),

-- FRIDAY (Light Schedule)
('Friday', '09:00-10:00', 'C108', 'Software Engineering', 'Prof. Sameer Khan', 21),
('Friday', '10:10-11:10', 'C109', 'Embedded Systems', 'Prof. Tara Menon', 20),
('Friday', '14:00-15:00', 'C110', 'Computer Vision', 'Prof. Nikhil Bhatia', 24);

-- SATURDAY & SUNDAY (HOLIDAY - Empty)
-- No entries = All rooms FREE!

-- Live empty rooms
-- PostgreSQL version of the demo query for the bot
SELECT room_name, (capacity - current_occupancy) * 4 AS empty_pct, distance_from_main
FROM classrooms
ORDER BY distance_from_main;

-- Current classes
-- Matches the current weekday and the current time against the time_slot range.
SELECT t.*, c.current_occupancy
FROM timetable t
JOIN classrooms c ON t.room_name = c.room_name
WHERE t.day = INITCAP(TRIM(TO_CHAR(NOW(), 'Day')))
    AND CURRENT_TIME >= TO_TIMESTAMP(SPLIT_PART(t.time_slot, '-', 1), 'HH24:MI')::time
    AND CURRENT_TIME < TO_TIMESTAMP(SPLIT_PART(t.time_slot, '-', 2), 'HH24:MI')::time;

-- Best empty classes to book right now
SELECT room_name, distance_from_main, (capacity - current_occupancy) AS free_seats
FROM classrooms
WHERE status = 'open' AND current_occupancy < capacity
ORDER BY current_occupancy ASC, distance_from_main ASC
LIMIT 5;
