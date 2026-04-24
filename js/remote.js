/* ============================================================
   remote.js — PumpoTV Virtual Retro Remote
   ============================================================ */

const Remote = {
  render() {
    const el = document.getElementById('remoteEl');
    if (!el || !window.CHANNELS_DATA) return;

    el.innerHTML = `
      <div class="remote-brand">PUMPO</div>
      <div class="remote-led"></div>
      <div class="remote-label">Channels</div>
      <div class="remote-channels" id="remoteChannels">
        ${window.CHANNELS_DATA.map(ch => `
          <button class="rmt-btn ${ch.id === Player.currentChannelId ? 'active-ch' : ''}"
                  id="rmt-${ch.id}"
                  onclick="App.switchChannel('${ch.id}')">
            <span class="rmt-num">${ch.num}</span>
            <span style="font-size:10px;">${ch.icon}</span>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:6px;flex:1;">${ch.name.replace("Pumpo's ","")}</span>
          </button>`).join('')}
      </div>
      <div class="rmt-divider"></div>
      <div class="remote-label">Volume</div>
      <div class="rmt-vol">
        <button class="rmt-vol-btn" onclick="Remote.volDown()" title="Vol -">−</button>
        <button class="rmt-vol-btn" onclick="App.toggleMute()" title="Mute">🔇</button>
        <button class="rmt-vol-btn" onclick="Remote.volUp()" title="Vol +">+</button>
      </div>
      <div class="rmt-divider"></div>
      <button class="rmt-power" onclick="Remote.power()" title="Power / Static">⏻</button>`;
  },

  updateActiveChannel(channelId) {
    document.querySelectorAll('.rmt-btn').forEach(b => b.classList.remove('active-ch'));
    document.getElementById('rmt-' + channelId)?.classList.add('active-ch');
  },

  power() {
    // Trigger static animation without switching channel
    const screen = document.getElementById('tvScreen');
    if (screen) {
      screen.classList.add('switching');
      setTimeout(() => screen.classList.remove('switching'), 500);
    }
  },

  volUp() {
    // Unmute if muted, otherwise just indicate (no JS volume control in iframes)
    if (Player.muted) App.toggleMute();
  },

  volDown() {
    if (!Player.muted) App.toggleMute();
  },
};
