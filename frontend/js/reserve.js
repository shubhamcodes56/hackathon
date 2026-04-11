(() => {
  const dateStrip = document.getElementById('dateStrip');
  const slotList = document.getElementById('slotList');
  const searchInput = document.getElementById('searchInput');
  const bookBtn = document.getElementById('bookBtn');
  const dataHint = document.getElementById('dataHint');

  let selectedDate = '2023-10-24';
  let selectedSlotId = null;
  let slots = [];

  function apiBases() {
    const bases = [''];
    bases.push('http://127.0.0.1:30000', 'http://localhost:30000', 'http://127.0.0.1:5000', 'http://localhost:5000');
    return [...new Set(bases)];
  }

  async function fetchWithFallback(path, options) {
    let lastErr = null;
    for (const b of apiBases()) {
      try {
        return await fetch(b + path, options);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('Backend unreachable');
  }

  function makeDateChips() {
    const chips = [];
    for (let d = 21; d <= 30; d += 1) {
      chips.push({
        id: `2023-10-${String(d).padStart(2, '0')}`,
        dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(`2023-10-${String(d).padStart(2, '0')}`).getDay()],
        label: String(d)
      });
    }

    dateStrip.innerHTML = chips.map((c) => `
      <button class="dateChip ${c.id === selectedDate ? 'active' : ''}" data-date="${c.id}">
        <div class="d1">${c.dow}</div>
        <div class="d2">${c.label}</div>
      </button>
    `).join('');

    dateStrip.querySelectorAll('.dateChip').forEach((el) => {
      el.addEventListener('click', () => {
        selectedDate = el.dataset.date;
        selectedSlotId = null;
        makeDateChips();
        loadSlots();
      });
    });
  }

  function filteredSlots() {
    const q = (searchInput.value || '').trim().toLowerCase();
    if (!q) return slots;
    return slots.filter((s) =>
      (s.roomName || '').toLowerCase().includes(q) ||
      (s.courseCode || '').toLowerCase().includes(q) ||
      (s.courseName || '').toLowerCase().includes(q) ||
      (s.label || '').toLowerCase().includes(q)
    );
  }

  function renderSlots() {
    const list = filteredSlots();
    if (!list.length) {
      slotList.innerHTML = '<div class="slot"><div><div class="time">No slots found</div><div class="meta">Try another date/filter</div></div></div>';
      return;
    }

    slotList.innerHTML = list.map((s) => `
      <button class="slot ${selectedSlotId === s.id ? 'selected' : ''} ${s.status === 'booked' ? 'booked' : ''}" data-id="${s.id}">
        <div>
          <div class="time">${s.time}</div>
          <div class="meta">${s.courseCode} · ${s.courseName} · ${s.roomName}</div>
          <div class="tag">${s.label} · ${s.occupancyPct}% occupied · ${s.status.toUpperCase()}</div>
        </div>
        <div class="action">${selectedSlotId === s.id ? '✓' : '+'}</div>
      </button>
    `).join('');

    slotList.querySelectorAll('.slot').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        const slot = slots.find((x) => x.id === id);
        if (!slot || slot.status === 'booked') return;
        selectedSlotId = selectedSlotId === id ? null : id;
        renderSlots();
      });
    });
  }

  async function loadSlots() {
    dataHint.textContent = 'Loading suggested empty classes...';
    const res = await fetchWithFallback(`/api/v1/campus/slots?date=${encodeURIComponent(selectedDate)}`);
    const json = await res.json();
    if (!res.ok || !json.success) {
      dataHint.textContent = 'Unable to load slots from backend.';
      slots = [];
      renderSlots();
      return;
    }

    slots = json.slots || [];
    selectedSlotId = json.recommendedSlotId || null;
    dataHint.textContent = `${json.day} • ${slots.length} slots from timetable • best empty class pre-selected`;
    renderSlots();
  }

  async function bookSelected() {
    if (!selectedSlotId) {
      alert('Please select a slot first.');
      return;
    }

    const res = await fetchWithFallback('/api/v1/campus/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotId: selectedSlotId, date: selectedDate })
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json.success) {
      alert(json.message || 'Booking failed.');
      return;
    }

    alert('Booking confirmed: ' + selectedSlotId);
    await loadSlots();
  }

  searchInput.addEventListener('input', renderSlots);
  bookBtn.addEventListener('click', bookSelected);

  makeDateChips();
  loadSlots();
})();
