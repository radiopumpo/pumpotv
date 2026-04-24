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
      autoplay: '1',
      mute: this.muted ? '1' : '0',
      start: Math.max(0, Math.floor(seekTo)),
      controls: '1',
      rel: '0',
      modestbranding: '1',
      iv_load_policy: '3',
      enablejsapi: '1',       // required for postMessage mute
      origin: location.origin || 'https://radiopumpo.github.io',
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
  setMute(muted) {
    this.muted = muted;
    const func = muted ? 'mute' : 'unMute';
    const msg = JSON.stringify({ event: 'command', func, args: '' });
    // Only send to the active iframe to prevent double audio
    const activeId = document.body.classList.contains('retro') ? 'ytRetro' : 'ytStream';
    const iframe = document.getElementById(activeId);
    if (iframe) iframe.contentWindow?.postMessage(msg, '*');
  },

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
