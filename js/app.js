/* ============================
   CAMPUSFLOW — Main Application
   Full-stack campus decision engine
   ============================ */

// ============================
// DATA LAYER — API Integration
// ============================
const API = {
    async fetchTable(table, params = {}) {
        try {
            const query = new URLSearchParams(params).toString();
            const url = query ? `tables/${table}?${query}` : `tables/${table}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`API Error: ${res.status}`);
            return await res.json();
        } catch (e) {
            console.warn(`Failed to fetch ${table}:`, e.message);
            return null;
        }
    }
};

// ============================
// APP STATE
// ============================
const state = {
    timetable: [],
    classrooms: [],
    parking: [],
    campusZones: [],
    currentFilter: 'all',
    dataLoaded: false
};

// ============================
// FALLBACK DATA (used if API unavailable)
// ============================
const FALLBACK = {
    timetable: [
        { title: "Algorithms Lecture", location: "LT Block, Room 301", room_code: "LT-301", time_start: "09:00", time_end: "10:00", event_type: "class", icon: "book", note: "Prof. Sharma — bring notebook" },
        { title: "Campus Peak Hours", location: "Canteen Block & Central Lawn", room_code: "", time_start: "10:30", time_end: "11:15", event_type: "alert", icon: "warning", note: "Heavy crowd expected near canteen" },
        { title: "Free Period — Study Window", location: "Central Library — Reading Hall", room_code: "LIB-RH", time_start: "11:00", time_end: "12:00", event_type: "free", icon: "check", note: "18 open seats available" },
        { title: "Data Structures Lab", location: "LT Block, Lab 214B", room_code: "LT-214B", time_start: "13:00", time_end: "14:30", event_type: "lab", icon: "code", note: "Bring laptop — linked list assignment due" },
        { title: "Parking Rush Hour", location: "Gate 1 & Gate 2", room_code: "", time_start: "15:30", time_end: "16:30", event_type: "alert", icon: "car", note: "Gate 1 & Gate 2 near full — use Gate 3 lot" }
    ],
    classrooms: [
        { name: "Central Library — Reading Hall", building: "Central Library", total_seats: 50, occupied_seats: 16, occupancy_pct: 32, status: "available", noise_level: "Quiet", walk_time: 4, gradient_color: "peach" },
        { name: "Innovation Lab — Pod B", building: "Innovation Lab", total_seats: 12, occupied_seats: 4, occupancy_pct: 33, status: "available", noise_level: "Quiet", walk_time: 7, gradient_color: "mint" },
        { name: "Science Block — Open Atrium", building: "Science Block", total_seats: 40, occupied_seats: 9, occupancy_pct: 22, status: "available", noise_level: "Moderate", walk_time: 3, gradient_color: "rose" },
        { name: "Student Activity Centre — Room 105", building: "Student Activity Centre", total_seats: 30, occupied_seats: 11, occupancy_pct: 37, status: "available", noise_level: "Quiet", walk_time: 5, gradient_color: "sky" },
        { name: "Arts Block — Terrace Garden", building: "Arts Block", total_seats: 20, occupied_seats: 6, occupancy_pct: 30, status: "available", noise_level: "Moderate", walk_time: 9, gradient_color: "sage" },
        { name: "Mechanical Block — 4th Floor Lounge", building: "Mechanical Block", total_seats: 15, occupied_seats: 7, occupancy_pct: 47, status: "available", noise_level: "Moderate", walk_time: 2, gradient_color: "pink" }
    ],
    parking: [
        { gate_name: "Gate 1 Parking", total_spots: 120, available_spots: 12, occupancy_pct: 90, peak_time: "8:30 AM – 9:30 AM", tip: "Use Gate 3 parking — 40% empty right now" },
        { gate_name: "Gate 2 Parking", total_spots: 80, available_spots: 12, occupancy_pct: 85, peak_time: "9:00 AM – 10:00 AM", tip: "Fills up fast after 9 AM" },
        { gate_name: "Gate 3 Parking", total_spots: 100, available_spots: 60, occupancy_pct: 40, peak_time: "11:00 AM – 12:00 PM", tip: "Best option during morning rush" }
    ],
    campusZones: [
        { zone_name: "Canteen Block", crowd_pct: 85, peak_description: "1:00 PM – 2:00 PM", tip: "Visit before 12:30 PM to avoid rush", icon: "utensils" },
        { zone_name: "Central Library", crowd_pct: 72, peak_description: "Before Internals Week", tip: "Seats fill up fast — reach by 9:30 AM", icon: "book" },
        { zone_name: "Gate 1 Parking", crowd_pct: 90, peak_description: "8:30 AM – 9:30 AM", tip: "Use Gate 3 parking — 40% empty right now", icon: "car" },
        { zone_name: "Auditorium Area", crowd_pct: 60, peak_description: "Event days", tip: "Check notice board for event schedule", icon: "users" }
    ]
};

// ============================
// INITIALIZATION
// ============================
document.addEventListener('DOMContentLoaded', async () => {
    initClock();
    await loadAllData();
    renderTimeline();
    renderDensityGrid();
    renderSpacesGrid();
    initScrollObserver();
    initDotNav();
    initNavbar();
    initNotifications();
    initChat();
    initFilterButtons();
    initButtonActions();
    startLiveUpdates();
});

// ============================
// LIVE CLOCK
// ============================
function initClock() {
    updateClock();
    setInterval(updateClock, 1000);
}

function updateClock() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const period = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;

    const timeEl = document.getElementById('currentTime');
    const periodEl = document.getElementById('timePeriod');
    const dateEl = document.getElementById('currentDate');

    if (timeEl) timeEl.textContent = `${hours}:${minutes}`;
    if (periodEl) periodEl.textContent = period;

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (dateEl) dateEl.textContent = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`;

    // Update greeting based on time
    const greeting = hours < 12 && period === 'AM' ? 'Good Morning' : (hours < 5 && period === 'PM' ? 'Good Afternoon' : 'Good Evening');
    const headingEl = document.querySelector('.hero-heading');
    if (headingEl) {
        headingEl.innerHTML = `${greeting},<br><span class="text-red">Arjun.</span>`;
    }
}

// ============================
// DATA LOADING
// ============================
async function loadAllData() {
    const [timetableRes, classroomsRes, parkingRes, zonesRes] = await Promise.all([
        API.fetchTable('timetable', { limit: 100 }),
        API.fetchTable('classrooms', { limit: 100 }),
        API.fetchTable('parking', { limit: 100 }),
        API.fetchTable('campus_zones', { limit: 100 })
    ]);

    state.timetable = timetableRes?.data?.length ? timetableRes.data : FALLBACK.timetable;
    state.classrooms = classroomsRes?.data?.length ? classroomsRes.data : FALLBACK.classrooms;
    state.parking = parkingRes?.data?.length ? parkingRes.data : FALLBACK.parking;
    state.campusZones = zonesRes?.data?.length ? zonesRes.data : FALLBACK.campusZones;
    state.dataLoaded = true;

    updateNextMoveCard();
}

// ============================
// NEXT MOVE CARD (Hero)
// ============================
function updateNextMoveCard() {
    // Find next upcoming class/lab
    const classes = state.timetable.filter(e => e.event_type === 'class' || e.event_type === 'lab');
    const nextClass = classes.length > 0 ? classes[classes.length - 1] : null;

    if (nextClass) {
        const loc = document.getElementById('nmcLocation');
        const sub = document.getElementById('nmcSub');
        if (loc) loc.textContent = nextClass.location.split(',')[0] || 'LT Block (Lecture Hall Complex)';
        if (sub) sub.textContent = `${nextClass.room_code} · ${nextClass.title}`;
    }

    // Find best parking
    const bestParking = state.parking.reduce((best, p) => 
        (p.available_spots > (best?.available_spots || 0)) ? p : best, state.parking[0]);

    const parkingEl = document.getElementById('metricParking');
    if (parkingEl && bestParking) {
        parkingEl.textContent = `${bestParking.gate_name.replace(' Parking', '')} — ${bestParking.available_spots} spots`;
    }

    // Room occupancy as percentage
    const targetRoom = state.classrooms.find(c => c.name.includes('Reading Hall')) || state.classrooms[0];
    const roomEl = document.getElementById('metricRoom');
    if (roomEl && targetRoom) {
        roomEl.textContent = `${targetRoom.occupancy_pct}% filled`;
    }
}

// ============================
// TIMELINE
// ============================
function renderTimeline() {
    const container = document.getElementById('timeline');
    if (!container) return;

    const iconMap = {
        class: 'fa-book',
        lab: 'fa-laptop-code',
        free: 'fa-check',
        alert: 'fa-exclamation-triangle'
    };

    container.innerHTML = state.timetable.map((item, i) => `
        <div class="timeline-item" data-index="${i}" style="transition-delay: ${i * 0.1}s">
            <div class="timeline-marker ${item.event_type}">
                <i class="fas ${iconMap[item.event_type] || 'fa-circle'}"></i>
            </div>
            <div class="timeline-card ${i === 1 ? 'active' : ''}" onclick="selectTimelineItem(${i})">
                <div class="timeline-time">${item.time_start}</div>
                <div class="timeline-title">${item.title}</div>
                <div class="timeline-loc">${item.location}</div>
            </div>
        </div>
    `).join('');
}

function selectTimelineItem(index) {
    const item = state.timetable[index];
    if (!item) return;

    // Update active card
    document.querySelectorAll('.timeline-card').forEach((c, i) => {
        c.classList.toggle('active', i === index);
    });

    // Update detail card
    const titleEl = document.getElementById('alertTitle');
    const timeEl = document.getElementById('alertTime');
    const descEl = document.getElementById('alertDesc');

    if (item.event_type === 'alert') {
        if (titleEl) titleEl.textContent = item.title;
        if (timeEl) timeEl.textContent = `${item.time_start} — ${item.time_end}`;
        if (descEl) descEl.textContent = item.note;
    } else {
        if (titleEl) titleEl.textContent = `Upcoming: ${item.title}`;
        if (timeEl) timeEl.textContent = `${item.time_start} — ${item.time_end}`;
        if (descEl) descEl.textContent = `${item.location}. ${item.note}`;
    }
}

// ============================
// DENSITY GRID
// ============================
function renderDensityGrid() {
    const container = document.getElementById('densityGrid');
    if (!container) return;

    const iconMap = {
        utensils: 'fa-utensils',
        book: 'fa-book',
        car: 'fa-car',
        users: 'fa-users'
    };

    const colorMap = {
        utensils: { bg: '#FEE2E2', color: '#EF4444' },
        book: { bg: '#FEF3C7', color: '#F59E0B' },
        car: { bg: '#FEE2E2', color: '#EF4444' },
        users: { bg: '#FEF3C7', color: '#F59E0B' }
    };

    const barColorMap = (pct) => {
        if (pct >= 85) return 'linear-gradient(90deg, #EF4444, #DC2626)';
        if (pct >= 70) return 'linear-gradient(90deg, #F59E0B, #EF4444)';
        if (pct >= 50) return 'linear-gradient(90deg, #F59E0B, #FBBF24)';
        return 'linear-gradient(90deg, #22C55E, #86EFAC)';
    };

    container.innerHTML = state.campusZones.map((zone, i) => {
        const icon = iconMap[zone.icon] || 'fa-map-marker-alt';
        const colors = colorMap[zone.icon] || { bg: '#FEF3C7', color: '#F59E0B' };

        return `
            <div class="density-card" style="transition-delay: ${i * 0.1}s">
                <div class="density-card-header">
                    <div class="density-card-left">
                        <div class="density-icon" style="background: ${colors.bg}; color: ${colors.color}">
                            <i class="fas ${icon}"></i>
                        </div>
                        <div>
                            <h3>${zone.zone_name}</h3>
                            <div class="density-peak">Peak: ${zone.peak_description}</div>
                        </div>
                    </div>
                    <div class="density-pct" style="color: ${zone.crowd_pct >= 80 ? '#EF4444' : zone.crowd_pct >= 60 ? '#F59E0B' : '#22C55E'}">${zone.crowd_pct}%</div>
                </div>
                <div class="density-bar">
                    <div class="density-bar-fill" style="width: 0%; background: ${barColorMap(zone.crowd_pct)}" data-width="${zone.crowd_pct}%"></div>
                </div>
                <div class="density-tip">
                    <i class="fas fa-lightbulb"></i>
                    <span>${zone.tip}</span>
                </div>
            </div>
        `;
    }).join('');
}

// ============================
// SPACES GRID (with percentages)
// ============================
function renderSpacesGrid(filter = 'all') {
    const container = document.getElementById('spacesGrid');
    if (!container) return;

    let rooms = state.classrooms.filter(r => r.status === 'available');
    if (filter === 'quiet') {
        rooms = rooms.filter(r => r.noise_level === 'Quiet');
    }

    const typeIcons = {
        'Central Library': 'fa-book-reader',
        'Innovation Lab': 'fa-lightbulb',
        'Science Block': 'fa-flask',
        'Student Activity Centre': 'fa-users',
        'Arts Block': 'fa-paint-brush',
        'Mechanical Block': 'fa-laptop'
    };

    container.innerHTML = rooms.map((room, i) => {
        const icon = typeIcons[room.building] || 'fa-door-open';
        const availPct = 100 - room.occupancy_pct;
        const noiseBars = getNoiseBars(room.noise_level);

        return `
            <div class="space-card" style="transition-delay: ${i * 0.08}s" data-noise="${room.noise_level}">
                <div class="space-card-gradient ${room.gradient_color}">
                    <span class="space-available-badge"><i class="fas fa-check"></i> AVAILABLE</span>
                    <div class="space-type-icon"><i class="fas ${icon}"></i></div>
                </div>
                <div class="space-card-body">
                    <h3>${room.name}</h3>
                    <div class="space-meta">
                        <span><i class="fas fa-map-pin"></i> ${room.walk_time} min walk</span>
                        <span><i class="fas fa-chair"></i> ${availPct}% available</span>
                    </div>
                    <div class="noise-indicator">
                        <div class="noise-bars">${noiseBars}</div>
                        <span>${room.noise_level}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Re-trigger scroll animation
    setTimeout(() => {
        container.querySelectorAll('.space-card').forEach(card => {
            card.classList.add('visible');
        });
    }, 50);
}

function getNoiseBars(level) {
    if (level === 'Quiet') {
        return `
            <div class="noise-bar active low"></div>
            <div class="noise-bar active low"></div>
            <div class="noise-bar"></div>
        `;
    } else if (level === 'Moderate') {
        return `
            <div class="noise-bar active mid"></div>
            <div class="noise-bar active mid"></div>
            <div class="noise-bar active mid"></div>
        `;
    } else {
        return `
            <div class="noise-bar active high"></div>
            <div class="noise-bar active high"></div>
            <div class="noise-bar active high"></div>
        `;
    }
}

// ============================
// FILTER BUTTONS
// ============================
function initFilterButtons() {
    const allBtn = document.getElementById('filterAll');
    const quietBtn = document.getElementById('filterQuiet');

    if (allBtn) {
        allBtn.addEventListener('click', () => {
            allBtn.classList.add('active');
            quietBtn.classList.remove('active');
            state.currentFilter = 'all';
            renderSpacesGrid('all');
        });
    }

    if (quietBtn) {
        quietBtn.addEventListener('click', () => {
            quietBtn.classList.add('active');
            allBtn.classList.remove('active');
            state.currentFilter = 'quiet';
            renderSpacesGrid('quiet');
        });
    }
}

// ============================
// SCROLL OBSERVER (Animations)
// ============================
function initScrollObserver() {
    const observerOptions = {
        root: null,
        rootMargin: '0px 0px -80px 0px',
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');

                // Animate density bars
                if (entry.target.classList.contains('density-card')) {
                    const fill = entry.target.querySelector('.density-bar-fill');
                    if (fill) {
                        setTimeout(() => {
                            fill.style.width = fill.dataset.width;
                        }, 200);
                    }
                }

                // Animate stat counters
                if (entry.target.classList.contains('stat-item')) {
                    animateCounter(entry.target);
                }
            }
        });
    }, observerOptions);

    // Observe all animatable elements
    const targets = document.querySelectorAll(
        '.signal-card, .step-item, .density-card, .space-card, .feature-card, .stat-item, .timeline-item'
    );
    targets.forEach(t => observer.observe(t));
}

// ============================
// COUNTER ANIMATION
// ============================
function animateCounter(el) {
    const numberEl = el.querySelector('.stat-number');
    if (!numberEl || numberEl.dataset.animated) return;
    numberEl.dataset.animated = 'true';

    const target = parseFloat(numberEl.dataset.count);
    const isDecimal = target % 1 !== 0;
    const duration = 1500;
    const start = Date.now();

    function tick() {
        const elapsed = Date.now() - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        const current = target * eased;

        numberEl.textContent = isDecimal ? current.toFixed(1) : Math.round(current);

        if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

// ============================
// DOT NAVIGATION
// ============================
function initDotNav() {
    const dots = document.querySelectorAll('.dot-nav .dot');
    const sections = ['hero', 'signals', 'nextmove', 'alerts', 'density', 'spaces', 'why', 'features'];

    dots.forEach(dot => {
        dot.addEventListener('click', () => {
            const section = dot.dataset.section;
            const el = document.getElementById(section);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

    // Update active dot on scroll
    const sectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.id;
                dots.forEach(d => d.classList.toggle('active', d.dataset.section === id));
            }
        });
    }, { rootMargin: '-40% 0px -40% 0px', threshold: 0 });

    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) sectionObserver.observe(el);
    });
}

// ============================
// NAVBAR SCROLL EFFECT
// ============================
function initNavbar() {
    window.addEventListener('scroll', () => {
        const navbar = document.getElementById('navbar');
        if (navbar) {
            navbar.classList.toggle('scrolled', window.scrollY > 20);
        }
    });
}

// ============================
// NOTIFICATIONS
// ============================
function initNotifications() {
    const btn = document.getElementById('notifBtn');
    const panel = document.getElementById('notifPanel');
    const close = document.getElementById('notifClose');

    if (btn && panel) {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.classList.toggle('open');
        });
    }

    if (close) {
        close.addEventListener('click', () => {
            panel.classList.remove('open');
        });
    }

    document.addEventListener('click', (e) => {
        if (panel && !panel.contains(e.target) && e.target !== btn) {
            panel.classList.remove('open');
        }
    });
}

// ============================
// CHAT SYSTEM
// ============================
function initChat() {
    const input = document.getElementById('chatInput');
    const sendBtn = document.getElementById('chatSend');
    const responsePanel = document.getElementById('chatResponsePanel');
    const messages = document.getElementById('chatMessages');
    const closeBtn = document.getElementById('chatResponseClose');

    if (!input || !sendBtn) return;

    function handleSend() {
        const query = input.value.trim();
        if (!query) return;

        // Show user message
        responsePanel.classList.add('open');
        responsePanel.style.display = 'block';
        responsePanel.style.opacity = '1';

        messages.innerHTML += `<div class="chat-msg user">${escapeHtml(query)}</div>`;

        // Generate response
        const response = generateChatResponse(query);
        setTimeout(() => {
            messages.innerHTML += `<div class="chat-msg">${response}</div>`;
            messages.scrollTop = messages.scrollHeight;
        }, 500);

        input.value = '';
    }

    sendBtn.addEventListener('click', handleSend);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSend();
    });

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            responsePanel.classList.remove('open');
            responsePanel.style.display = 'none';
        });
    }
}

function generateChatResponse(query) {
    const q = query.toLowerCase();

    // Parking queries
    if (q.includes('parking') || q.includes('park') || q.includes('gate')) {
        const best = state.parking.reduce((b, p) => p.available_spots > (b?.available_spots || 0) ? p : b, state.parking[0]);
        return `🅿️ <strong>Parking Update:</strong><br>
        Best option right now: <strong>${best.gate_name}</strong> with ${best.available_spots} spots available (${100 - best.occupancy_pct}% free).<br>
        ${best.tip}`;
    }

    // Class/schedule queries
    if (q.includes('class') || q.includes('next') || q.includes('schedule') || q.includes('timetable')) {
        const classes = state.timetable.filter(e => e.event_type === 'class' || e.event_type === 'lab');
        if (classes.length > 0) {
            const next = classes[0];
            return `📚 <strong>Next Class:</strong><br>
            <strong>${next.title}</strong> at ${next.time_start}<br>
            📍 ${next.location}<br>
            💡 ${next.note}`;
        }
        return `📚 No upcoming classes found in your schedule right now.`;
    }

    // Study spot queries
    if (q.includes('study') || q.includes('quiet') || q.includes('library') || q.includes('seat')) {
        const quietSpots = state.classrooms.filter(c => c.noise_level === 'Quiet' && c.status === 'available');
        if (quietSpots.length > 0) {
            const best = quietSpots.reduce((b, s) => s.occupancy_pct < b.occupancy_pct ? s : b, quietSpots[0]);
            const avail = 100 - best.occupancy_pct;
            return `📖 <strong>Best Study Spot:</strong><br>
            <strong>${best.name}</strong> — ${avail}% available<br>
            🚶 ${best.walk_time} min walk · 🔇 ${best.noise_level}<br>
            Great choice for focused study!`;
        }
        return `📖 Checking quiet spots... all seem occupied right now. Try again in a few minutes.`;
    }

    // Crowd/density queries
    if (q.includes('crowd') || q.includes('busy') || q.includes('rush') || q.includes('canteen')) {
        const zones = state.campusZones.sort((a, b) => b.crowd_pct - a.crowd_pct);
        const busiest = zones[0];
        return `👥 <strong>Campus Density:</strong><br>
        Most crowded: <strong>${busiest.zone_name}</strong> at ${busiest.crowd_pct}%<br>
        💡 ${busiest.tip}<br>
        Least crowded area: <strong>${zones[zones.length-1].zone_name}</strong> at ${zones[zones.length-1].crowd_pct}%`;
    }

    // Room queries
    if (q.includes('room') || q.includes('available') || q.includes('space')) {
        const available = state.classrooms.filter(c => c.status === 'available');
        return `🏫 <strong>${available.length} rooms available:</strong><br>
        ${available.slice(0, 3).map(r => `• ${r.name} — ${100 - r.occupancy_pct}% free, ${r.walk_time}min walk`).join('<br>')}`;
    }

    // Default
    return `👋 I can help you with:<br>
    • <strong>Parking</strong> — "Where should I park?"<br>
    • <strong>Classes</strong> — "What's my next class?"<br>
    • <strong>Study spots</strong> — "Find me a quiet place"<br>
    • <strong>Campus crowd</strong> — "Is the canteen busy?"<br>
    • <strong>Available rooms</strong> — "Any rooms free?"`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================
// BUTTON ACTIONS
// ============================
function initButtonActions() {
    const startPlanBtn = document.getElementById('startPlanBtn');
    const exploreCampusBtn = document.getElementById('exploreCampusBtn');
    const getStartedBtn = document.getElementById('getStartedBtn');

    if (startPlanBtn) {
        startPlanBtn.addEventListener('click', () => {
            const nextMoveCard = document.getElementById('nextMoveCard');
            if (nextMoveCard) {
                nextMoveCard.style.transition = 'all 0.3s ease';
                nextMoveCard.style.transform = 'scale(1.02)';
                nextMoveCard.style.boxShadow = '0 16px 48px rgba(232,18,10,0.15)';
                setTimeout(() => {
                    nextMoveCard.style.transform = '';
                    nextMoveCard.style.boxShadow = '';
                }, 600);
            }
            // Scroll to the card on mobile
            if (window.innerWidth < 1024) {
                document.querySelector('.hero-right')?.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }

    if (exploreCampusBtn) {
        exploreCampusBtn.addEventListener('click', () => {
            document.getElementById('signals')?.scrollIntoView({ behavior: 'smooth' });
        });
    }

    if (getStartedBtn) {
        getStartedBtn.addEventListener('click', () => {
            document.getElementById('hero')?.scrollIntoView({ behavior: 'smooth' });
        });
    }

    // Alt route button
    const altRouteBtn = document.querySelector('.alt-route-btn');
    if (altRouteBtn) {
        altRouteBtn.addEventListener('click', () => {
            const chevron = altRouteBtn.querySelector('.fa-chevron-down');
            chevron?.classList.toggle('fa-chevron-down');
            chevron?.classList.toggle('fa-chevron-up');

            // Toggle a simple expansion
            let detail = altRouteBtn.nextElementSibling;
            if (!detail || !detail.classList.contains('route-detail')) {
                detail = document.createElement('div');
                detail.className = 'route-detail';
                detail.style.cssText = 'padding: 14px; background: #F0FDF4; border-radius: 12px; margin-top: 10px; font-size: 14px; color: #166534; line-height: 1.6;';
                detail.innerHTML = `
                    <strong>🗺️ Alternative Route:</strong><br>
                    Instead of crossing Central Lawn, take the side path through Science Block.<br>
                    Estimated walk: 4 min | Avoids crowd zone near Canteen Block.
                `;
                altRouteBtn.parentNode.insertBefore(detail, altRouteBtn.nextSibling);
            } else {
                detail.remove();
            }
        });
    }

    // Explore map button
    const exploreMapBtn = document.querySelector('.explore-map-btn');
    if (exploreMapBtn) {
        exploreMapBtn.addEventListener('click', () => {
            document.getElementById('density')?.scrollIntoView({ behavior: 'smooth' });
        });
    }
}

// ============================
// LIVE DATA UPDATES (Simulation)
// ============================
function startLiveUpdates() {
    // Simulate minor data changes every 30 seconds
    setInterval(() => {
        if (!state.dataLoaded) return;

        // Slightly randomize occupancy percentages
        state.classrooms.forEach(room => {
            const change = Math.floor(Math.random() * 5) - 2; // -2 to +2
            room.occupancy_pct = Math.max(10, Math.min(95, room.occupancy_pct + change));
            room.occupied_seats = Math.round(room.total_seats * room.occupancy_pct / 100);
        });

        // Slightly randomize parking
        state.parking.forEach(lot => {
            const change = Math.floor(Math.random() * 3) - 1;
            lot.available_spots = Math.max(2, Math.min(lot.total_spots - 5, lot.available_spots + change));
            lot.occupancy_pct = Math.round(100 - (lot.available_spots / lot.total_spots * 100));
        });

        // Slightly randomize campus zones
        state.campusZones.forEach(zone => {
            const change = Math.floor(Math.random() * 4) - 1;
            zone.crowd_pct = Math.max(20, Math.min(98, zone.crowd_pct + change));
        });

        // Re-render dynamic sections
        renderSpacesGrid(state.currentFilter);
        renderDensityGrid();
        updateNextMoveCard();

        // Re-observe new density cards for animation
        document.querySelectorAll('.density-card').forEach(card => {
            card.classList.add('visible');
            const fill = card.querySelector('.density-bar-fill');
            if (fill) fill.style.width = fill.dataset.width;
        });

        // Flash the LIVE badge
        const liveBadge = document.querySelector('.live-badge');
        if (liveBadge) {
            liveBadge.style.background = '#D1FAE5';
            setTimeout(() => {
                liveBadge.style.background = '';
            }, 800);
        }
    }, 30000);
}
