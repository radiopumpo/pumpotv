/* ============================================================
   app.js — PumpoTV Main Orchestrator
   ============================================================ */

const App = {

  async init() {
    // Load channels + playlists from JSON
    const channels = await this._loadJSON('data/channels.json');
    await Promise.all(channels.map(async ch => {
      try {
        ch.playlist = await this._loadJSON('data/' + ch.playlist);
      } catch (e) {
        ch.playlist = [];
      }
    }));
    window.CHANNELS_DATA = channels;

    // Set default view to retro
    this.setView('retro', false);

    // Build UI
    this._buildChannelBar();
    Remote.render();
    EPG.init();
    this._renderForYouPanel();

    // Restore keys
    const gk = localStorage.getItem('ptv_gemini_key') || '';
    const ck = localStorage.getItem('ptv_claude_key') || '';
    const fyKey = document.getElementById('fyKeyInput');
    if (fyKey && (gk || ck)) fyKey.value = gk || ck;

    // Load first channel
    await this.switchChannel('main', false);
  },

  async _loadJSON(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error('Failed to load ' + path);
    return res.json();
  },

  // ── CHANNEL SWITCHING ────────────────────────────────────
  async switchChannel(channelId, animate = true) {
    const ch = window.CHANNELS_DATA?.find(c => c.id === channelId);
    if (!ch) return;

    // Show For You panel only when on that channel
    document.getElementById('forYouPanel').style.display =
      ch.ai ? '' : 'none';

    // If AI channel has no playlist yet, show panel and stop
    if (ch.ai && !ch.playlist?.length) {
      document.getElementById('forYouPanel').style.display = '';
      this._updateChannelBarActive(channelId);
      Remote.updateActiveChannel(channelId);
      return;
    }

    Player.load(ch, animate);
    this._updateChannelBarActive(channelId);
    Remote.updateActiveChannel(channelId);
    this.updateInfoBar(ch.playlist[Player.positionState.videoIndex], ch);
    EPG.renderCards();
  },

  _updateChannelBarActive(id) {
    document.querySelectorAll('.ch-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('chbtn-' + id)?.classList.add('active');
  },

  // ── VIEW TOGGLE ──────────────────────────────────────────
  setView(view, animate = true) {
    document.body.classList.remove('retro', 'stream');
    document.body.classList.add(view);
    document.querySelectorAll('.vt-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.v === view));
    if (animate) Player._triggerStatic();
  },

  // ── MUTE (postMessage — no iframe reload) ────────────────
  toggleMute() {
    Player.setMute(!Player.muted);
    const btn = document.getElementById('muteBtn');
    if (btn) {
      btn.textContent = Player.muted ? '🔇 Muted' : '🔊 Live';
      btn.classList.toggle('unmuted', !Player.muted);
    }
  },

  // ── INFO BAR ─────────────────────────────────────────────
  updateInfoBar(video, channel) {
    const el = id => document.getElementById(id);
    if (el('infoCh')) el('infoCh').textContent = channel.num + ' · ' + channel.name;
    if (el('infoTitle')) el('infoTitle').textContent = video?.title || '—';
    if (el('infoNext')) {
      const pos = Player.positionState;
      if (pos) {
        const nextIdx = (pos.videoIndex + 1) % channel.playlist.length;
        el('infoNext').textContent = 'Up next: ' + channel.playlist[nextIdx]?.title;
      }
    }
  },

  tickProgress(p) {
    const fill = document.getElementById('progressFill');
    const time = document.getElementById('infoTime');
    if (fill) fill.style.width = p.pct.toFixed(1) + '%';
    if (time) time.textContent =
      Player.formatTime(p.elapsed) + ' / ' + Player.formatTime(p.video.duration) +
      ' · ' + Player.formatTime(p.remaining) + ' remaining';
  },

  // ── CHANNEL BAR ──────────────────────────────────────────
  _buildChannelBar() {
    const bar = document.getElementById('channelBar');
    if (!bar || !window.CHANNELS_DATA) return;
    bar.innerHTML = window.CHANNELS_DATA.map(ch =>
      `<button class="ch-btn" id="chbtn-${ch.id}" onclick="App.switchChannel('${ch.id}')">
        <span class="ch-num" style="color:${ch.color}">${ch.num}</span>
        <span class="ch-icon">${ch.icon}</span>
        <span>${ch.name}</span>
      </button>`
    ).join('');
  },

  // ── FOR YOU PANEL ─────────────────────────────────────────
  _renderForYouPanel() {
    const panel = document.getElementById('forYouPanel');
    if (!panel) return;
    panel.style.display = 'none'; // hidden until Pumpo Picks channel selected
  },

  async generateForYou() {
    const prompt = document.getElementById('fyPrompt')?.value?.trim();
    if (!prompt) { this.toast('Tell me what you want to watch.'); return; }
    const playlist = await AIChannel.generate(prompt);
    if (playlist?.length) {
      await this.switchChannel('foryou', true);
    }
  },

  // ── TOAST ────────────────────────────────────────────────
  toast(msg) {
    const el = document.getElementById('toastEl');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2800);
  },
};

window.addEventListener('DOMContentLoaded', () => App.init());
