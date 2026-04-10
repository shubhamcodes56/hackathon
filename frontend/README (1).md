# CampusFlow — Your Campus, One Smart Decision at a Time

## 🎯 Project Overview
CampusFlow is a full-stack campus decision-support dashboard that combines timetable data, real-time room occupancy, and parking availability into one unified, intelligent interface. It helps students make quick decisions about where to go, where to park, and where to study — all in one glance.

**Renamed from NeoFuture → CampusFlow** per requirements.

## ✅ Completed Features

### 1. Hero Section
- Live real-time clock with greeting (Good Morning/Afternoon/Evening)
- System status indicator (LIVE green dot)
- "Your Next Move" recommendation card with:
  - Location & room info
  - Start time, walk time
  - **Parking spots** (from live API data)
  - **Room occupancy shown as percentage** (changed from seat numbers)
  - Confidence progress bar (94%)
  - Smart tip strip

### 2. Three Signals Section
- Timetable (SYNCED badge)
- Classrooms (LIVE badge) — shows occupancy %
- Parking (LIVE badge)
- Visual "plus" fusion between cards

### 3. Your Next Move — How It Works
- 3-step process: Analyze → Optimize → Recommend
- Centered feature card with icon

### 4. Smart Alerts Section
- Interactive timeline with 5 events:
  - Algorithms Lecture, Campus Peak Hours, Free Period, Data Structures Lab, Parking Rush Hour
- Click any timeline card to update the alert detail panel
- Alert detail card with:
  - Congestion level progress bar (82%)
  - Affected areas tags
  - Expandable "View Alternative Route" with actual route suggestion

### 5. Campus Density Section
- 4 zone cards: Canteen Block (85%), Central Library (72%), Gate 1 Parking (90%), Auditorium Area (60%)
- Color-coded progress bars (red/orange/green)
- Peak time info and smart tips

### 6. Quiet Spaces Section
- 6 study spot cards with pastel gradient headers
- **All availability shown as percentages** (not seat numbers)
- Filter: "All Spaces" / "Quiet Only"
- Noise level indicator bars (Quiet/Moderate)
- Walk time and availability metadata

### 7. Why CampusFlow (Stats)
- Animated counter: 8min saved, 94% accuracy, 2.4k decisions
- Three feature cards: Smart Decisions, Real-Time Context, One-Tap Actions

### 8. Floating Chat Bar
- Fixed at bottom of viewport
- Handles queries about:
  - Parking ("Where should I park?")
  - Classes ("What's my next class?")
  - Study spots ("Find me a quiet place")
  - Campus crowd ("Is the canteen busy?")
  - Available rooms ("Any rooms free?")
- Response panel with user/bot messages

### 9. Notification Panel
- Bell icon in navbar
- 3 sample notifications: Parking Alert, Class Reminder, Timetable Synced

### 10. Dot Navigation
- Right-side dot navigation for quick section jumping
- Active dot tracks current scroll position

### 11. Live Data Updates
- Data refreshes every 30 seconds with slight randomization
- LIVE badge flashes on update
- All grids re-render with fresh data

## 📁 Project Structure
```
index.html              — Main single-page application
css/style.css           — Full stylesheet (warm cream theme)
js/app.js               — Application logic, API integration, interactivity
README.md               — This file
```

## 🔗 Entry URIs
| Path | Description |
|------|-------------|
| `index.html` | Main application (all sections) |
| `index.html#hero` | Hero section |
| `index.html#signals` | Three Signals section |
| `index.html#nextmove` | Your Next Move section |
| `index.html#alerts` | Smart Alerts + Timeline |
| `index.html#density` | Campus Density |
| `index.html#spaces` | Quiet Spaces |
| `index.html#why` | Why CampusFlow stats |
| `index.html#features` | Features + CTA |

## 📊 Data Models (RESTful API Tables)

### `timetable`
| Field | Type | Description |
|-------|------|-------------|
| id | text | Unique ID |
| title | text | Event title |
| location | text | Building & room |
| room_code | text | Room code |
| time_start / time_end | text | Time range |
| event_type | text | class, lab, free, alert |
| note | text | Smart tip |

### `classrooms`
| Field | Type | Description |
|-------|------|-------------|
| id | text | Unique ID |
| name | text | Room name |
| building | text | Building |
| total_seats | number | Capacity |
| occupancy_pct | number | **Occupancy %** (0-100) |
| status | text | available, occupied, maintenance |
| noise_level | text | Quiet, Moderate, Loud |
| walk_time | number | Minutes |
| gradient_color | text | Card color theme |

### `parking`
| Field | Type | Description |
|-------|------|-------------|
| id | text | Unique ID |
| gate_name | text | Gate name |
| total_spots / available_spots | number | Spot counts |
| occupancy_pct | number | Usage % |
| peak_time | text | Peak hours |
| tip | text | Smart tip |

### `campus_zones`
| Field | Type | Description |
|-------|------|-------------|
| id | text | Unique ID |
| zone_name | text | Zone name |
| crowd_pct | number | Crowd density % |
| peak_description | text | When peak occurs |
| tip | text | Avoidance tip |

## 🔄 What Changed from Original Design
1. **Renamed** NeoFuture → **CampusFlow**
2. **Classroom seats** changed from "24/40 seats" to **percentage** format ("60% filled", "68% available")
3. **Removed** AI/ML specific language (no "AI PICK", replaced with "PICK"; toned down machine learning claims)
4. **Full-stack implementation**: All data flows through RESTful Table API with fallbacks
5. **Interactive chat** that actually responds with live data from the database
6. **Live data simulation** — occupancy, parking, crowd numbers update every 30 seconds

## 🚀 Recommended Next Steps
1. **User authentication** — Login system to personalize timetable per student
2. **Push notifications** — Browser notifications for upcoming classes/alerts
3. **Campus map integration** — Interactive map showing building locations
4. **Historical analytics** — Charts showing crowd patterns over the week
5. **Mobile PWA** — Add service worker for offline support
6. **Admin dashboard** — For campus staff to manage room/parking data
