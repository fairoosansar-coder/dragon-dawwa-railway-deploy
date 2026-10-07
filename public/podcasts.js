(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const copy = {
    en: {title: 'The Research Table', intro: 'Reviewed research discussions appear here only after a qualified reviewer and staff final-listen approval. They are not personal rulings.', unavailable: 'Sinhala audio is not available yet. Published languages will be shown here honestly.'},
    ta: {title: 'ஆய்வு மேசை', intro: 'தகுதியான மதிப்பாய்வும் இறுதி கேட்புச் சான்றும் முடிந்த பிறகே ஆய்வு உரையாடல்கள் இங்கே தோன்றும். இவை தனிப்பட்ட மார்க்கத் தீர்ப்புகள் அல்ல.', unavailable: 'சிங்கள ஒலி இன்னும் கிடைக்கவில்லை. கிடைக்கும் மொழிகள் நேர்மையாகக் காட்டப்படும்.'},
  };
  function languageChanged() {
    const language = $('podcast-language').value;
    const selected = copy[language] || copy.en;
    document.documentElement.lang = language;
    $('podcast-title').textContent = selected.title; $('podcast-intro').textContent = selected.intro;
    $('podcast-language-note').textContent = language === 'si' ? selected.unavailable : '';
  }
  function fixtureEnabled() { return window.DD_ENABLE_PODCAST_FIXTURE === true; }
  function enableFixture() {
    if (!fixtureEnabled()) return;
    const card = $('podcast-fixture'); card.hidden = false; $('podcast-empty').hidden = true;
    const audio = card.querySelector('audio');
    // Tests inject a short synthetic object URL. Production code never supplies a fixture source.
    if (typeof window.DD_PODCAST_FIXTURE_AUDIO_URL === 'string') audio.src = window.DD_PODCAST_FIXTURE_AUDIO_URL;
    window.DDPodcastPlayer?.wire(card.querySelector('[data-podcast-player]')?.closest('.podcast-card') || card, {id: 'synthetic-fixture', title: 'Synthetic player fixture'});
  }
  $('podcast-language').addEventListener('change', languageChanged); languageChanged(); enableFixture();
})();
