/* ============================================================
   ai-channel.js — Pumpo Picks AI Channel
   ============================================================ */

const AIChannel = {
  model: 'gemini',

  SYSTEM: `Return ONLY a valid JSON array of 15 YouTube video objects. No explanation. No markdown. No text. Just the array starting with [ and ending with ].

Each object must be exactly: {"id":"YOUTUBE_ID","title":"Title","duration":123}

RULES:
1. Only suggest videos from channels known to allow embedding: TED Talks, Vevo, official artist channels, cooking YouTubers (Joshua Weissman, Bon Appétit, Babish, Gordon Ramsay's official channel), documentary channels that own their content, lo-fi/ambient music streams, educational channels, comedy sketches from official channels.
2. NEVER suggest: recent sports events, major label music videos from VEVO (they often block embed), news clips, movies, TV show episodes, or any content likely behind DRM.
3. Return ONLY a valid JSON array. No markdown, no explanation, no code fences.
4. Each item must have exactly: {"id":"YOUTUBE_VIDEO_ID","title":"Title","duration":seconds}
5. duration is an integer (seconds). Estimate if unsure — better to underestimate.
6. Use real, currently active YouTube video IDs. Do not invent IDs.

Return format example:
[{"id":"Rd9D2cD7-Ms","title":"TED: Do Schools Kill Creativity","duration":1162}]`,

  setModel(m) {
    this.model = m;
    document.querySelectorAll('.fy-model-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.m === m));
  },

  getKey() {
    const k = this.model === 'gemini'
      ? localStorage.getItem('ptv_gemini_key')
      : localStorage.getItem('ptv_claude_key');
    return k || '';
  },

  saveKey(m) {
    const val = document.getElementById('fyKeyInput').value.trim();
    if (!val) return;
    localStorage.setItem(`ptv_${m}_key`, val);
    App.toast(`${m} key saved`);
  },

  async generate(prompt) {
    const key = this.getKey();
    if (!key) { App.toast('Add your API key in Pumpo Picks'); return null; }

    this._setStatus('Curating your playlist...');
    document.getElementById('fyBtn').disabled = true;

    try {
      const reply = this.model === 'gemini'
        ? await this._callGemini(key, prompt)
        : await this._callClaude(key, prompt);
      console.log('[PumpoPicksRAW]', reply.slice(0, 500));

      // Strip markdown fences
      let clean = reply.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
      // Extract first JSON array even if model added surrounding text
      const arrStart = clean.indexOf('[');
      const arrEnd = clean.lastIndexOf(']');
      if (arrStart === -1) throw new Error('No JSON array found in response');
      // If truncated (no closing bracket), close the array cleanly
      if (arrEnd === -1 || arrEnd < arrStart) {
        // Find last complete object (last closing brace before truncation)
        const lastObj = clean.lastIndexOf('}', clean.length);
        clean = lastObj > arrStart ? clean.slice(arrStart, lastObj + 1) + ']' : null;
        if (!clean) throw new Error('Response too truncated to recover');
      } else {
        clean = clean.slice(arrStart, arrEnd + 1);
      }
      // Sanitise control characters that break JSON.parse
      clean = clean.replace(/[\x00-\x1F\x7F]/g, ' ');
      let playlist;
      try {
        playlist = JSON.parse(clean);
      } catch(parseErr) {
        // Last resort: extract individual objects with regex
        const objs = [];
        const rx = /\{[^{}]*"id"\s*:\s*"([^"]+)"[^{}]*"title"\s*:\s*"([^"]+)"[^{}]*"duration"\s*:\s*(\d+)[^{}]*\}/g;
        let m;
        while ((m = rx.exec(clean)) !== null) {
          objs.push({ id: m[1], title: m[2], duration: parseInt(m[3]) });
        }
        if (!objs.length) throw new Error('Could not parse AI response: ' + parseErr.message);
        playlist = objs;
      }

      // Validate — filter to items that at minimum have an id
      const valid = Array.isArray(playlist)
        ? playlist.filter(v => v && typeof v.id === 'string' && v.id.length > 5)
        : [];
      if (!valid.length) {
        console.error('[PumpoPicksParsed]', playlist);
        throw new Error('AI returned no valid video IDs. Try a different prompt.');
      }
      // Fill missing fields with defaults
      const finalPlaylist = valid.map(v => ({
        id: v.id.trim(),
        title: (v.title || v.name || 'Untitled').toString().trim(),
        duration: parseInt(v.duration) || 300,
      }));

      // Store and return
      window.CHANNELS_DATA.find(c => c.id === 'foryou').playlist = finalPlaylist;
      this._setStatus(`✓ ${finalPlaylist.length} videos curated for you`);
      App.toast('Pumpo Picks ready — switching to your channel');
      return playlist;

    } catch (e) {
      this._setStatus('Error: ' + e.message);
      App.toast('AI error: ' + e.message);
      return null;
    } finally {
      document.getElementById('fyBtn').disabled = false;
    }
  },

  async _callGemini(key, prompt) {
    // Embed instructions directly in user message — most reliable for JSON forcing
    const fullPrompt = this.SYSTEM + '\n\nUser request: ' + prompt + '\n\nReturn the JSON array now:';
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 4000,
            response_mime_type: 'application/json',
          }
        })
      }
    );
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `HTTP ${res.status}`); }
    const data = await res.json();
    console.log('[PumpoPicksGeminiRaw]', JSON.stringify(data).slice(0, 400));
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  },

  async _callClaude(key, prompt) {
    const fullPrompt = this.SYSTEM + '\n\nUser request: ' + prompt + '\n\nReturn the JSON array now, starting with [:';
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [
          { role: 'user', content: fullPrompt },
          { role: 'assistant', content: '[' }
        ]
      })
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `HTTP ${res.status}`); }
    const data = await res.json();
    // Claude was prefilled with '[', so prepend it back
    return '[' + (data.content?.[0]?.text || '');
  },

  _setStatus(msg) {
    const el = document.getElementById('fyStatus');
    if (el) el.textContent = msg;
  },

  renderPanel() {
    const panel = document.getElementById('forYouPanel');
    if (!panel) return;
    const ch = window.CHANNELS_DATA?.find(c => c.id === 'foryou');
    if (!ch?.ai) { panel.style.display = 'none'; return; }
    panel.style.display = '';
  },
};
