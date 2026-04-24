/* ============================================================
   epg.js — PumpoTV Electronic Program Guide
   ============================================================ */

const EPG = {
  open: false,
  activeTab: 'now',   // 'now' | 'next' | 'schedule'
  refreshTimer: null,

  init() {
    this.renderToggle();
    this.renderCards();
    this.refreshTimer = setInterval(() => this.renderCards(), 30000);
  },

  renderToggle() {
    const toggle = document.getElementById('epgToggle');
    if (!toggle) return;
    toggle.onclick = () => {
      this.open = !this.open;
      document.getElementById('epgBody').classList.toggle('open', this.open);
      document.getElementById('epgChevron').classList.toggle('open', this.open);
    };
  },

  setTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('.epg-tab').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === tab));
    this.renderCards();
  },

  renderCards() {
    const container = document.getElementById('epgCards');
    if (!container || !window.CHANNELS_DATA) return;

    if (this.activeTab === 'schedule') {
      this._renderSchedule(container);
      return;
    }

    const isNext = this.activeTab === 'next';
    container.innerHTML = window.CHANNELS_DATA.map(ch => {
      if (!ch.playlist?.length) return '';
      const pos = Player.getChannelPosition(ch);
      const idx = isNext
        ? (pos.videoIndex + 1) % ch.playlist.length
        : pos.videoIndex;
      const vid = ch.playlist[idx];
      const remaining = ch.playlist[pos.videoIndex].duration - pos.seekTo;
      const isActive = ch.id === Player.currentChannelId;
      const isNow = !isNext && isActive;

      return `<div class="epg-card ${isNow ? 'now-card' : ''}" onclick="App.switchChannel('${ch.id}')">
        <div class="epg-card-ch">${ch.num} ${ch.icon} ${ch.name}</div>
        <div class="epg-card-title">${escH(vid.title)}${isNow ? '<span class="now-pill">NOW</span>' : ''}</div>
        <div class="epg-card-time">${isNext ? 'up next' : 'ends in ' + Player.formatTime(remaining)}</div>
      </div>`;
    }).join('');
  },

  _renderSchedule(container) {
    const ch = window.CHANNELS_DATA?.find(c => c.id === Player.currentChannelId);
    if (!ch?.playlist?.length) { container.innerHTML = '<div style="color:var(--muted);font-family:var(--mono);font-size:9px;padding:.5rem;">No schedule data.</div>'; return; }

    const pos = Player.getChannelPosition(ch);
    const now = Date.now();
    const epochS = (now - EPOCH_MS) / 1000;
    const totalDur = ch.playlist.reduce((s, v) => s + v.duration, 0);
    const cycleStart = epochS - (epochS % totalDur);

    // Build schedule for current + next cycle entries up to 12 items
    let acc = cycleStart;
    const rows = [];
    const len = ch.playlist.length;
    let startIdx = pos.videoIndex;
    // go back a few to show context
    for (let back = 2; back > 0; back--) {
      startIdx = (startIdx - 1 + len) % len;
    }
    let offset = acc;
    for (let i = 0; i < len; i++) {
      const idx = (startIdx + i) % len;
      offset += ch.playlist[idx].duration;
    }
    // simpler: just list all from current
    acc = epochS - pos.seekTo;
    const items = [];
    for (let i = 0; i < Math.min(ch.playlist.length, 12); i++) {
      const idx = (pos.videoIndex + i) % ch.playlist.length;
      const vid = ch.playlist[idx];
      const startTime = now + (acc - epochS) * 1000;
      const isNowRow = i === 0;
      items.push({ vid, startTime, isNowRow });
      acc += vid.duration;
    }

    container.innerHTML = `<div class="schedule-list">${items.map(item => `
      <div class="schedule-row ${item.isNowRow ? 'now-row' : ''}">
        <div class="sched-time">${_wallTime(item.startTime)}</div>
        <div class="sched-title">${escH(item.vid.title)}${item.isNowRow ? '<span class="now-pill">NOW</span>' : ''}</div>
        <div class="sched-dur">${Player.formatTime(item.vid.duration)}</div>
      </div>`).join('')}
    </div>`;
  },
};

function _wallTime(ms) {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escH(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
