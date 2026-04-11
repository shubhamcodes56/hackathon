document.addEventListener('DOMContentLoaded', () => {
    // === SELECTORS ===
    const chatInput = document.getElementById('chatInput');
    const chatSend = document.getElementById('chatSend');
    const greetingName = document.getElementById('greeting-name');
    const avatar = document.querySelector('.avatar');

    // Hero / Next Move
    const nmcLocation = document.getElementById('nmcLocation');
    const nmcSub = document.getElementById('nmcSub');
    const metricStartsIn = document.getElementById('metricStartsIn');
    const metricWalk = document.getElementById('metricWalk');
    const metricParking = document.getElementById('metricParking');
    const metricRoom = document.getElementById('metricRoom');
    const confFill = document.getElementById('confFill');
    const confValue = document.getElementById('confValue');
    const nmcTip = document.getElementById('nmcTip');

    // Alerts
    const alertTitle = document.getElementById('alertTitle');
    const alertTime = document.getElementById('alertTime');
    const alertDesc = document.getElementById('alertDesc');
    const congFill = document.getElementById('congFill');
    const congValue = document.getElementById('congValue');
    const affectedAreas = document.getElementById('affectedAreas');
    const timelineEl = document.getElementById('timeline');

    // Grid Sections
    const densityGrid = document.getElementById('densityGrid');
    const spacesGrid = document.getElementById('spacesGrid');
    const signalCards = Array.from(document.querySelectorAll('.signal-card'));

    // Section Subtitles & Callouts
    const signalsSectionSub = document.getElementById('signalsSectionSub');
    const signalsCallout = document.getElementById('signalsCalloutText'); // Match HTML
    const alertsSectionSub = document.getElementById('alertsSectionSub');
    const alertsCallout = document.getElementById('alertsCallout');
    const densitySectionSub = document.getElementById('densitySectionSub');
    const densityCallout = document.getElementById('densityCallout');
    const spacesSectionSub = document.getElementById('spacesSectionSub');
    const spacesCallout = document.getElementById('spacesCallout');

    // Stats
    const avgTimeStat = document.getElementById('avgTimeStat');
    const accuracyStat = document.getElementById('accuracyStat');
    const decisionsStat = document.getElementById('decisionsStat');

    // === API HELPERS ===
    function apiBases() {
        const bases = [];
        if (window.location.port === '5000') bases.push('');
        bases.push('http://127.0.0.1:5000');
        bases.push('http://localhost:5000');
        if (window.location.hostname && window.location.hostname !== 'localhost') {
            bases.push(`http://${window.location.hostname}:5000`);
        }
        return [...new Set(bases)];
    }

    async function fetchWithFallback(path, options) {
        let lastErr = null;
        for (const base of apiBases()) {
            try {
                const res = await fetch(base + path, options);
                return res; // Return regardless of status — let callers handle error status
            } catch (err) {
                lastErr = err; // Only retry on network errors
            }
        }
        throw lastErr || new Error('Backend unreachable');
    }

    function loadAuthProfile() {
        try {
            const raw = localStorage.getItem('campusflow_auth');
            return raw ? JSON.parse(raw) : null;
        } catch (_err) {
            return null;
        }
    }

    function saveAuthProfile(profile) {
        localStorage.setItem('campusflow_auth', JSON.stringify(profile));
    }

    function clearAuthProfile() {
        localStorage.removeItem('campusflow_auth');
    }

    function localPart(email) {
        return String(email || '').split('@')[0].trim();
    }

    function titleCase(value) {
        return String(value || '')
            .replace(/[._-]+/g, ' ')
            .trim()
            .replace(/\b\w/g, (char) => char.toUpperCase()) || 'Guest';
    }

    function initialsFrom(value) {
        return String(value || '')
            .split(/[\s._-]+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0].toUpperCase())
            .join('') || 'U';
    }

    function requireAuth() {
        const profile = loadAuthProfile();
        if (!profile || !profile.accessToken || !profile.email) {
            window.location.replace('/auth.html');
            return null;
        }
        return profile;
    }

    function renderUserIdentity(profile) {
        if (!profile) return;

        const username = profile.username || localPart(profile.email);
        const fullName = profile.full_name || profile.fullName || username;

        if (greetingName) {
            greetingName.textContent = `${username}.`;
        }

        if (avatar) {
            avatar.textContent = initialsFrom(username || profile.email);
            avatar.title = `${fullName} • ${profile.email}`;
        }

        const navRight = document.querySelector('.nav-right');
        if (navRight && !document.getElementById('userChip')) {
            const chip = document.createElement('div');
            chip.className = 'user-chip';
            chip.id = 'userChip';
            chip.innerHTML = `
                <div class="user-chip-copy">
                    <span class="user-chip-name">${username}</span>
                    <span class="user-chip-email">${profile.email}</span>
                </div>
                <button type="button" class="user-chip-logout" id="userLogoutBtn">Sign out</button>
            `;
            navRight.prepend(chip);

            const logoutBtn = chip.querySelector('#userLogoutBtn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', () => {
                    clearAuthProfile();
                    window.location.href = '/auth.html';
                });
            }
        }

        const appTitle = document.querySelector('title');
        if (appTitle) {
            appTitle.textContent = `CampusFlow — ${username}`;
        }
    }

    const authProfile = requireAuth();
    if (!authProfile) return;
    renderUserIdentity(authProfile);

    // === UI UPDATERS ===

    function updateNextMove(nextMove) {
        if (!nextMove) return;
        if (nmcLocation) nmcLocation.textContent = nextMove.location || 'Campus';
        if (nmcSub) nmcSub.textContent = nextMove.roomLabel || 'Live recommendation';
        if (metricStartsIn) metricStartsIn.textContent = nextMove.startsIn || 'Now';
        if (metricWalk) metricWalk.textContent = nextMove.walkTime || '5 min';
        if (metricParking) metricParking.textContent = nextMove.parking || 'Near Gate 1';
        if (metricRoom) metricRoom.textContent = nextMove.roomOccupancy || 'Available';

        const confidence = Number(nextMove.confidence || 90);
        if (confFill) confFill.style.width = `${confidence}%`;
        if (confValue) confValue.textContent = `${confidence}%`;
        if (nmcTip) nmcTip.textContent = nextMove.tip || 'Follow your schedule for the smoothest experience.';
    }

    function updateAlert(alert) {
        if (!alert) return;
        if (alertTitle) alertTitle.textContent = alert.title || 'Busy Period Ahead';
        if (alertTime) alertTime.textContent = alert.timeWindow || '--:--';
        if (alertDesc) alertDesc.textContent = alert.description || 'Monitor campus movement for updates.';

        const cong = Number(alert.congestion || 0);
        if (congFill) congFill.style.width = `${cong}%`;
        if (congValue) congValue.textContent = `${cong}%`;

        if (affectedAreas) {
            const tagsWrap = affectedAreas.querySelector('.area-tags');
            if (tagsWrap && Array.isArray(alert.affectedAreas)) {
                tagsWrap.innerHTML = alert.affectedAreas
                    .map(a => `<span class="area-tag">${String(a).toUpperCase()}</span>`)
                    .join('');
            }
        }
    }

    function renderTimeline(items) {
        if (!timelineEl || !Array.isArray(items)) return;
        const iconFor = (type) => {
            if (type === 'lab') return 'fa-microscope';
            if (type === 'free') return 'fa-mug-hot';
            return 'fa-book';
        };
        timelineEl.innerHTML = items.slice(0, 3).map((item, idx) => `
            <div class="timeline-item ${idx === 0 ? 'active' : ''}">
                <div class="timeline-marker ${item.type || 'class'}"><i class="fas ${iconFor(item.type)}"></i></div>
                <div class="timeline-card ${idx === 0 ? 'active' : ''}">
                    <div class="timeline-time">${item.time || 'Scheduled'}</div>
                    <div class="timeline-title">${item.title || 'Campus Event'}</div>
                    <div class="timeline-loc"><i class="fas fa-map-marker-alt"></i> ${item.location || 'Campus'}</div>
                </div>
            </div>
        `).join('');
    }

    function renderDensity(items) {
        if (!densityGrid || !Array.isArray(items)) return;
        const colorFor = (v) => v >= 75 ? 'var(--red)' : v >= 45 ? 'var(--orange)' : 'var(--green)';

        densityGrid.innerHTML = items.slice(0, 4).map((d) => {
            const crowd = Number(d.crowdPct || 0);
            const color = colorFor(crowd);
            const bgClass = crowd >= 75 ? 'red-bg' : crowd >= 45 ? 'orange-bg' : 'green-bg';
            const icon = crowd >= 75 ? 'fa-exclamation-triangle' : crowd >= 45 ? 'fa-users' : 'fa-leaf';

            return `
            <div class="density-card" data-aos>
                <div class="density-card-header">
                    <div class="density-card-left">
                        <div class="density-icon ${bgClass}"><i class="fas ${icon}"></i></div>
                        <h3>${d.zone || 'Campus Zone'}</h3>
                    </div>
                    <div class="density-pct" style="color: ${color}">${crowd}%</div>
                </div>
                <div class="density-peak">${d.peakDescription || 'Updates every 30s'}</div>
                <div class="density-bar"><div class="density-bar-fill" style="width: ${crowd}%; background: ${color};"></div></div>
                <div class="density-tip" style="color: ${color}">
                    <i class="fas ${crowd >= 75 ? 'fa-arrow-up' : 'fa-info-circle'}"></i> 
                    <span style="color: var(--text-secondary)">${d.tip || 'Monitor flow'}</span>
                </div>
            </div>`;
        }).join('');
    }

    function renderSpaces(items) {
        if (!spacesGrid || !Array.isArray(items)) return;
        spacesGrid.innerHTML = items.slice(0, 3).map((s, idx) => {
            const gradients = ['sky', 'mint', 'peach'];
            const noise = (s.noiseLevel || 'Low').toLowerCase();
            const noiseClass = noise === 'high' ? 'high' : noise === 'moderate' ? 'mid' : 'low';
            const noiseText = noise.charAt(0).toUpperCase() + noise.slice(1);

            return `
            <div class="space-card" data-aos>
                <div class="space-card-gradient ${gradients[idx % 3]}">
                    <div class="space-available-badge"><i class="fas fa-chair"></i> ${s.availableSeats || 0} Seats</div>
                    <div class="space-type-icon"><i class="fas fa-door-open"></i></div>
                </div>
                <div class="space-card-body">
                    <h3>${s.name || 'Study Area'}</h3>
                    <div class="space-meta">
                        <span><i class="fas fa-walking"></i> ${s.walkMin || 5} min</span>
                        <span><i class="fas fa-wifi"></i> ${s.wifi || 'Strong'}</span>
                    </div>
                    <div class="noise-indicator">
                        <span>Noise: ${noiseText}</span>
                        <div class="noise-bars">
                            <div class="noise-bar active ${noiseClass}"></div>
                            <div class="noise-bar ${noise !== 'low' ? 'active ' + noiseClass : ''}"></div>
                            <div class="noise-bar ${noise === 'high' ? 'active ' + noiseClass : ''}"></div>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    function updateSignals(signals) {
        if (!signals || signalCards.length < 3) return;
        const keys = ['timetable', 'classrooms', 'parking'];
        keys.forEach((k, idx) => {
            const data = signals[k];
            if (!data) return;
            const card = signalCards[idx];
            const p = card.querySelector('p');
            const badge = card.querySelector('.signal-badge');
            if (p) p.textContent = data.subtitle || p.textContent;
            if (badge) {
                badge.innerHTML = (data.badge === 'LIVE') ? '<span class="live-dot-sm"></span> LIVE' : data.badge;
            }
        });
    }

    function updateSectionNarratives(sections) {
        if (!sections) return;
        const map = {
            signals: [signalsSectionSub, signalsCallout],
            alerts: [alertsSectionSub, alertsCallout],
            density: [densitySectionSub, densityCallout],
            spaces: [spacesSectionSub, spacesCallout]
        };

        for (const [key, els] of Object.entries(map)) {
            const [sub, call] = els;
            if (sections[key]) {
                if (sub && sections[key].subtitle) sub.textContent = sections[key].subtitle;
                if (call && sections[key].callout) call.textContent = sections[key].callout;
            }
        }
    }

    function animateValue(obj, start, end, duration) {
        if (!obj) return;
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const val = (progress * (end - start)) + start;
            obj.innerHTML = val.toFixed(val % 1 === 0 ? 0 : 1);
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    }

    function updateStats(stats) {
        if (!stats) return;
        if (avgTimeStat) animateValue(avgTimeStat, 0, stats.minutesSaved || 8, 1500);
        if (accuracyStat) animateValue(accuracyStat, 0, stats.decisionAccuracy || 94, 1500);
        if (decisionsStat) animateValue(decisionsStat, 0, stats.decisionsK || 2.4, 1500);
    }

    // === MAIN REFRESH ===
    let firstLoad = true;
    async function refreshDashboard() {
        try {
            console.log('Refreshing dashboard data...');
            const res = await fetchWithFallback('/api/v1/campus/dashboard-live');
            const data = await res.json();

            updateNextMove(data.nextMove);
            updateAlert(data.alert);
            updateSignals(data.signals);
            renderTimeline(data.timeline);
            renderDensity(data.density);
            renderSpaces(data.spaces);
            updateSectionNarratives(data.sections);

            if (firstLoad) {
                updateStats(data.stats);
                firstLoad = false;
            }

            // Sync AOS for new elements
            const newAnimated = document.querySelectorAll('[data-aos]');
            newAnimated.forEach(el => observer.observe(el));

        } catch (err) {
            console.error('Dashboard refresh failed:', err);
        }
    }

    // === NOTIFICATION PANEL TOGGLE ===
    const notifBtn = document.getElementById('notifBtn');
    const notifPanel = document.getElementById('notifPanel');
    const notifClose = document.getElementById('notifClose');

    if (notifBtn) notifBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (notifPanel) notifPanel.classList.toggle('open');
    });

    if (notifClose) notifClose.addEventListener('click', () => {
        if (notifPanel) notifPanel.classList.remove('open');
    });

    // Close notif panel when clicking outside
    document.addEventListener('click', (e) => {
        if (notifPanel && notifPanel.classList.contains('open')) {
            if (!notifPanel.contains(e.target) && e.target !== notifBtn) {
                notifPanel.classList.remove('open');
            }
        }
    });

    // === CHAT MODAL LOGIC ===
    const navChatBtn = document.getElementById('navChatBtn');
    const floatingChat = document.getElementById('floatingChat');
    const chatModalOverlay = document.getElementById('chatModalOverlay');
    const chatModalClose = document.getElementById('chatModalClose');
    const modalChatInput = document.getElementById('modalChatInput');
    const chatForm = document.getElementById('chatForm');
    const chatMessages = document.getElementById('chatMessages');
    const apiKeyInput = document.getElementById('apiKey');
    const saveKeyBtn = document.getElementById('saveKeyBtn');
    const clearKeyBtn = document.getElementById('clearKeyBtn');
    const modelSelect = document.getElementById('modelSelect');
    const keyStatus = document.getElementById('keyStatus');
    const modalSendBtn = document.getElementById('modalSendBtn');

    function openChatModal(prefill) {
        if (chatModalOverlay) {
            chatModalOverlay.classList.add('open');
            if (prefill) {
                modalChatInput.value = prefill;
            }
            // Remove full app scrolling
            document.body.style.overflow = 'hidden';
            setTimeout(() => modalChatInput.focus(), 300);
        }
    }

    function closeChatModal() {
        if (chatModalOverlay) {
            chatModalOverlay.classList.remove('open');
            document.body.style.overflow = 'auto';
        }
    }

    if (navChatBtn) navChatBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openChatModal(chatInput ? chatInput.value : '');
    });

    if (floatingChat) floatingChat.addEventListener('click', (e) => {
        // Prevent if clicking on input itself? Actually input focus triggers it anyway
        openChatModal(chatInput ? chatInput.value : '');
    });

    // Also on input focus open modal
    if (chatInput) chatInput.addEventListener('focus', () => {
        chatInput.blur(); // Remove focus from floating
        openChatModal(chatInput.value);
    });

    if (chatSend) chatSend.addEventListener('click', (e) => {
        e.stopPropagation();
        openChatModal(chatInput ? chatInput.value : '');
    });

    if (chatModalClose) chatModalClose.addEventListener('click', closeChatModal);

    // Escape to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && chatModalOverlay && chatModalOverlay.classList.contains('open')) {
            closeChatModal();
        }
    });

    /* ─── Chat bubble renderer ─── */
    function bubble(text, who) {
        if (!chatMessages) return;
        const div = document.createElement('div');
        div.className = 'bubble ' + who;
        
        if (who === 'bot' && window.marked) {
            div.innerHTML = marked.parse(text);
        } else {
            div.textContent = text;
        }

        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    /* ─── Typing indicator ─── */
    let typingEl = null;
    function showTyping() {
        if (typingEl || !chatMessages) return;
        typingEl = document.createElement('div');
        typingEl.className = 'bubble bot typing-indicator';
        typingEl.innerHTML = '<span></span><span></span><span></span>';
        chatMessages.appendChild(typingEl);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    function hideTyping() {
        if (typingEl) { typingEl.remove(); typingEl = null; }
    }

    /* ─── Set UI state for key status ─── */
    function setKeyStatus(hasKey, provider) {
        if (!keyStatus || !apiKeyInput) return;
        if (hasKey) {
            keyStatus.innerHTML = `<i class="fas fa-check-circle"></i> Key saved (${provider || 'provider'}). Ready to chat.`;
            keyStatus.className = 'status status-ok';
            apiKeyInput.placeholder = '••••••••••••••••••• (key saved)';
        } else {
            keyStatus.innerHTML = '<i class="fas fa-info-circle"></i> No API key saved. Enter key below.';
            keyStatus.className = 'status status-error';
            apiKeyInput.placeholder = 'Paste OpenAI or Gemini key';
        }
    }

    /* ─── Load key status & models on page load ─── */
    async function refreshKeyAndModels() {
        if (!keyStatus) return;
        try {
            const hkResp = await fetchWithFallback('/api/v1/llm/has-key');
            const hk = await hkResp.json();

            if (!hk.hasKey) {
                setKeyStatus(false);
                if (modelSelect) {
                    modelSelect.disabled = true;
                    modelSelect.innerHTML = '<option>Save key first</option>';
                }
                return;
            }

            setKeyStatus(true, hk.provider);

            // Load models
            const modelResp = await fetchWithFallback('/api/v1/llm/models');
            const modelData = await modelResp.json();

            if (!modelResp.ok || !modelData.models || !modelData.models.length) {
                if (modelSelect) {
                    modelSelect.disabled = true;
                    modelSelect.innerHTML = '<option>Model fetch failed</option>';
                }
                const detail = modelData && (modelData.error || 'Unknown error');
                keyStatus.textContent = `❌ Key saved (${hk.provider}). Model list error: ${detail}`;
                return;
            }

            if (modelSelect) {
                modelSelect.innerHTML = '';
                modelData.models.forEach((m) => {
                    const opt = document.createElement('option');
                    opt.value = m.id;
                    opt.textContent = m.displayName || m.id;
                    modelSelect.appendChild(opt);
                });
                modelSelect.disabled = false;
            }
            setKeyStatus(true, modelData.provider || hk.provider);
        } catch (err) {
            if (keyStatus) {
                keyStatus.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Cannot reach LLM backend on port 5000.';
            }
        }
    }

    /* ─── Save key ─── */
    async function saveKey() {
        if (!apiKeyInput || !keyStatus) return;
        const raw = (apiKeyInput.value || '').trim();
        if (!raw) {
            keyStatus.innerHTML = '<i class="fas fa-exclamation-circle"></i> Please enter a key first.';
            keyStatus.className = 'status status-error';
            return;
        }

        if (saveKeyBtn) saveKeyBtn.disabled = true;
        keyStatus.textContent = 'Saving key...';

        try {
            const resp = await fetchWithFallback('/api/v1/llm/save-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: raw })
            });
            const data = await resp.json().catch(() => ({}));

            if (!resp.ok) {
                keyStatus.innerHTML = '<i class="fas fa-times-circle"></i> ' + (data.error || 'Failed to save key.');
                keyStatus.className = 'status status-error';
                return;
            }

            apiKeyInput.value = '';
            await refreshKeyAndModels();
        } catch (err) {
            keyStatus.innerHTML = '<i class="fas fa-times-circle"></i> Cannot reach backend.';
        } finally {
            if (saveKeyBtn) saveKeyBtn.disabled = false;
        }
    }

    /* ─── Clear key ─── */
    async function clearKey() {
        if (!keyStatus) return;
        try {
            const resp = await fetchWithFallback('/api/v1/llm/clear-key', { method: 'POST' });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                keyStatus.innerHTML = '<i class="fas fa-times-circle"></i> Clear failed: ' + (data.error || 'Unknown error');
                return;
            }
            if (modelSelect) {
                modelSelect.disabled = true;
                modelSelect.innerHTML = '<option>Save key first</option>';
            }
            setKeyStatus(false);
            if (apiKeyInput) {
                apiKeyInput.value = '';
                apiKeyInput.placeholder = 'Paste OpenAI or Gemini key';
            }
        } catch (err) {
            keyStatus.textContent = '❌ Cannot reach backend.';
        }
    }

    /* ─── Ask the campus assistant ─── */
    async function askAssistant(question) {
        const model = (modelSelect && !modelSelect.disabled) ? modelSelect.value : null;
        let userLat = 19.1334;
        let userLng = 72.9133;
        
        // Try getting actual position but don't block
        if ("geolocation" in navigator) {
            try {
                const pos = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 });
                });
                userLat = pos.coords.latitude;
                userLng = pos.coords.longitude;
            } catch(e) { }
        }

        const payload = {
            question,
            model: model || undefined,
            userLat: userLat,
            userLng: userLng,
            userFloor: 0
        };

        const resp = await fetchWithFallback('/api/v1/assistant/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const raw = await resp.text();
        let data = null;
        try { data = raw ? JSON.parse(raw) : null; } catch (_) { data = null; }

        if (!resp.ok) {
            if (data && data.error && String(data.error).includes('429')) {
                throw new Error('You are sending requests too quickly. Please slow down.');
            }
            const msg = (data && (data.error || data.message)) || `Server error (${resp.status})`;
            throw new Error(msg);
        }

        // Extract text from whichever field was returned
        if (data && data.assistant_text) return data.assistant_text;
        if (data && data.text)           return data.text;
        if (data && data.answer)         return data.answer;
        if (data && data.choices && data.choices[0]) return data.choices[0].message?.content || 'No response.';
        return 'No response received from the assistant.';
    }

    /* ─── Form submit ─── */
    async function onChatSubmit(e) {
        e.preventDefault();
        const q = (modalChatInput.value || '').trim();
        if (!q) return;

        bubble(q, 'user');
        modalChatInput.value = '';
        modalChatInput.disabled = true;
        if (modalSendBtn) modalSendBtn.disabled = true;
        showTyping();

        try {
            const answer = await askAssistant(q);
            hideTyping();
            bubble(answer, 'bot');
        } catch (err) {
            hideTyping();
            bubble('<span style="color:var(--red)"><i class="fas fa-exclamation-triangle"></i> ' + err.message + '</span>', 'bot');
        } finally {
            modalChatInput.disabled = false;
            if (modalSendBtn) modalSendBtn.disabled = false;
            modalChatInput.focus();
        }
    }

    /* ─── Wire events ─── */
    if (saveKeyBtn) saveKeyBtn.addEventListener('click', saveKey);
    if (clearKeyBtn) clearKeyBtn.addEventListener('click', clearKey);
    if (chatForm) chatForm.addEventListener('submit', onChatSubmit);

    /* ─── Init Chat ─── */
    bubble('👋 Welcome to CampusFlow Assistant! Ask me anything about classrooms, parking, routes, and campus schedules.', 'bot');
    refreshKeyAndModels();

    // === SCROLL REVEAL ===
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    document.querySelectorAll('[data-aos], .timeline-item, .density-card, .space-card, .stat-item, .signal-card, .step-item').forEach(el => observer.observe(el));

    // === CLOCK ===
    function updateClock() {
        const now = new Date();
        const currentTimeEl = document.getElementById('currentTime');
        const timePeriodEl = document.getElementById('timePeriod');
        const currentDateEl = document.getElementById('currentDate');

        if (currentTimeEl) {
            let hours = now.getHours();
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12 || 12;
            currentTimeEl.textContent = `${hours}:${minutes}`;
            if (timePeriodEl) timePeriodEl.textContent = ampm;
        }

        if (currentDateEl) {
            const options = { weekday: 'long', month: 'short', day: 'numeric' };
            currentDateEl.textContent = now.toLocaleDateString('en-US', options);
        }
    }

    // INITIALIZE
    updateClock();
    setInterval(updateClock, 1000);
    refreshDashboard();
    setInterval(refreshDashboard, 30000); // Sync with simulator
});

