require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const schemaSQL = `
DROP TABLE IF EXISTS timetable CASCADE;

CREATE TABLE timetable (
  id SERIAL PRIMARY KEY,
  semester VARCHAR(20),
  course_code VARCHAR(10),
  course_name VARCHAR(100),
  instructor VARCHAR(50),
  room_block VARCHAR(10),
  room_name VARCHAR(20),
  day_of_week VARCHAR(10),
  start_time TIME,
  end_time TIME,
  capacity INT,
  enrolled INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'scheduled'
);

CREATE INDEX idx_timetable_room_time ON timetable(room_name, start_time, end_time);
`;

const insertSQL = `
INSERT INTO timetable (semester, course_code, course_name, instructor, room_block, room_name, day_of_week, start_time, end_time, capacity, enrolled) VALUES
-- Monday
('Autumn2025', 'MA105', 'Calculus I', 'Prof. Sharma', 'LC', 'LC101', 'Monday', '08:30:00', '10:00:00', 150, 140),
('Autumn2025', 'CS101', 'Computer Programming', 'Prof. Kavi', 'LC', 'LC102', 'Monday', '09:00:00', '11:00:00', 150, 130),
('Autumn2025', 'PH107', 'Quantum Physics', 'Prof. Rao', 'LC', 'LC201', 'Monday', '10:00:00', '11:30:00', 150, 110),
('Autumn2025', 'CH105', 'Physical Chemistry', 'Prof. Das', 'LC', 'LC202', 'Monday', '11:30:00', '13:00:00', 150, 105),
('Autumn2025', 'EE101', 'Basic Electronics', 'Prof. Iyer', 'A', 'A101', 'Monday', '14:00:00', '15:30:00', 35, 30),
('Autumn2025', 'ME119', 'Engineering Graphics', 'Prof. Singh', 'IC', 'IC01', 'Monday', '14:00:00', '17:00:00', 110, 95),
('Autumn2025', 'HS101', 'Economics', 'Prof. Gupta', 'A', 'A301', 'Monday', '15:30:00', '17:00:00', 60, 50),
('Autumn2025', 'CE102', 'Engineering Mechanics', 'Prof. Patil', 'MMCR', 'MMCR1', 'Monday', '08:30:00', '10:00:00', 200, 180),
('Autumn2025', 'AE152', 'Aerodynamics', 'Prof. Kumar', 'B', 'B101', 'Monday', '10:30:00', '12:00:00', 40, 35),
('Autumn2025', 'BB101', 'Biology', 'Prof. Desai', 'C', 'C101', 'Monday', '11:00:00', '12:30:00', 50, 48),

-- Tuesday
('Autumn2025', 'MA105', 'Calculus I', 'Prof. Sharma', 'LC', 'LC101', 'Tuesday', '08:30:00', '10:00:00', 150, 140),
('Autumn2025', 'CS201', 'Data Structures', 'Prof. Kavi', 'LC', 'LC301', 'Tuesday', '09:00:00', '10:30:00', 150, 125),
('Autumn2025', 'EE201', 'Signals and Systems', 'Prof. Iyer', 'LC', 'LC302', 'Tuesday', '10:30:00', '12:00:00', 150, 130),
('Autumn2025', 'ME201', 'Solid Mechanics', 'Prof. Singh', 'LC', 'LC401', 'Tuesday', '14:00:00', '15:30:00', 120, 100),
('Autumn2025', 'CS215', 'Data Analysis', 'Prof. Reddy', 'MMCR', 'MMCR2', 'Tuesday', '15:30:00', '17:00:00', 180, 160),
('Autumn2025', 'HS201', 'Philosophy', 'Prof. Bose', 'A', 'A201', 'Tuesday', '14:00:00', '15:30:00', 45, 40),
('Autumn2025', 'CH107', 'Physical Chemistry Lab', 'Prof. Das', 'IC', 'IC02', 'Tuesday', '14:00:00', '17:00:00', 110, 90),
('Autumn2025', 'PH108', 'Physics Lab', 'Prof. Rao', 'IC', 'IC03', 'Tuesday', '09:30:00', '12:30:00', 90, 85),
('Autumn2025', 'CE201', 'Fluid Mechanics', 'Prof. Patil', 'C', 'C201', 'Tuesday', '11:00:00', '12:30:00', 60, 55),
('Autumn2025', 'AE201', 'Flight Dynamics', 'Prof. Kumar', 'B', 'B201', 'Tuesday', '08:30:00', '10:00:00', 50, 45),

-- Wednesday
('Autumn2025', 'CS101', 'Computer Programming', 'Prof. Kavi', 'LC', 'LC102', 'Wednesday', '09:00:00', '11:00:00', 150, 130),
('Autumn2025', 'CH105', 'Physical Chemistry', 'Prof. Das', 'LC', 'LC202', 'Wednesday', '11:30:00', '13:00:00', 150, 105),
('Autumn2025', 'EE101', 'Basic Electronics', 'Prof. Iyer', 'A', 'A101', 'Wednesday', '14:00:00', '15:30:00', 35, 30),
('Autumn2025', 'ME119', 'Engineering Graphics', 'Prof. Singh', 'IC', 'IC01', 'Wednesday', '14:00:00', '17:00:00', 110, 95),
('Autumn2025', 'HS101', 'Economics', 'Prof. Gupta', 'A', 'A301', 'Wednesday', '15:30:00', '17:00:00', 60, 50),
('Autumn2025', 'CE102', 'Engineering Mechanics', 'Prof. Patil', 'MMCR', 'MMCR1', 'Wednesday', '08:30:00', '10:00:00', 200, 180),
('Autumn2025', 'AE152', 'Aerodynamics', 'Prof. Kumar', 'B', 'B101', 'Wednesday', '10:30:00', '12:00:00', 40, 35),
('Autumn2025', 'BB101', 'Biology', 'Prof. Desai', 'C', 'C101', 'Wednesday', '11:00:00', '12:30:00', 50, 48),
('Autumn2025', 'CS301', 'Algorithms', 'Prof. Kavi', 'LC', 'LC402', 'Wednesday', '14:00:00', '15:30:00', 120, 90),
('Autumn2025', 'CS315', 'Databases', 'Prof. Reddy', 'LC', 'LC403', 'Wednesday', '15:30:00', '17:00:00', 100, 80),

-- Thursday
('Autumn2025', 'MA105', 'Calculus I', 'Prof. Sharma', 'LC', 'LC101', 'Thursday', '08:30:00', '10:00:00', 150, 140),
('Autumn2025', 'CS201', 'Data Structures', 'Prof. Kavi', 'LC', 'LC301', 'Thursday', '09:00:00', '10:30:00', 150, 125),
('Autumn2025', 'EE201', 'Signals and Systems', 'Prof. Iyer', 'LC', 'LC302', 'Thursday', '10:30:00', '12:00:00', 150, 130),
('Autumn2025', 'ME201', 'Solid Mechanics', 'Prof. Singh', 'LC', 'LC401', 'Thursday', '14:00:00', '15:30:00', 120, 100),
('Autumn2025', 'CS215', 'Data Analysis', 'Prof. Reddy', 'MMCR', 'MMCR2', 'Thursday', '15:30:00', '17:00:00', 180, 160),
('Autumn2025', 'HS201', 'Philosophy', 'Prof. Bose', 'A', 'A201', 'Thursday', '14:00:00', '15:30:00', 45, 40),
('Autumn2025', 'CH107', 'Physical Chemistry Lab', 'Prof. Das', 'IC', 'IC02', 'Thursday', '14:00:00', '17:00:00', 110, 90),
('Autumn2025', 'PH108', 'Physics Lab', 'Prof. Rao', 'IC', 'IC03', 'Thursday', '09:30:00', '12:30:00', 90, 85),
('Autumn2025', 'CE201', 'Fluid Mechanics', 'Prof. Patil', 'C', 'C201', 'Thursday', '11:00:00', '12:30:00', 60, 55),
('Autumn2025', 'AE201', 'Flight Dynamics', 'Prof. Kumar', 'B', 'B201', 'Thursday', '08:30:00', '10:00:00', 50, 45),

-- Friday
('Autumn2025', 'CS301', 'Algorithms', 'Prof. Kavi', 'LC', 'LC402', 'Friday', '14:00:00', '15:30:00', 120, 90),
('Autumn2025', 'CS315', 'Databases', 'Prof. Reddy', 'LC', 'LC403', 'Friday', '15:30:00', '17:00:00', 100, 80),
('Autumn2025', 'PH107', 'Quantum Physics', 'Prof. Rao', 'LC', 'LC201', 'Friday', '10:00:00', '11:30:00', 150, 110),
('Autumn2025', 'EE301', 'Digital Circuits', 'Prof. Iyer', 'D', 'D101', 'Friday', '09:00:00', '10:30:00', 30, 28),
('Autumn2025', 'ME301', 'Thermodynamics', 'Prof. Singh', 'D', 'D201', 'Friday', '10:30:00', '12:00:00', 45, 40),
('Autumn2025', 'CE301', 'Structural Analysis', 'Prof. Patil', 'D', 'D301', 'Friday', '14:00:00', '15:30:00', 30, 25),
('Autumn2025', 'AE301', 'Propulsion', 'Prof. Kumar', 'E', 'E101', 'Friday', '15:30:00', '17:00:00', 25, 20),
('Autumn2025', 'BB301', 'Genetics', 'Prof. Desai', 'E', 'E201', 'Friday', '09:00:00', '10:30:00', 35, 30),
('Autumn2025', 'HS301', 'Sociology', 'Prof. Gupta', 'E', 'E301', 'Friday', '10:30:00', '12:00:00', 45, 40),
('Autumn2025', 'MA301', 'Linear Algebra', 'Prof. Sharma', 'F', 'F101', 'Friday', '14:00:00', '15:30:00', 40, 35),

-- Saturday
('Autumn2025', 'CS101', 'Computer Programming (Extra)', 'Prof. Kavi', 'LC', 'LC102', 'Saturday', '09:00:00', '11:00:00', 150, 130),
('Autumn2025', 'MA105', 'Calculus I (Tutorial)', 'Prof. Sharma', 'LC', 'LC101', 'Saturday', '08:30:00', '10:00:00', 150, 140),

-- Sunday
('Autumn2025', 'HSS401', 'Ethics and Values', 'Prof. Bose', 'MMCR', 'MMCR1', 'Sunday', '10:00:00', '12:00:00', 200, 190);
`;

async function seed() {
  try {
    console.log('Seeding timetable table...');
    await pool.query(schemaSQL);
    await pool.query(insertSQL);
    console.log('Timetable table seeded successfully with 53 entries!');
  } catch (error) {
    console.error('Error seeding timetable:', error);
  } finally {
    pool.end();
  }
}

seed();
