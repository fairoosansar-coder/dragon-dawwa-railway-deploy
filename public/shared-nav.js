(() => {
  'use strict';

  const languages = ['en', 'ta', 'si'];
  const copy = {
    en: { home: 'Home', quran: 'Qur’an', study: 'Study', learn: 'Learn', resources: 'Resources', member: 'My learning', mosque: 'Mosques', research: 'Research', events: 'Events', about: 'About', participate: 'Contact', menuOpen: 'Open navigation', menuClose: 'Close navigation', mainNavigation: 'Main navigation', mobileNavigation: 'Mobile navigation', chooseLanguage: 'Choose language' },
    ta: { home: 'முகப்பு', quran: 'அல்குர்ஆன்', study: 'படிப்பு', learn: 'கற்றல்', resources: 'வளங்கள்', member: 'என் கற்றல்', mosque: 'பள்ளிவாசல்கள்', research: 'ஆய்வு', events: 'நிகழ்வுகள்', about: 'எங்களைப் பற்றி', participate: 'தொடர்பு', menuOpen: 'வழிசெலுத்தலைத் திறக்கவும்', menuClose: 'வழிசெலுத்தலை மூடவும்', mainNavigation: 'முதன்மை வழிசெலுத்தல்', mobileNavigation: 'கைபேசி வழிசெலுத்தல்', chooseLanguage: 'மொழியைத் தேர்ந்தெடுக்கவும்' },
    si: { home: 'මුල් පිටුව', quran: 'අල් කුර්ආනය', study: 'අධ්‍යයනය', learn: 'ඉගෙනුම', resources: 'සම්පත්', member: 'මගේ ඉගෙනුම', mosque: 'පල්ලි', research: 'පර්යේෂණ', events: 'සිදුවීම්', about: 'අප ගැන', participate: 'සම්බන්ධ වන්න', menuOpen: 'සංචාලනය විවෘත කරන්න', menuClose: 'සංචාලනය වසන්න', mainNavigation: 'ප්‍රධාන සංචාලනය', mobileNavigation: 'ජංගම සංචාලනය', chooseLanguage: 'භාෂාව තෝරන්න' }
  };

  // Public pages retain the multilingual visitor navigation but do not advertise
  // private study or account routes as public destinations.
  const publicPage = Boolean(document.querySelector('meta[name="dd-public-page"]'));
  document.querySelectorAll('[data-shared-nav-label]').forEach(nav => {
    const quran = nav.querySelector('[data-nav="quran"]');
    if (!publicPage && quran && !nav.querySelector('[data-nav="study"]')) {
      const link = document.createElement('a');
      link.href = '/study'; link.dataset.nav = 'study';
      quran.after(link);
    }
    const mosque = nav.querySelector('[data-nav="mosque"]');
    if (mosque) mosque.href = '/mosques';
    const learn = nav.querySelector('[data-nav="learn"]');
    if (learn && !nav.querySelector('[data-nav="resources"]')) {
      const link = document.createElement('a');
      link.href = '/resources'; link.dataset.nav = 'resources';
      learn.after(link);
    }
    if (!publicPage && !nav.querySelector('[data-nav="member"]')) {
      const link = document.createElement('a');
      link.href = '/member'; link.dataset.nav = 'member';
      nav.append(link);
    }
  });

  function storedLanguage() {
    try {
      const value = JSON.parse(localStorage.getItem('dd-language'));
      return languages.includes(value) ? value : 'en';
    } catch {
      return 'en';
    }
  }

  function saveLanguage(language) {
    try { localStorage.setItem('dd-language', JSON.stringify(language)); } catch {}
  }

  function render(language = storedLanguage()) {
    const dictionary = copy[language] || copy.en;
    document.documentElement.lang = language;
    document.querySelectorAll('[data-english-only]').forEach(main => {
      // These operational/legal pages have not received professional language review.
      // Never imply a change of interface locale translated their substantive copy.
      main.lang = 'en';
      let note = main.querySelector('[data-language-availability]');
      if (language === 'en') { note?.remove(); return; }
      if (!note) {
        note = document.createElement('p');
        note.className = 'community-language-note';
        note.dataset.languageAvailability = '';
        note.setAttribute('role', 'status');
        main.prepend(note);
      }
      note.lang = language;
      note.textContent = language === 'ta'
        ? 'இந்தப் பக்கத்தின் முக்கிய உள்ளடக்கம் தற்போது ஆங்கிலத்தில் மட்டுமே உள்ளது; மொழிபெயர்ப்பு இன்னும் சரிபார்க்கப்படவில்லை.'
        : 'මෙම පිටුවේ ප්‍රධාන අන්තර්ගතය දැනට ඉංග්‍රීසි භාෂාවෙන් පමණක් ඇත; පරිවර්තනය තවම සමාලෝචනය කර නැත.';
    });
    document.querySelectorAll('[data-nav]').forEach(element => {
      const key = element.dataset.nav;
      element.textContent = dictionary[key] || copy.en[key] || element.textContent;
    });
    document.querySelectorAll('[data-shared-language]').forEach(select => {
      select.value = language;
      select.setAttribute('aria-label', dictionary.chooseLanguage);
    });
    document.querySelectorAll('[data-shared-nav-label="main"]').forEach(nav => nav.setAttribute('aria-label', dictionary.mainNavigation));
    document.querySelectorAll('[data-shared-nav-label="mobile"]').forEach(nav => nav.setAttribute('aria-label', dictionary.mobileNavigation));
    document.querySelectorAll('[data-shared-menu]').forEach(button => {
      button.setAttribute('aria-label', button.getAttribute('aria-expanded') === 'true' ? dictionary.menuClose : dictionary.menuOpen);
    });
  }

  function dispatch(language) {
    document.dispatchEvent(new CustomEvent('dd:languagechange', { detail: { language } }));
  }

  document.querySelectorAll('[data-shared-language]').forEach(select => {
    select.addEventListener('change', event => {
      const language = languages.includes(event.target.value) ? event.target.value : 'en';
      saveLanguage(language);
      render(language);
      dispatch(language);
    });
  });

  document.querySelectorAll('[data-shared-menu]').forEach(button => {
    const menu = document.getElementById(button.getAttribute('aria-controls'));
    if (!menu) return;
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(open));
      menu.hidden = !open;
      render(storedLanguage());
    });
    menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
      button.setAttribute('aria-expanded', 'false');
      menu.hidden = true;
      render(storedLanguage());
    }));
  });

  render();
  window.DDSharedNav = { language: storedLanguage, render };
})();
