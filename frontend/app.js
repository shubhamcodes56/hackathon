document.addEventListener('DOMContentLoaded', () => {
	const chatInput = document.getElementById('chatInput');
	const chatSend = document.getElementById('chatSend');

	const nmcLocation = document.getElementById('nmcLocation');
	const nmcSub = document.getElementById('nmcSub');
	const metricStartsIn = document.getElementById('metricStartsIn');
	const metricWalk = document.getElementById('metricWalk');
	const metricParking = document.getElementById('metricParking');
	const metricRoom = document.getElementById('metricRoom');
	const confFill = document.getElementById('confFill');
	const confValue = document.getElementById('confValue');
	const nmcTip = document.getElementById('nmcTip');

	const alertTitle = document.getElementById('alertTitle');
	const alertTime = document.getElementById('alertTime');
	const alertDesc = document.getElementById('alertDesc');
	const congFill = document.getElementById('congFill');
	const congValue = document.getElementById('congValue');
	const affectedAreas = document.getElementById('affectedAreas');
	const timelineEl = document.getElementById('timeline');
	const densityGrid = document.getElementById('densityGrid');
	const spacesGrid = document.getElementById('spacesGrid');
	const signalCards = Array.from(document.querySelectorAll('.signal-card'));
	const statNumbers = Array.from(document.querySelectorAll('.stat-number'));

	const signalsSectionSub = document.getElementById('signalsSectionSub');
	const signalsCalloutText = document.getElementById('signalsCalloutText');
	const alertsSectionSub = document.getElementById('alertsSectionSub');
	const alertsCalloutText = document.getElementById('alertsCalloutText');
	const densitySectionSub = document.getElementById('densitySectionSub');
	const densityCalloutText = document.getElementById('densityCalloutText');
	const spacesSectionSub = document.getElementById('spacesSectionSub');
	const spacesCalloutText = document.getElementById('spacesCalloutText');

	function apiBases() {
		const bases = [];
		if (window.location.port === '5000' || window.location.port === '30000') bases.push('');
		bases.push('http://127.0.0.1:30000');
		bases.push('http://localhost:30000');
		bases.push('http://127.0.0.1:5000');
		bases.push('http://localhost:5000');
		if (window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
			bases.push(`http://${window.location.hostname}:30000`);
			bases.push(`http://${window.location.hostname}:5000`);
		}
		return [...new Set(bases)];
	}

	async function fetchWithFallback(path, options) {
		let lastErr = null;
		for (const base of apiBases()) {
			try {
				return await fetch(base + path, options);
			} catch (err) {
				lastErr = err;
			}
		}
		throw lastErr || new Error('Backend unreachable');
	}

	function setNextMoveCard(nextMove) {
		if (!nextMove) return;
		if (nmcLocation) nmcLocation.textContent = nextMove.location || 'Campus';
		if (nmcSub) nmcSub.textContent = nextMove.roomLabel || 'Live campus recommendation';
		if (metricStartsIn) metricStartsIn.textContent = nextMove.startsIn || '--';
		if (metricWalk) metricWalk.textContent = nextMove.walkTime || '--';
		if (metricParking) metricParking.textContent = nextMove.parking || 'Parking data unavailable';
		if (metricRoom) metricRoom.textContent = nextMove.roomOccupancy || 'Occupancy unavailable';
		const confidence = Number(nextMove.confidence || 0);
		if (confFill) confFill.style.width = `${Math.max(0, Math.min(100, confidence))}%`;
		if (confValue) confValue.textContent = `${Math.max(0, Math.min(100, confidence))}%`;
		if (nmcTip) nmcTip.textContent = nextMove.tip || 'Live signals updated.';
	}

	async function refreshNextMove() {
		try {
			const resp = await fetchWithFallback('/api/v1/campus/next-move');
			if (!resp.ok) return;
			const data = await resp.json();
			setNextMoveCard(data.nextMove);
		} catch (_err) {
			// keep existing static UI if API is temporarily unavailable
		}
	}

	function setUpcomingAlert(alert) {
		if (!alert) return;
		if (alertTitle) alertTitle.textContent = alert.title || 'Campus Activity Alert';
		if (alertTime) alertTime.textContent = alert.timeWindow || '--';
		if (alertDesc) alertDesc.textContent = alert.description || 'Live campus data unavailable at the moment.';

		const congestion = Number(alert.congestion || 0);
		if (congFill) congFill.style.width = `${Math.max(0, Math.min(100, congestion))}%`;
		if (congValue) congValue.textContent = `${Math.max(0, Math.min(100, congestion))}%`;

		if (affectedAreas) {
			const tagsWrap = affectedAreas.querySelector('.area-tags');
			if (tagsWrap && Array.isArray(alert.affectedAreas) && alert.affectedAreas.length) {
				tagsWrap.innerHTML = alert.affectedAreas
					.map((a) => `<span class="area-tag">${String(a).toUpperCase()}</span>`)
					.join('');
			}
		}
	}

	function setSignals(signals) {
		if (!signals || signalCards.length < 3) return;
		const values = [signals.timetable, signals.classrooms, signals.parking];
		values.forEach((v, idx) => {
			if (!v) return;
			const card = signalCards[idx];
			const p = card.querySelector('p');
			const badge = card.querySelector('.signal-badge');
			if (p) p.textContent = v.subtitle || p.textContent;
			if (badge) badge.textContent = v.badge || badge.textContent;
		});
	}

	function renderTimeline(items) {
		if (!timelineEl || !Array.isArray(items)) return;
		const iconForType = (type) => {
			if (type === 'lab') return 'fa-microscope';
			if (type === 'free') return 'fa-mug-hot';
			return 'fa-book';
		};
		timelineEl.innerHTML = items.slice(0, 3).map((item, idx) => `
			<div class="timeline-item">
				<div class="timeline-marker ${item.type || 'class'}"><i class="fas ${iconForType(item.type)}"></i></div>
				<div class="timeline-card ${idx === 0 ? 'active' : ''}">
					<div class="timeline-time">${item.time || '--:--'}</div>
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
			const icon = crowd >= 75 ? 'fa-exclamation-triangle' : crowd >= 45 ? 'fa-users' : 'fa-leaf';
			return `
			<div class="density-card">
				<div class="density-card-header">
					<div class="density-card-left">
						<div class="density-icon" style="background:${crowd >= 75 ? 'var(--red-light)' : crowd >=45 ? 'var(--orange-light)' : 'var(--green-light)'}"><i class="fas ${icon}"></i></div>
						<h3>${d.zone || 'Campus Zone'}</h3>
					</div>
					<div class="density-pct" style="color:${color}">${crowd}%</div>
				</div>
				<div class="density-peak">${d.peakDescription || 'Live flow update'}</div>
				<div class="density-bar"><div class="density-bar-fill" style="width:${Math.max(0, Math.min(100, crowd))}%; background:${color};"></div></div>
				<div class="density-tip"><i class="fas fa-info-circle"></i> <span>${d.tip || 'Monitor movement'}</span></div>
			</div>`;
		}).join('');
	}

	function renderSpaces(items) {
		if (!spacesGrid || !Array.isArray(items)) return;
		spacesGrid.innerHTML = items.slice(0, 6).map((s) => {
			const noise = (s.noiseLevel || 'Moderate').toLowerCase();
			const walk = s.walkMin || 5;
			const seats = s.availableSeats || 0;
			const avail = Number(s.availabilityPct || 0);
			return `
			<div class="space-card">
				<div class="space-card-gradient mint">
					<div class="space-available-badge"><i class="fas fa-chair"></i> ${seats} Seats</div>
					<div class="space-type-icon"><i class="fas fa-book-open"></i></div>
				</div>
				<div class="space-card-body">
					<h3>${s.name || 'Study Space'}</h3>
					<div class="space-meta">
						<span><i class="fas fa-walking"></i> ${walk} min</span>
						<span><i class="fas fa-map-marker-alt"></i> ${s.location || 'Campus'}</span>
					</div>
					<div class="noise-indicator">
						<span>Noise: ${noise === 'low' ? 'Low' : noise === 'high' ? 'High' : 'Moderate'} • ${avail}% free</span>
					</div>
				</div>
			</div>`;
		}).join('');
	}

	function setStats(stats) {
		if (!stats || statNumbers.length < 3) return;
		statNumbers[0].textContent = String(stats.minutesSaved ?? statNumbers[0].textContent);
		statNumbers[1].textContent = String(stats.decisionAccuracy ?? statNumbers[1].textContent);
		statNumbers[2].textContent = String(stats.decisionsK ?? statNumbers[2].textContent);
	}

	function updateSectionCopy(subtitleEl, calloutEl, payload) {
		if (!payload) return;
		if (subtitleEl && payload.subtitle) subtitleEl.textContent = payload.subtitle;
		if (calloutEl && payload.callout) calloutEl.textContent = payload.callout;
	}

	function setSectionNarratives(sections) {
		if (!sections) return;
		updateSectionCopy(signalsSectionSub, signalsCalloutText, sections.signals);
		updateSectionCopy(alertsSectionSub, alertsCalloutText, sections.alerts);
		updateSectionCopy(densitySectionSub, densityCalloutText, sections.density);
		updateSectionCopy(spacesSectionSub, spacesCalloutText, sections.spaces);
	}

	async function refreshDashboardLive() {
		try {
			const resp = await fetchWithFallback('/api/v1/campus/dashboard-live');
			if (!resp.ok) return;
			const data = await resp.json();
			setNextMoveCard(data.nextMove);
			setUpcomingAlert(data.alert);
			setSignals(data.signals);
			renderTimeline(data.timeline);
			renderDensity(data.density);
			renderSpaces(data.spaces);
			setStats(data.stats);
			setSectionNarratives(data.sections);
		} catch (_err) {
			// keep existing static UI if API is temporarily unavailable
		}
	}

	async function refreshUpcomingAlert() {
		try {
			const resp = await fetchWithFallback('/api/v1/campus/upcoming-alert');
			if (!resp.ok) return;
			const data = await resp.json();
			setUpcomingAlert(data.alert);
		} catch (_err) {
			// keep existing static UI if API is temporarily unavailable
		}
	}

	function openChatPage() {
		const q = (chatInput && chatInput.value ? chatInput.value.trim() : '');
		const target = q ? `chat.html?q=${encodeURIComponent(q)}` : 'chat.html';
		window.location.href = target;
	}

	if (chatSend) {
		chatSend.addEventListener('click', openChatPage);
	}

	if (chatInput) {
		chatInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') openChatPage();
		});
		chatInput.addEventListener('focus', () => {
			window.location.href = 'chat.html';
		});
	}

	// Live refresh for the "Your Next Move" card from backend simulator data.
	refreshDashboardLive();
	setInterval(refreshDashboardLive, 30000);

	// Implement simple AOS (Animate on Scroll) logic to show elements
	const observerOptions = {
		threshold: 0.1,
		rootMargin: "0px 0px -50px 0px"
	};

	const observer = new IntersectionObserver((entries) => {
		entries.forEach(entry => {
			if (entry.isIntersecting) {
				entry.target.classList.add('visible');
				observer.unobserve(entry.target);
			}
		});
	}, observerOptions);

	// Select all elements that need to animate in
	const animatedElements = document.querySelectorAll('[data-aos], .timeline-item, .density-card, .space-card, .stat-item, .signal-card, .step-item, .feature-card');
	animatedElements.forEach(el => observer.observe(el));
});
