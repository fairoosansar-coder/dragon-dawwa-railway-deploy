(() => {
  'use strict';
  const SOURCE = 'podcast';
  const safeStorage = {
    get(key) { try { return window.localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { window.localStorage.setItem(key, value); } catch {} },
  };
  const time = seconds => {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  };
  function mediaSession(episode, audio, seek) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({title: episode.title, artist: 'Dragon Dawwa', album: 'The Research Table'});
      navigator.mediaSession.setActionHandler('play', () => audio.play().catch(() => {}));
      navigator.mediaSession.setActionHandler('pause', () => audio.pause());
      navigator.mediaSession.setActionHandler('seekbackward', () => seek(-15));
      navigator.mediaSession.setActionHandler('seekforward', () => seek(15));
      navigator.mediaSession.setActionHandler('seekto', details => { if (Number.isFinite(details.seekTime)) audio.currentTime = details.seekTime; });
    } catch { /* Media Session is progressive enhancement only. */ }
  }
  function wire(root, episode, {onProgress = null} = {}) {
    const audio = root.querySelector('audio');
    if (!audio || !episode?.id) return null;
    const key = `dd-podcast-resume:${episode.id}`;
    const seek = delta => { if (Number.isFinite(audio.duration)) audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + delta)); };
    const current = root.querySelector('[data-current-time]');
    const duration = root.querySelector('[data-duration]');
    const range = root.querySelector('[data-seek]');
    const play = root.querySelector('[data-play]');
    const lines = [...root.querySelectorAll('[data-transcript-start]')];
    const chapters = [...root.querySelectorAll('[data-chapter-start]')];
    function update() {
      const seconds = Number(audio.currentTime) || 0;
      if (current) current.textContent = time(seconds);
      if (range) range.value = String(seconds);
      lines.forEach(line => {
        const active = seconds >= Number(line.dataset.transcriptStart) && seconds < Number(line.dataset.transcriptEnd);
        line.classList.toggle('is-current', active); line.setAttribute('aria-current', active ? 'true' : 'false');
      });
      chapters.forEach(mark => mark.classList.toggle('is-current', seconds >= Number(mark.dataset.chapterStart)));
    }
    function persist() {
      const seconds = Math.max(0, Number(audio.currentTime) || 0);
      safeStorage.set(key, String(seconds));
      if (typeof onProgress === 'function') onProgress(seconds);
    }
    root.addEventListener('click', event => {
      const jump = event.target.closest('[data-transcript-start],[data-chapter-start]');
      if (jump) { audio.currentTime = Number(jump.dataset.transcriptStart ?? jump.dataset.chapterStart) || 0; update(); return; }
      const skip = event.target.closest('[data-skip]'); if (skip) seek(Number(skip.dataset.skip) || 0);
    });
    play?.addEventListener('click', () => { if (audio.paused) audio.play().catch(() => {}); else audio.pause(); });
    range?.addEventListener('input', event => { audio.currentTime = Number(event.target.value) || 0; update(); });
    root.querySelector('[data-speed]')?.addEventListener('change', event => { audio.playbackRate = Number(event.target.value) || 1; });
    audio.addEventListener('loadedmetadata', () => {
      const saved = Number(safeStorage.get(key));
      if (Number.isFinite(saved) && saved > 0 && saved < audio.duration) audio.currentTime = saved;
      if (range) { range.max = String(audio.duration || 0); range.value = String(audio.currentTime || 0); }
      if (duration) duration.textContent = time(audio.duration); update();
    });
    audio.addEventListener('play', () => {
      if (typeof document.dispatchEvent === 'function' && typeof CustomEvent === 'function')
        document.dispatchEvent(new CustomEvent('dd:audio-start', {detail: {source: SOURCE, audio}}));
      if (play) play.textContent = 'Pause discussion';
      try { navigator.mediaSession.playbackState = 'playing'; } catch {}
    });
    audio.addEventListener('pause', () => { if (play) play.textContent = 'Play discussion'; persist(); try { navigator.mediaSession.playbackState = 'paused'; } catch {} });
    audio.addEventListener('timeupdate', update); audio.addEventListener('ended', persist);
    if (typeof document.addEventListener === 'function')
      document.addEventListener('dd:audio-start', event => { if (event.detail?.audio !== audio && !audio.paused) audio.pause(); });
    mediaSession(episode, audio, seek); update();
    return Object.freeze({audio, update, seek});
  }
  window.DDPodcastPlayer = Object.freeze({wire});
})();
