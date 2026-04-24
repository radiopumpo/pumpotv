/* ============================================================
   player.js — PumpoTV Time-Sync Player
   ============================================================ */

// Epoch: Monday 2025-01-06 00:00:00 UTC
const EPOCH_MS = new Date('2025-01-06T00:00:00Z').getTime();

const Player = {
  currentChannelId: null,
  positionState: null,
  muted: true,
  progressTimer: null,

  // ── CORE TIME-SYNC ──────────────────────────────────────
  getChannelPosition(channel) {
    const total = channel.playlist.reduce((s, v) => s + v.duration, 0);
    if (!total) return { videoIndex: 0, seekTo: 0 };
    const elapsed = (Date.now() - EPOCH_MS) / 1000;
    const pos = elapsed % total;
    let acc = 0;
    for (let i = 0; i < channel.playlist.length; i++) {
      if (pos < acc + channel.playlist[i].duration) {
        return { videoIndex: i, seekTo: Math.floor(pos - acc) };
      }
      acc += channel.playlist[i].duration;
    }
    return { videoIndex: 0, seekTo: 0 };
  },

  buildSrc(videoId, seekTo) {
    const p = new URLSearchParams({
      autoplay:        '1',
      mute:            '1',      // always start muted — mobile autoplay requires it
      start:           Math.max(0, Math.floor(seekTo)),
      controls:        '0',      // we own the controls
      rel:             '0',
      modestbranding:  '1',
      iv_load_policy:  '3',
      playsinline:     '1',      // critical for iOS inline playback (no fullscreen hijack)
      enablejsapi:     '1',
      fs:              '0',      // disable YouTube's own fullscreen button
      disablekb:       '1',      // disable keyboard shortcuts inside iframe
      origin:          (typeof location !== 'undefined' ? location.origin : 'https://radiopumpo.github.io'),
    });
    return `https://www.youtube.com/embed/${videoId}?${p}`;
  },

  // ── LOAD CHANNEL ────────────────────────────────────────
  load(channel, animate = true) {
    if (animate) this._triggerStatic();
    this.currentChannelId = channel.id;
    const pos = this.getChannelPosition(channel);
    this.positionState = {
      channel,
      videoIndex: pos.videoIndex,
      initialSeek: pos.seekTo,
      startedAt: Date.now(),
    };
    const vid = channel.playlist[pos.videoIndex];
    const src = this.buildSrc(vid.id, pos.seekTo);
    this._setIframes(src);
    this._startProgressTimer();
    return pos;
  },

  // ── ADVANCE TO NEXT VIDEO ───────────────────────────────
  advance() {
    const { channel, videoIndex } = this.positionState;
    const nextIndex = (videoIndex + 1) % channel.playlist.length;
    this.positionState.videoIndex = nextIndex;
    this.positionState.initialSeek = 0;
    this.positionState.startedAt = Date.now();
    const vid = channel.playlist[nextIndex];
    const src = this.buildSrc(vid.id, 0);
    this._setIframes(src);
    return { videoIndex: nextIndex, video: vid };
  },

  // ── MUTE via postMessage (no iframe reload) ─────────────
  volume: 0,  // 0 = muted (autoplay requirement), range 0-100

  _postToActive(msg) {
    const activeId = document.body.classList.contains('retro') ? 'ytRetro' : 'ytStream';
    const iframe = document.getElementById(activeId);
    if (iframe) iframe.contentWindow?.postMessage(JSON.stringify(msg), '*');
  },

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(100, vol));
    this.muted = this.volume === 0;
    if (this.muted) {
      this._postToActive({ event: 'command', func: 'mute', args: '' });
    } else {
      this._postToActive({ event: 'command', func: 'unMute', args: '' });
      this._postToActive({ event: 'command', func: 'setVolume', args: [this.volume] });
    }
    VolumeDisplay.show(this.volume);
    // Sync mute button label
    const btn = document.getElementById('muteBtn');
    if (btn) {
      btn.textContent = this.muted ? '🔇 Muted' : '🔊 Live';
      btn.classList.toggle('unmuted', !this.muted);
    }
  },

  setMute(muted) {
    this.setVolume(muted ? 0 : 75);
  },

  volUp()   { this.setVolume(this.volume === 0 ? 50 : Math.min(100, this.volume + 25)); },
  volDown() { this.setVolume(Math.max(0,  this.volume - 25)); },

  // ── PROGRESS ────────────────────────────────────────────
  getProgress() {
    if (!this.positionState) return null;
    const { initialSeek, startedAt, videoIndex, channel } = this.positionState;
    const video = channel.playlist[videoIndex];
    const elapsed = initialSeek + (Date.now() - startedAt) / 1000;
    const remaining = video.duration - elapsed;
    const pct = Math.min(100, (elapsed / video.duration) * 100);
    return { elapsed, remaining, pct, video, videoIndex, channel };
  },

  _startProgressTimer() {
    clearInterval(this.progressTimer);
    this.progressTimer = setInterval(() => {
      const p = this.getProgress();
      if (!p) return;
      if (p.remaining <= 0) {
        const next = this.advance();
        EPG.renderCards();
        App.updateInfoBar(next.video, this.positionState.channel);
      } else {
        App.tickProgress(p);
      }
    }, 1000);
  },

  _setIframes(src) {
    ['ytStream', 'ytRetro'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.src = src;
    });
    // Re-apply volume state after iframe loads (~1.5s grace for mobile buffering)
    clearTimeout(this._volTimer);
    this._volTimer = setTimeout(() => {
      if (this.volume > 0) {
        this._postToActive({ event: 'command', func: 'unMute', args: '' });
        this._postToActive({ event: 'command', func: 'setVolume', args: [this.volume] });
      }
    }, 1500);
  },

  _triggerStatic() {
    const screen = document.getElementById('tvScreen');
    if (screen) {
      screen.classList.add('switching');
      setTimeout(() => screen.classList.remove('switching'), 500);
    }
  },

  formatTime(s) {
    s = Math.max(0, Math.floor(s));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  },

  getCurrentAd() {
    const adCh = window.CHANNELS_DATA?.find(c => c.id === 'ads');
    if (!adCh || !adCh.playlist?.length) return null;
    const pos = this.getChannelPosition(adCh);
    return { ...adCh.playlist[pos.videoIndex], seekTo: pos.seekTo };
  },
};

/* ── VOLUME DISPLAY ── */
const VolumeDisplay = {
  timer: null,
  show(vol) {
    let el = document.getElementById('volMeter');
    if (!el) {
      el = document.createElement('div');
      el.id = 'volMeter';
      el.style.cssText = `
        position:absolute;bottom:12px;left:50%;transform:translateX(-50%);
        z-index:20;background:rgba(0,0,0,0.75);border:1px solid rgba(212,168,67,0.4);
        border-radius:6px;padding:6px 10px;display:flex;flex-direction:column;
        align-items:center;gap:4px;pointer-events:none;transition:opacity .4s;`;
      const label = document.createElement('div');
      label.id = 'volLabel';
      label.style.cssText = 'font-family:"Space Mono",monospace;font-size:8px;color:#d4a843;letter-spacing:.1em;';
      const bars = document.createElement('div');
      bars.id = 'volBars';
      bars.style.cssText = 'display:flex;gap:2px;align-items:flex-end;height:20px;';
      el.appendChild(label);
      el.appendChild(bars);
      const screen = document.getElementById('tvScreen') || document.querySelector('.stream-layout');
      screen?.appendChild(el);
    }
    // Draw bars
    const steps = 8;
    const filled = Math.round((vol / 100) * steps);
    const bars = document.getElementById('volBars');
    const label = document.getElementById('volLabel');
    if (bars) {
      bars.innerHTML = Array.from({length: steps}, (_, i) => {
        const h = 6 + i * 2;
        const active = i < filled;
        const col = active ? (i >= 6 ? '#e05050' : i >= 4 ? '#ffaa00' : '#40b870') : '#2a2010';
        return `<div style="width:6px;height:${h}px;background:${col};border-radius:1px;"></div>`;
      }).join('');
    }
    if (label) label.textContent = vol === 0 ? '🔇 MUTE' : `VOL ${vol}`;
    el.style.opacity = '1';
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { if (el) el.style.opacity = '0'; }, 1800);
  },
};

/* ── FULLSCREEN ── */
const FullScreen = {
  toggle() {
    const target = document.body.classList.contains('retro')
      ? document.querySelector('.tv-cabinet')
      : document.querySelector('.stream-layout');
    if (!target) return;
    if (!document.fullscreenElement) {
      target.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  },
};

// Keyboard shortcut: F = fullscreen, M = mute toggle, up/down arrows = volume
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'f' || e.key === 'F') FullScreen.toggle();
  if (e.key === 'm' || e.key === 'M') Player.setMute(!Player.muted);
  if (e.key === 'ArrowUp')   { e.preventDefault(); Player.volUp(); }
  if (e.key === 'ArrowDown') { e.preventDefault(); Player.volDown(); }
});
