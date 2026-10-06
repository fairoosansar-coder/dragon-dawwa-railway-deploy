(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const HOME_IDS = new Set(['ask', 'wisdom', 'authenticity', 'context']);
  const LANGUAGES = new Set(['en', 'ta', 'si']);
  let state = null;
  let language = storedLanguage();
  const externalItems = new Map(), publishedItems = new Map();
  let saveMetadataLoading = false;
  let preferenceCatalogueLoading = null;
  const metadataReady = {external:false,editorial:false};

  const copy = {
    en: {
      legacyPending:'Older home reflection withheld for review',
      kindExternal:'External publisher', kindEditorial:'Editorial reading', kindHome:'Home reflection', kindOther:'Saved reading', itemUnavailable:'unavailable or withdrawn', itemPending:'source details temporarily unavailable',
      localPlaceImport: 'Import this browser’s older saved verse',
      preferredTranslation: 'Preferred Qur’an translation (optional)', preferredReciter: 'Preferred reciter (optional)',
      localPlaceFound: 'Older browser-only marker found: {key}. Choose Import to replace your account reading place.',
      localPlaceNone: 'No older browser-only Qur’an marker was found here.',
      localPlaceSynced: 'This browser’s older marker already matches your account reading place.',
      localPlaceImported: 'Browser marker {key} imported to your private account.',
      skip: 'Skip to My learning', myLearning: 'My learning', eyebrow: 'PRIVATE REVIEW · INVITED MEMBERS', title: 'My learning', intro: 'Keep a small, private list of saved learning links and a Qur’an reading place across your invited sessions.', privateTitle: 'Private by default', privateBody: 'This protected review is not a public release. Your contact choices, saves and reading place are visible only to your own verified member session.', signInEyebrow: 'SIGN IN', signInTitle: 'Continue with Manus', signInBody: 'Use the verified Manus sign-in for this private review. Signing in does not itself create a Dragon Dawwa member profile: the owner must first invite your exact account as a reader.', signIn: 'Sign in with Manus', recovery: 'Dragon Dawwa cannot reset a Manus password. For a Manus email-password account, choose “Forgot Password” at Manus sign-in. If you use Google, Apple or Microsoft, recover access with that sign-in provider.', recoveryLink: 'Manus account recovery guidance ↗', inviteEyebrow: 'OWNER-INVITED ACCESS', inviteTitle: 'Complete your private member profile', inviteBody: 'This profile is available only after an owner has invited your verified Manus account. We do not collect an address, identity document or religious declaration.', register: 'Create my profile', profileReady:'Your verified account may create a private member profile; this does not change its staff role or share contact details.',inviteFineprint: 'If this was not expected, sign out and contact the review owner through an established channel. Do not share passwords or account tokens.', profileEyebrow: 'PROFILE', registrationTitle: 'Your member profile', profileIntro: 'Choose only what you want to keep in this private review. Contact details are optional and are not shown in the member list.', displayName: 'Display name', avatar: 'Avatar preset', avatarNone: 'No avatar', avatarRosette: 'Rosette', avatarLeaf: 'Leaf', avatarBook: 'Book', preferredLanguage: 'Preferred language', city: 'City (optional)', mosque: 'Mosque or learning place (optional)', contactLegend: 'Private contact preference (optional)', contactPreference: 'Preferred contact method', contactNone: 'Do not store contact', contactEmail: 'Email', contactPhone: 'Phone', contact: 'Contact detail', contactOptIn: 'I choose to store this contact detail for my selected preference.', saveProfile: 'Save private profile', cancel: 'Cancel', profileTitle: 'Your private profile', editProfile: 'Edit profile', savedEyebrow: 'SAVED ITEMS', savedTitle: 'Keep a learning link', browseLearning: 'Browse learning', savedIntro: 'Saved resources are private to this invited profile. Saving a link does not endorse it as individual religious advice.', savesEmpty: 'No saved items yet. Browse the learning library or import your old browser bookmarks below.', importEyebrow: 'ONE-TIME CHOICE', importTitle: 'Import old browser bookmarks', importBody: 'You can explicitly import old dd-saved bookmarks from this browser. Only the former home reading IDs are accepted: ask, wisdom, authenticity and context.', importNote: 'Your dd-note and dd-question writing stays in this browser. It is not read or uploaded by this import.', importButton: 'Import eligible bookmarks', placeEyebrow: 'QUR’AN PLACE', placeTitle: 'Reading place', openQuran: 'Open Qur’an reader', placeIntro: 'Save a verse position to return to during another authenticated invited session. It is a reading marker, not a generated religious answer.', chapter: 'Chapter', page: 'Page', verseKey: 'Verse key', savePlace: 'Save reading place', staffDeletion:'Staff profiles cannot be self-deleted here. The owner must first transfer or change the role to reader; any necessary staff audit records remain.',deleteEyebrow: 'ACCOUNT DELETION', deleteTitle: 'Delete this Dragon Dawwa member profile', deleteBody: 'This removes this app’s profile, saved items and reading place, then disables this reader invitation. Re-entry requires a new owner invitation. A keyed pseudonymous deletion record and necessary existing role/staff audit IDs remain. This does not delete your upstream Manus account.', deleteSummary: 'I understand what deletion changes', deleteDetails: 'Manus account recovery and account deletion are provider-managed. Dragon Dawwa has no password store and cannot reset, recover or delete a Manus identity.', deletePrompt: 'Type DELETE MY ACCOUNT to continue', deleteButton: 'Delete my member profile', signOut: 'Sign out', signOutNote: 'This signs out of this private review session.', footer: 'Private invited-member review · no public release is implied', remove: 'Remove', saved: 'Saved', profileSaved: 'Your private profile was saved.', profileCreated: 'Your private profile was created.', importReady: 'Eligible browser bookmarks found: {count}.', importNone: 'No eligible old dd-saved bookmarks were found in this browser.', importDone: 'Imported {count} bookmark(s). Already saved: {already}.', placeSaved: 'Reading place saved: {key}.', removed: 'Saved item removed.', requestFailed: 'That change could not be saved. Please try again.', signInRequired: 'Please sign in with Manus to use My learning.', invitationRequired: 'This verified account does not currently have an active reader invitation.', deleted: 'Your Dragon Dawwa member profile was deleted. Sign out now; a new owner invitation is required before this account can return.', loading: 'Checking invited-member access…', saving: 'Saving…', invalidContact: 'Choose a contact method, provide a matching contact detail, and opt in — or select “Do not store contact”.', invalidPlace: 'Use chapter 1–114, page 1–15, and a matching verse key such as 2:255.', deletionFailed: 'Deletion was not completed. Check the exact confirmation and try again.'
    },
    ta: {
      legacyPending:'பழைய முகப்புச் சிந்தனை மதிப்பாய்விற்காக மறைக்கப்பட்டுள்ளது',
      kindExternal:'வெளிப்புற வெளியீட்டாளர்', kindEditorial:'ஆசிரியர் மதிப்பாய்வுக் கட்டுரை', kindHome:'முகப்பு வாசிப்பு', kindOther:'சேமித்த வாசிப்பு', itemUnavailable:'கிடைக்கவில்லை அல்லது திரும்பப் பெறப்பட்டது', itemPending:'மூல விவரம் தற்காலிகமாகக் கிடைக்கவில்லை',
      localPlaceImport: 'இந்த உலாவியின் பழைய சேமித்த வசனத்தை இறக்குமதி செய்க',
      localPlaceFound: 'இந்த உலாவியில் பழைய குறி: {key}. கணக்கின் வாசிப்பு இடத்தை மாற்ற இறக்குமதியைத் தேர்ந்தெடுக்கவும்.',
      localPlaceNone: 'இந்த உலாவியில் பழைய குர்ஆன் வாசிப்பு குறி இல்லை.',
      localPlaceSynced: 'இந்த உலாவியின் பழைய குறி உங்கள் கணக்கின் வாசிப்பு இடத்துடன் ஏற்கனவே பொருந்துகிறது.',
      localPlaceImported: '{key} என்ற உலாவிக் குறி உங்கள் தனியார் கணக்கில் இறக்குமதி செய்யப்பட்டது.',
      skip: 'என் கற்றலுக்குச் செல்லவும்', myLearning: 'என் கற்றல்', eyebrow: 'தனியார் மதிப்பாய்வு · அழைக்கப்பட்ட உறுப்பினர்கள்', title: 'என் கற்றல்', intro: 'அழைக்கப்பட்ட அமர்வுகளில் உங்கள் சேமித்த கற்றல் இணைப்புகளையும் குர்ஆன் வாசிப்பு இடத்தையும் தனிப்பட்ட முறையில் வைத்திருங்கள்.', privateTitle: 'இயல்பாகத் தனியார்', privateBody: 'இந்தப் பாதுகாக்கப்பட்ட மதிப்பாய்வு பொதுவெளி வெளியீடு அல்ல. உங்கள் தொடர்புத் தேர்வுகள், சேமிப்புகள் மற்றும் வாசிப்பு இடம் உங்கள் உறுதிப்படுத்தப்பட்ட உறுப்பினர் அமர்வில் மட்டுமே தெரியும்.', signInEyebrow: 'உள்நுழைக', signInTitle: 'Manus மூலம் தொடரவும்', signInBody: 'இந்தத் தனியார் மதிப்பாய்விற்கான உறுதிப்படுத்தப்பட்ட Manus உள்நுழைவைப் பயன்படுத்துங்கள். உள்நுழைவது மட்டும் Dragon Dawwa உறுப்பினர் சுயவிவரத்தை உருவாக்காது: உரிமையாளர் உங்கள் சரியான கணக்கை வாசகராக அழைக்க வேண்டும்.', signIn: 'Manus மூலம் உள்நுழைக', recovery: 'Dragon Dawwa ஒரு Manus கடவுச்சொல்லை மீட்டமைக்க முடியாது. Manus மின்னஞ்சல்-கடவுச்சொல் கணக்கிற்கு, Manus உள்நுழைவில் “Forgot Password” என்பதைத் தேர்ந்தெடுக்கவும். Google, Apple அல்லது Microsoft பயன்படுத்தினால், அந்த வழங்குநரிடம் அணுகலை மீட்டெடுக்கவும்.', recoveryLink: 'Manus கணக்கு மீட்பு வழிகாட்டல் ↗', inviteEyebrow: 'உரிமையாளர் அழைப்பு அணுகல்', inviteTitle: 'உங்கள் தனியார் உறுப்பினர் சுயவிவரத்தை முடிக்கவும்', inviteBody: 'உரிமையாளர் உங்கள் உறுதிப்படுத்தப்பட்ட Manus கணக்கை அழைத்த பின்னரே இந்தச் சுயவிவரம் கிடைக்கும். முகவரி, அடையாள ஆவணம் அல்லது மத அறிவிப்பை நாங்கள் சேகரிப்பதில்லை.', register: 'என் சுயவிவரத்தை உருவாக்கவும்', profileReady:'உறுதிப்படுத்தப்பட்ட உங்கள் கணக்கில் தனியார் உறுப்பினர் சுயவிவரத்தை உருவாக்கலாம்; இது பணியாளர் பங்கை மாற்றவோ தொடர்பு விவரங்களைப் பகிரவோ செய்யாது.',inviteFineprint: 'இது எதிர்பாராதது என்றால், வெளியேறி நிறுவப்பட்ட வழி மூலம் மதிப்பாய்வு உரிமையாளரைத் தொடர்புகொள்ளவும். கடவுச்சொல் அல்லது கணக்கு டோக்கனைப் பகிராதீர்கள்.', profileEyebrow: 'சுயவிவரம்', registrationTitle: 'உங்கள் உறுப்பினர் சுயவிவரம்', profileIntro: 'இந்தத் தனியார் மதிப்பாய்வில் வைத்திருக்க விரும்புவதை மட்டுமே தேர்ந்தெடுக்கவும். தொடர்பு விவரங்கள் விருப்பமானவை; உறுப்பினர் பட்டியலில் காட்டப்படாது.', displayName: 'காண்பிக்கப்படும் பெயர்', avatar: 'அவதார் முன்னமைவு', avatarNone: 'அவதார் வேண்டாம்', avatarRosette: 'ரோசெட்', avatarLeaf: 'இலை', avatarBook: 'புத்தகம்', preferredLanguage: 'விருப்ப மொழி', city: 'நகரம் (விருப்பம்)', mosque: 'பள்ளிவாசல் அல்லது கற்றல் இடம் (விருப்பம்)', contactLegend: 'தனியார் தொடர்பு விருப்பம் (விருப்பம்)', contactPreference: 'விருப்பமான தொடர்பு முறை', contactNone: 'தொடர்பைச் சேமிக்க வேண்டாம்', contactEmail: 'மின்னஞ்சல்', contactPhone: 'தொலைபேசி', contact: 'தொடர்பு விவரம்', contactOptIn: 'என் தேர்ந்தெடுத்த விருப்பத்திற்காக இந்தத் தொடர்பு விவரத்தைச் சேமிக்க நான் தேர்வுசெய்கிறேன்.', saveProfile: 'தனியார் சுயவிவரத்தைச் சேமிக்கவும்', cancel: 'ரத்துசெய்', profileTitle: 'உங்கள் தனியார் சுயவிவரம்', editProfile: 'சுயவிவரத்தைத் திருத்து', savedEyebrow: 'சேமித்தவை', savedTitle: 'ஒரு கற்றல் இணைப்பை வைத்திருங்கள்', browseLearning: 'கற்றலை உலாவுக', savedIntro: 'சேமித்த ஆதாரங்கள் இந்த அழைக்கப்பட்ட சுயவிவரத்திற்கு தனியார். இணைப்பைச் சேமிப்பது தனிப்பட்ட மார்க்க ஆலோசனையாக அதை அங்கீகரிப்பதில்லை.', savesEmpty: 'இன்னும் சேமிப்புகள் இல்லை. கற்றல் நூலகத்தை உலாவுங்கள் அல்லது கீழே உள்ள பழைய உலாவி சேமிப்புகளை இறக்குமதி செய்யுங்கள்.', importEyebrow: 'ஒருமுறைத் தேர்வு', importTitle: 'பழைய உலாவி சேமிப்புகளை இறக்குமதி செய்யவும்', importBody: 'இந்த உலாவியிலிருந்து பழைய dd-saved சேமிப்புகளை வெளிப்படையாக இறக்குமதி செய்யலாம். ask, wisdom, authenticity மற்றும் context என்ற பழைய முகப்பு வாசிப்பு ID-கள் மட்டுமே ஏற்கப்படும்.', importNote: 'உங்கள் dd-note மற்றும் dd-question எழுத்துகள் இந்த உலாவியிலேயே இருக்கும். இந்த இறக்குமதி அவற்றைப் படிக்கவோ பதிவேற்றவோ செய்யாது.', importButton: 'தகுதியான சேமிப்புகளை இறக்குமதி செய்', placeEyebrow: 'குர்ஆன் இடம்', placeTitle: 'வாசிப்பு இடம்', openQuran: 'குர்ஆன் வாசிப்பானைத் திறக்கவும்', placeIntro: 'மற்றொரு உறுதிப்படுத்தப்பட்ட அழைக்கப்பட்ட அமர்வில் திரும்ப வர வசன இடத்தைச் சேமிக்கவும். இது வாசிப்பு குறி; உருவாக்கப்பட்ட மார்க்கப் பதில் அல்ல.', chapter: 'அத்தியாயம்', page: 'பக்கம்', verseKey: 'வசன விசை', savePlace: 'வாசிப்பு இடத்தைச் சேமி', staffDeletion:'பணியாளர் சுயவிவரத்தை இங்கே சுயமாக நீக்க முடியாது. முதலில் உரிமையாளர் பங்கை மாற்ற வேண்டும் அல்லது வாசகர் பங்காக மாற்ற வேண்டும்; தேவையான பணியாளர் தணிக்கை பதிவுகள் இருக்கும்.',deleteEyebrow: 'கணக்கு நீக்கம்', deleteTitle: 'இந்த Dragon Dawwa உறுப்பினர் சுயவிவரத்தை நீக்கவும்', deleteBody: 'இது இந்த செயலியின் சுயவிவரம், சேமித்தவை மற்றும் வாசிப்பு இடத்தை நீக்கி, வாசகர் அழைப்பை முடக்கும். மீண்டும் வர புதிய உரிமையாளர் அழைப்பு தேவை. விசை கொண்ட புனைபெயர் நீக்கப் பதிவு மற்றும் தேவையான பங்கு/பணியாளர் தணிக்கை ID-கள் இருக்கும். இது உங்கள் Manus கணக்கை நீக்காது.', deleteSummary: 'நீக்கம் மாற்றுவதைக் புரிந்துகொள்கிறேன்', deleteDetails: 'Manus கணக்கு மீட்பும் நீக்கமும் வழங்குநரால் நிர்வகிக்கப்படுகின்றன. Dragon Dawwa-வில் கடவுச்சொல் சேமிப்பகம் இல்லை; Manus அடையாளத்தை மீட்டெடுக்கவோ நீக்கவோ முடியாது.', deletePrompt: 'தொடர DELETE MY ACCOUNT என்று தட்டச்சிடவும்', deleteButton: 'என் உறுப்பினர் சுயவிவரத்தை நீக்கு', signOut: 'வெளியேறு', signOutNote: 'இது இந்தத் தனியார் மதிப்பாய்வு அமர்விலிருந்து வெளியேற்றும்.', footer: 'தனியார் அழைக்கப்பட்ட உறுப்பினர் மதிப்பாய்வு · பொதுவெளி வெளியீடு குறிக்கப்படவில்லை', remove: 'நீக்கு', saved: 'சேமிக்கப்பட்டது', profileSaved: 'உங்கள் தனியார் சுயவிவரம் சேமிக்கப்பட்டது.', profileCreated: 'உங்கள் தனியார் சுயவிவரம் உருவாக்கப்பட்டது.', importReady: 'தகுதியான உலாவி சேமிப்புகள்: {count}.', importNone: 'இந்த உலாவியில் தகுதியான பழைய dd-saved சேமிப்புகள் இல்லை.', importDone: '{count} சேமிப்பு(கள்) இறக்குமதி செய்யப்பட்டது. ஏற்கனவே சேமிக்கப்பட்டவை: {already}.', placeSaved: 'வாசிப்பு இடம் சேமிக்கப்பட்டது: {key}.', removed: 'சேமித்த உருப்படி நீக்கப்பட்டது.', requestFailed: 'மாற்றம் சேமிக்கப்படவில்லை. மீண்டும் முயற்சிக்கவும்.', signInRequired: 'என் கற்றலைப் பயன்படுத்த Manus மூலம் உள்நுழையவும்.', invitationRequired: 'இந்த உறுதிப்படுத்தப்பட்ட கணக்கிற்கு தற்போது செயலில் வாசகர் அழைப்பு இல்லை.', deleted: 'உங்கள் Dragon Dawwa உறுப்பினர் சுயவிவரம் நீக்கப்பட்டது. இப்போது வெளியேறவும்; மீண்டும் வர புதிய உரிமையாளர் அழைப்பு தேவை.', loading: 'அழைக்கப்பட்ட உறுப்பினர் அணுகல் சரிபார்க்கப்படுகிறது…', saving: 'சேமிக்கப்படுகிறது…', invalidContact: 'தொடர்பு முறையைத் தேர்ந்தெடுத்து, பொருத்தமான விவரத்தை வழங்கி ஒப்புதல் தரவும் — அல்லது “தொடர்பைச் சேமிக்க வேண்டாம்” என்பதைத் தேர்ந்தெடுக்கவும்.', invalidPlace: 'அத்தியாயம் 1–114, பக்கம் 1–15, மற்றும் 2:255 போன்ற பொருந்தும் வசன விசையைப் பயன்படுத்தவும்.', deletionFailed: 'நீக்கம் நிறைவடையவில்லை. சரியான உறுதிப்படுத்தலைச் சரிபார்த்து மீண்டும் முயலவும்.'
    },
    si: {
      legacyPending:'පැරණි මුල් පිටු සටහන සමාලෝචනය සඳහා නොපෙන්වයි',
      kindExternal:'බාහිර ප්‍රකාශකයා', kindEditorial:'සංස්කරණ ලිපිය', kindHome:'මුල් පිටු කියවීම', kindOther:'සුරැකි කියවීම', itemUnavailable:'නොමැත හෝ ඉවත් කර ඇත', itemPending:'මූලාශ්‍ර විස්තර තාවකාලිකව නොමැත',
      localPlaceImport: 'මෙම බ්‍රවුසරයේ පැරණි සුරැකි වාක්‍යය ආනයනය කරන්න',
      localPlaceFound: 'මෙම බ්‍රවුසරයේ පැරණි ලකුණ: {key}. ගිණුමේ කියවීමේ ස්ථානය වෙනස් කිරීමට ආනයනය තෝරන්න.',
      localPlaceNone: 'මෙම බ්‍රවුසරයේ පැරණි කුර්ආන් කියවීමේ ලකුණක් හමු නොවීය.',
      localPlaceSynced: 'මෙම බ්‍රවුසරයේ පැරණි ලකුණ දැනටමත් ඔබේ ගිණුමේ කියවීමේ ස්ථානයට ගැළපේ.',
      localPlaceImported: '{key} බ්‍රවුසර ලකුණ ඔබේ පුද්ගලික ගිණුමට ආනයනය කරන ලදි.',
      skip: 'මගේ ඉගෙනීම වෙත යන්න', myLearning: 'මගේ ඉගෙනීම', eyebrow: 'පුද්ගලික සමාලෝචනය · ආරාධිත සාමාජිකයන්', title: 'මගේ ඉගෙනීම', intro: 'ඔබ ආරාධනා ලත් සැසි අතර ඔබේ සුරැකි ඉගෙනුම් සබැඳි සහ කුර්ආන් කියවීමේ ස්ථානය පුද්ගලිකව තබා ගන්න.', privateTitle: 'පෙරනිමියෙන් පුද්ගලිකයි', privateBody: 'මෙම ආරක්ෂිත සමාලෝචනය ප්‍රසිද්ධ නිකුතුවක් නොවේ. ඔබේ සම්බන්ධතා තේරීම්, සුරැකුම් සහ කියවීමේ ස්ථානය ඔබේ තහවුරු කළ සාමාජික සැසියට පමණක් පෙනේ.', signInEyebrow: 'පිවිසෙන්න', signInTitle: 'Manus සමඟ ඉදිරියට යන්න', signInBody: 'මෙම පුද්ගලික සමාලෝචනය සඳහා තහවුරු කළ Manus පිවිසුම භාවිත කරන්න. පිවිසීම පමණක් Dragon Dawwa සාමාජික පැතිකඩක් සාදන්නේ නැත: හිමිකරු ඔබේ නිවැරදි ගිණුම කියවන්නෙකු ලෙස ආරාධනා කළ යුතුය.', signIn: 'Manus සමඟ පිවිසෙන්න', recovery: 'Dragon Dawwa හට Manus මුරපදයක් යළි සැකසිය නොහැක. Manus ඊමේල්-මුරපද ගිණුමක් සඳහා Manus පිවිසුමේ “Forgot Password” තෝරන්න. ඔබ Google, Apple හෝ Microsoft භාවිත කරන්නේ නම්, එම සපයන්නා සමඟ ප්‍රවේශය ප්‍රතිසාධනය කරන්න.', recoveryLink: 'Manus ගිණුම් ප්‍රතිසාධන මගපෙන්වීම ↗', inviteEyebrow: 'හිමිකරු ආරාධනා කළ ප්‍රවේශය', inviteTitle: 'ඔබේ පුද්ගලික සාමාජික පැතිකඩ සම්පූර්ණ කරන්න', inviteBody: 'හිමිකරු ඔබේ තහවුරු කළ Manus ගිණුමට ආරාධනා කළ පසු පමණක් මෙම පැතිකඩ ලැබේ. අපි ලිපිනයක්, හැඳුනුම් ලේඛනයක් හෝ ආගමික ප්‍රකාශයක් රැස් නොකරමු.', register: 'මගේ පැතිකඩ සාදන්න', profileReady:'ඔබගේ තහවුරු කළ ගිණුමට පුද්ගලික සාමාජික පැතිකඩක් සාදා ගත හැකිය; එයින් කාර්ය මණ්ඩල භූමිකාව වෙනස් නොවෙයි හෝ සම්බන්ධතා විස්තර හෙළි නොවේ.',inviteFineprint: 'මෙය බලාපොරොත්තු නොවූ දෙයක් නම්, පිටවී ස්ථාපිත මාර්ගයකින් සමාලෝචන හිමිකරු අමතන්න. මුරපද හෝ ගිණුම් ටෝකන බෙදා නොගන්න.', profileEyebrow: 'පැතිකඩ', registrationTitle: 'ඔබේ සාමාජික පැතිකඩ', profileIntro: 'මෙම පුද්ගලික සමාලෝචනයේ තබා ගැනීමට අවශ්‍ය දේ පමණක් තෝරන්න. සම්බන්ධතා විස්තර විකල්ප වන අතර සාමාජික ලැයිස්තුවේ නොපෙන්වයි.', displayName: 'පෙන්වන නම', avatar: 'අවතාර පෙරසැකසුම', avatarNone: 'අවතාරයක් නැත', avatarRosette: 'මල රටාව', avatarLeaf: 'කොළය', avatarBook: 'පොත', preferredLanguage: 'කැමති භාෂාව', city: 'නගරය (විකල්ප)', mosque: 'පල්ලිය හෝ ඉගෙනුම් ස්ථානය (විකල්ප)', contactLegend: 'පුද්ගලික සම්බන්ධතා කැමැත්ත (විකල්ප)', contactPreference: 'කැමති සම්බන්ධතා ක්‍රමය', contactNone: 'සම්බන්ධතාව සුරකින්න එපා', contactEmail: 'ඊමේල්', contactPhone: 'දුරකථන', contact: 'සම්බන්ධතා විස්තරය', contactOptIn: 'මගේ තෝරාගත් කැමැත්ත සඳහා මෙම සම්බන්ධතා විස්තරය සුරැකීමට මම තෝරා ගනිමි.', saveProfile: 'පුද්ගලික පැතිකඩ සුරකින්න', cancel: 'අවලංගු කරන්න', profileTitle: 'ඔබේ පුද්ගලික පැතිකඩ', editProfile: 'පැතිකඩ සංස්කරණය කරන්න', savedEyebrow: 'සුරැකූ අයිතම', savedTitle: 'ඉගෙනුම් සබැඳියක් තබා ගන්න', browseLearning: 'ඉගෙනීම පිරික්සන්න', savedIntro: 'සුරැකූ සම්පත් මෙම ආරාධිත පැතිකඩට පුද්ගලිකයි. සබැඳියක් සුරැකීම එය පුද්ගලික ආගමික උපදෙසක් ලෙස අනුමත කිරීමක් නොවේ.', savesEmpty: 'තවම සුරැකූ අයිතම නැත. ඉගෙනුම් පුස්තකාලය පිරික්සන්න හෝ පහත පැරණි බ්‍රවුසර සුරැකුම් ආනයනය කරන්න.', importEyebrow: 'එක් වරක් තේරීම', importTitle: 'පැරණි බ්‍රවුසර සුරැකුම් ආනයනය කරන්න', importBody: 'ඔබට මෙම බ්‍රවුසරයෙන් පැරණි dd-saved සුරැකුම් පැහැදිලිව ආනයනය කළ හැක. ask, wisdom, authenticity සහ context පැරණි මුල් පිටු කියවීම් ID පමණක් පිළිගනී.', importNote: 'ඔබේ dd-note සහ dd-question ලිවීම් මෙම බ්‍රවුසරයේම පවතී. මෙම ආනයනය ඒවා කියවන්නේ හෝ උඩුගත කරන්නේ නැත.', importButton: 'සුදුසු සුරැකුම් ආනයනය කරන්න', placeEyebrow: 'කුර්ආන් ස්ථානය', placeTitle: 'කියවීමේ ස්ථානය', openQuran: 'කුර්ආන් කියවනය විවෘත කරන්න', placeIntro: 'වෙනත් තහවුරු කළ ආරාධිත සැසියකදී ආපසු පැමිණීමට වාක්‍ය ස්ථානයක් සුරකින්න. මෙය කියවීමේ සලකුණක් මිස නිර්මාණය කළ ආගමික පිළිතුරක් නොවේ.', chapter: 'පරිච්ඡේදය', page: 'පිටුව', verseKey: 'වාක්‍ය යතුර', savePlace: 'කියවීමේ ස්ථානය සුරකින්න', staffDeletion:'කාර්ය මණ්ඩල පැතිකඩක් මෙහිදී තමන්ටම මකා දැමිය නොහැක. හිමිකරු මුලින් භූමිකාව පවරා දිය යුතුය හෝ කියවන්නාගේ භූමිකාවට වෙනස් කළ යුතුය; අවශ්\u200dය කාර්ය මණ්ඩල විගණන වාර්තා පවතී.',deleteEyebrow: 'ගිණුම් මකා දැමීම', deleteTitle: 'මෙම Dragon Dawwa සාමාජික පැතිකඩ මකන්න', deleteBody: 'මෙය මෙම යෙදුමේ පැතිකඩ, සුරැකූ අයිතම සහ කියවීමේ ස්ථානය ඉවත් කර, මෙම කියවන්නාගේ ආරාධනය අක්‍රීය කරයි. නැවත ඇතුල් වීමට නව හිමිකරු ආරාධනයක් අවශ්‍යය. යතුරුගත අනන්‍ය නොවන මකාදැමීමේ වාර්තාවක් සහ අවශ්‍ය දැනට පවතින භූමිකා/කාර්ය මණ්ඩල විගණන ID පවතී. මෙය ඔබේ Manus ගිණුම මකන්නේ නැත.', deleteSummary: 'මකා දැමීමෙන් වෙනස් වන දේ මට තේරේ', deleteDetails: 'Manus ගිණුම් ප්‍රතිසාධනය සහ මකාදැමීම සපයන්නා විසින් කළමනාකරණය කරයි. Dragon Dawwa හි මුරපද ගබඩාවක් නැති අතර Manus අනන්‍යතාවයක් ප්‍රතිසාධනය කිරීමට හෝ මකා දැමීමට නොහැක.', deletePrompt: 'ඉදිරියට යාමට DELETE MY ACCOUNT ටයිප් කරන්න', deleteButton: 'මගේ සාමාජික පැතිකඩ මකන්න', signOut: 'පිටවන්න', signOutNote: 'මෙය මෙම පුද්ගලික සමාලෝචන සැසියෙන් පිට කරයි.', footer: 'පුද්ගලික ආරාධිත-සාමාජික සමාලෝචනය · ප්‍රසිද්ධ නිකුතුවක් අදහස් නොවේ', remove: 'ඉවත් කරන්න', saved: 'සුරැකුණි', profileSaved: 'ඔබේ පුද්ගලික පැතිකඩ සුරැකුණි.', profileCreated: 'ඔබේ පුද්ගලික පැතිකඩ සෑදුවා.', importReady: 'සුදුසු බ්‍රවුසර සුරැකුම් හමු විය: {count}.', importNone: 'මෙම බ්‍රවුසරයේ සුදුසු පැරණි dd-saved සුරැකුම් හමු නොවීය.', importDone: 'සුරැකුම් {count}ක් ආනයනය කළා. දැනටමත් සුරැකූ: {already}.', placeSaved: 'කියවීමේ ස්ථානය සුරැකුණි: {key}.', removed: 'සුරැකූ අයිතමය ඉවත් කළා.', requestFailed: 'එම වෙනස සුරැකිය නොහැකි විය. නැවත උත්සාහ කරන්න.', signInRequired: 'මගේ ඉගෙනීම භාවිත කිරීමට Manus සමඟ පිවිසෙන්න.', invitationRequired: 'මෙම තහවුරු කළ ගිණුමට දැනට සක්‍රීය කියවන්නාගේ ආරාධනයක් නැත.', deleted: 'ඔබේ Dragon Dawwa සාමාජික පැතිකඩ මකා ඇත. දැන් පිටවන්න; මෙම ගිණුමට නැවත පැමිණීමට නව හිමිකරු ආරාධනයක් අවශ්‍යය.', loading: 'ආරාධිත-සාමාජික ප්‍රවේශය පරීක්ෂා කරමින්…', saving: 'සුරකිමින්…', invalidContact: 'සම්බන්ධතා ක්‍රමයක් තෝරා, ගැළපෙන විස්තරයක් දී කැමැත්ත තහවුරු කරන්න — නැතහොත් “සම්බන්ධතාව සුරකින්න එපා” තෝරන්න.', invalidPlace: 'පරිච්ඡේද 1–114, පිටු 1–15, සහ 2:255 වැනි ගැළපෙන වාක්‍ය යතුරක් භාවිත කරන්න.', deletionFailed: 'මකා දැමීම සම්පූර්ණ වූයේ නැත. නිවැරදි තහවුරු කිරීම පරීක්ෂා කර නැවත උත්සාහ කරන්න.'
    }
  };

  function storedLanguage() {
    try { const value = JSON.parse(localStorage.getItem('dd-language')); return LANGUAGES.has(value) ? value : 'en'; }
    catch { return 'en'; }
  }
  function persistLanguage(value) { try { localStorage.setItem('dd-language', JSON.stringify(value)); } catch {} }
  function t(key, replacements = {}) {
    let value = copy[language]?.[key] || copy.en[key] || key;
    for (const [name, replacement] of Object.entries(replacements)) value = value.replaceAll(`{${name}}`, String(replacement));
    return value;
  }
  function setLanguage(next) {
    language = LANGUAGES.has(next) ? next : 'en';
    persistLanguage(language);
    document.documentElement.lang = language;
    $('#language').value = language;
    document.querySelectorAll('[data-copy]').forEach(node => { node.textContent = t(node.dataset.copy); });
    const profile = state?.profile;
    if (profile) renderProfileSummary(profile);
    renderSaves();
    renderImportDetail();
    renderPlace();
  }
  function status(message, kind = '') {
    const node = $('#status');
    node.textContent = message;
    node.className = `member-status ${kind}`.trim();
  }
  function setHidden(selector, hidden) { $(selector).hidden = hidden; }
  function errorMessage(code) {
    const known = {sign_in_required: 'signInRequired', member_invitation_required: 'invitationRequired', invalid_contact_preference: 'invalidContact', contact_opt_in_required: 'invalidContact', invalid_place: 'invalidPlace', marker_validation_unavailable: 'requestFailed', preference_validation_unavailable: 'requestFailed', delete_confirmation_required: 'deletionFailed'};
    return t(known[code] || 'requestFailed');
  }
  async function api(path, options = {}) {
    const response = await fetch(path, {credentials: 'same-origin', ...options});
    let data;
    try { data = await response.json(); } catch { data = {error: 'invalid_response'}; }
    if (!response.ok) { const error = new Error(data.error || 'request_failed'); error.status = response.status; throw error; }
    return data;
  }
  function profilePayload(form) {
    const data = new FormData(form);
    const optionalId = name => {
      const raw = String(data.get(name) || '');
      return raw ? Number(raw) : null;
    };
    return {
      displayName: String(data.get('displayName') || '').trim(), avatar: String(data.get('avatar') || 'none'), preferredLanguage: String(data.get('preferredLanguage') || 'en'), preferredTranslation: optionalId('preferredTranslation'), preferredReciter: optionalId('preferredReciter'), city: String(data.get('city') || '').trim(), mosque: String(data.get('mosque') || '').trim(), contact: String(data.get('contact') || '').trim(), contactPreference: String(data.get('contactPreference') || 'none'), contactOptIn: data.get('contactOptIn') === 'on',
    };
  }
  function contactControls() {
    const none = $('#contact-preference').value === 'none';
    $('#contact').disabled = none;
    $('#contact-opt-in').disabled = none;
    if (none) { $('#contact').value = ''; $('#contact-opt-in').checked = false; }
  }
  function fillProfile(profile) {
    const form = $('#profile-form');
    for (const [key, value] of Object.entries(profile || {})) {
      const control = form.elements.namedItem(key);
      if (!control) continue;
      if (control.type === 'checkbox') control.checked = Boolean(value); else control.value = value ?? '';
    }
    contactControls();
  }
  function preferenceOptions(select, placeholder, items, label) {
    select.replaceChildren(new Option(placeholder, ''));
    for (const item of items) {
      if (!Number.isInteger(item?.id)) continue;
      select.appendChild(new Option(label(item), String(item.id)));
    }
  }
  async function loadPreferenceCatalogue(profile = state?.profile) {
    if (!preferenceCatalogueLoading) {
      preferenceCatalogueLoading = api('/api/quran/bootstrap').then(catalogue => {
        preferenceOptions($('#preferred-translation'), 'No translation preference', Array.isArray(catalogue.translations) ? catalogue.translations : [], item => `${item.name} · ${item.language}`);
        preferenceOptions($('#preferred-reciter'), 'No reciter preference', Array.isArray(catalogue.recitations) ? catalogue.recitations : [], item => item.style ? `${item.name} · ${item.style}` : item.name);
        return catalogue;
      }).catch(() => null);
    }
    const catalogue = await preferenceCatalogueLoading;
    if (!catalogue) return;
    const form = $('#profile-form');
    form.elements.preferredTranslation.value = profile?.preferredTranslation == null ? '' : String(profile.preferredTranslation);
    form.elements.preferredReciter.value = profile?.preferredReciter == null ? '' : String(profile.preferredReciter);
  }
  function renderProfileSummary(profile) {
    const pieces = [profile.displayName];
    if (profile.city) pieces.push(profile.city);
    if (profile.mosque) pieces.push(profile.mosque);
    $('#profile-summary').textContent = pieces.join(' · ');
  }
  function renderSaves() {
    const list = $('#saves-list');
    const empty = $('#saves-empty');
    if (!list || !state?.registered) return;
    list.replaceChildren();
    const saves = Array.isArray(state.saves) ? state.saves : [];
    empty.hidden = saves.length > 0;
    for (const item of saves) {
      const row = document.createElement('li'); row.className = 'saved-row';
      const detail = document.createElement('div');
      const kind = document.createElement('span'); kind.className = 'save-kind'; kind.textContent = t({external:'kindExternal',editorial:'kindEditorial',home:'kindHome'}[item.kind] || 'kindOther');
      const external = item.kind === 'external' ? externalItems.get(item.id) : null;
      const editorial = item.kind === 'editorial' ? publishedItems.get(item.id) : null;
      let url = null, title = item.id;
      if (external) { url = external.url; title = `${external.title} · ${external.publisher}`; }
      else if (editorial) { url = `/library?id=${encodeURIComponent(item.id)}`; title = editorial.content?.translations?.[language]?.title || editorial.content?.translations?.en?.title || item.id; }
      else if (item.kind === 'home') { title = `${t('legacyPending')} · ${item.id}`; }
      else title = `${item.id} · ${t(metadataReady[item.kind] ? 'itemUnavailable' : 'itemPending')}`;
      const label = document.createElement(url ? 'a' : 'span'); label.className = 'save-id'; label.textContent = title;
      if (url) { label.href = url; if (external) { label.target = '_blank'; label.rel = 'noopener noreferrer'; } }
      detail.append(kind, label);
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove-save'; remove.textContent = t('remove');
      remove.setAttribute('aria-label', `${t('remove')}: ${item.id}`);
      remove.addEventListener('click', async () => {
        remove.disabled = true;
        try {
          await api('/api/member/save', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'remove', kind: item.kind, id: item.id})});
          state.saves = state.saves.filter(saved => !(saved.kind === item.kind && saved.id === item.id));
          renderSaves(); status(t('removed'), 'success');
        } catch (error) { status(errorMessage(error.message), 'error'); remove.disabled = false; }
      });
      row.append(detail, remove); list.append(row);
    }
  }
  async function loadSaveMetadata() {
    if (saveMetadataLoading) return;
    saveMetadataLoading = true;
    const [resourceResult, editorialResult] = await Promise.allSettled([
      fetch('/data/starter-resources.json', {credentials:'same-origin'}).then(r => r.ok ? r.json() : null),
      fetch('/api/content', {credentials:'same-origin'}).then(r => r.ok ? r.json() : null),
    ]);
    if (resourceResult.status === 'fulfilled' && Array.isArray(resourceResult.value?.items)) {
      metadataReady.external = true;
      for (const item of resourceResult.value.items) if (item.verified === true && /^https:\/\//.test(item.url)) externalItems.set(item.id, item);
    }
    if (editorialResult.status === 'fulfilled' && Array.isArray(editorialResult.value?.items)) {
      metadataReady.editorial = true;
      for (const item of editorialResult.value.items) publishedItems.set(item.id, item);
    }
    renderSaves();
  }
  function legacyBookmarks() {
    try {
      const raw = JSON.parse(localStorage.getItem('dd-saved'));
      return Array.isArray(raw) ? [...new Set(raw.filter(value => typeof value === 'string' && HOME_IDS.has(value)))] : [];
    } catch { return []; }
  }
  function renderImportDetail() {
    const node = $('#import-detail');
    if (!node) return;
    const bookmarks = legacyBookmarks();
    node.textContent = bookmarks.length ? t('importReady', {count: bookmarks.length}) : t('importNone');
    $('#import-saves').disabled = bookmarks.length === 0;
  }
  function legacyPlace() {
    try {
      const place = JSON.parse(localStorage.getItem('dd-quran-place'));
      if (!place || !Number.isInteger(place.chapter) || place.chapter < 1 || place.chapter > 114 ||
          !Number.isInteger(place.page) || place.page < 1 || place.page > 15 ||
          typeof place.key !== 'string' || !/^\d{1,3}:\d{1,3}$/.test(place.key) ||
          Number(place.key.split(':')[0]) !== place.chapter || Number(place.key.split(':')[1]) < 1) return null;
      return {chapter: place.chapter, page: place.page, key: place.key};
    } catch { return null; }
  }
  function renderPlace() {
    const form = $('#place-form'), summary = $('#place-summary');
    if (!form || !state?.registered) return;
    const place = state.place;
    const local = legacyPlace(), importButton = $('#import-local-place');
    const same = local && place && local.chapter === place.chapter && local.page === place.page && local.key === place.key;
    importButton.hidden = !local;
    importButton.disabled = Boolean(same);
    $('#local-place-detail').textContent = local ? t(same ? 'localPlaceSynced' : 'localPlaceFound', {key: local.key}) : t('localPlaceNone');
    if (!place) { summary.textContent = ''; return; }
    form.elements.chapter.value = String(place.chapter);
    form.elements.page.value = String(place.page);
    form.elements.key.value = place.key;
    summary.textContent = t('placeSaved', {key: place.key});
  }
  function showRegistration(editing = false) {
    setHidden('#registration', false);
    setHidden('#not-registered', true);
    $('#profile-cancel').hidden = !editing;
    fillProfile(state?.profile || {preferredLanguage: language, avatar: 'none', contactPreference: 'none', contactOptIn: false});
    void loadPreferenceCatalogue(state?.profile);
    $('#profile-form').elements.displayName.focus();
  }
  function showMember(data) {
    state = data;
    setHidden('#signed-out', true);
    setHidden('#signed-in-actions', false);
    if (!state.registered) {
      setHidden('#not-registered', false); setHidden('#registration', true); setHidden('#member-content', true);
      status(t('profileReady'));
      return;
    }
    if (LANGUAGES.has(state.profile?.preferredLanguage)) setLanguage(state.profile.preferredLanguage); else setLanguage(language);
    setHidden('#not-registered', true); setHidden('#registration', true); setHidden('#member-content', false);
    setHidden('#delete-panel', state.accountRole !== 'reader');
    setHidden('#staff-deletion-note', state.accountRole === 'reader');
    renderProfileSummary(state.profile); renderSaves(); renderImportDetail(); renderPlace(); void loadPreferenceCatalogue(state.profile); status('');
    loadSaveMetadata();
  }
  function showSignedOut(message) {
    state = null; setHidden('#signed-out', false); setHidden('#not-registered', true); setHidden('#registration', true); setHidden('#member-content', true); setHidden('#signed-in-actions', true); status(message, 'error');
  }
  function installLogoutProof(session) {
    if (!Object.hasOwn(session, 'logoutCsrfToken')) return;
    if (!/^[A-Za-z0-9_-]{43}$/.test(session.logoutCsrfToken || '')) throw new Error('logout_proof_unavailable');
    for (const form of document.querySelectorAll('#signed-in-actions form')) {
      let input = form.querySelector('input[name="logout_csrf"]');
      if (!input) {
        input = document.createElement('input');
        input.type = 'hidden'; input.name = 'logout_csrf';
        form.append(input);
      }
      input.value = session.logoutCsrfToken;
    }
  }
  async function load() {
    status(t('loading'));
    try {
      const member = await api('/api/member/me');
      installLogoutProof(await api('/api/review/session'));
      showMember(member);
    }
    catch (error) { showSignedOut(error.status === 401 ? t('signInRequired') : errorMessage(error.message)); }
  }
  function handleProfileSubmit() {
    $('#profile-form').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget, button = $('#profile-submit'), payload = profilePayload(form);
      const original = button.textContent;
      button.disabled = true; button.textContent = t('saving');
      try {
        let completed;
        if (!state?.registered) {
          state = await api('/api/member/register', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
          completed = 'profileCreated';
        } else {
          const result = await api('/api/member/profile', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
          state.profile = result.profile; completed = 'profileSaved';
        }
        setLanguage(state.profile.preferredLanguage); showMember(state); status(t(completed), 'success');
      } catch (error) { status(errorMessage(error.message), 'error'); }
      finally { button.disabled = false; button.textContent = original; }
    });
  }
  function handleImport() {
    $('#import-saves').addEventListener('click', async () => {
      const button = $('#import-saves'), bookmarks = legacyBookmarks();
      if (!bookmarks.length) { renderImportDetail(); return; }
      button.disabled = true;
      try {
        const result = await api('/api/member/import', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({bookmarks})});
        const fresh = await api('/api/member/me'); state = fresh; renderSaves(); renderImportDetail();
        status(t('importDone', {count: result.imported, already: result.alreadySaved}), 'success');
      } catch (error) { status(errorMessage(error.message), 'error'); }
      finally { button.disabled = false; }
    });
  }
  function handlePlace() {
    $('#place-form').addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const payload = {chapter: Number(data.get('chapter')), page: Number(data.get('page')), key: String(data.get('key') || '').trim()};
      if (!Number.isInteger(payload.chapter) || payload.chapter < 1 || payload.chapter > 114 || !Number.isInteger(payload.page) || payload.page < 1 || payload.page > 15 || !new RegExp(`^${payload.chapter}:\\d{1,3}$`).test(payload.key)) { status(t('invalidPlace'), 'error'); return; }
      const button = event.currentTarget.querySelector('button[type="submit"]'); button.disabled = true;
      try { const result = await api('/api/member/place', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)}); state.place = result.place; renderPlace(); status(t('placeSaved', {key: result.place.key}), 'success'); }
      catch (error) { status(errorMessage(error.message), 'error'); }
      finally { button.disabled = false; }
    });
    $('#import-local-place').addEventListener('click', async () => {
      const marker = legacyPlace(), button = $('#import-local-place');
      if (!marker || !state?.registered) { renderPlace(); return; }
      button.disabled = true;
      try {
        const result = await api('/api/member/place', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(marker)});
        state.place = result.place;
        renderPlace(); status(t('localPlaceImported', {key: result.place.key}), 'success');
      } catch (error) { status(errorMessage(error.message), 'error'); button.disabled = false; }
    });
  }
  function handleDeletion() {
    $('#delete-form').addEventListener('submit', async event => {
      event.preventDefault();
      const button = event.currentTarget.querySelector('button[type="submit"]'); button.disabled = true;
      try {
        await api('/api/member/delete', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({confirm: String(new FormData(event.currentTarget).get('confirm') || '')})});
        setHidden('#member-content', true); setHidden('#registration', true); setHidden('#not-registered', true); setHidden('#signed-in-actions', false); setHidden('#signed-out', true); status(t('deleted'), 'success');
      } catch (error) { status(errorMessage(error.message), 'error'); button.disabled = false; }
    });
  }
  function attach() {
    $('#language').addEventListener('change', event => setLanguage(event.target.value));
    document.addEventListener('dd:languagechange', event => setLanguage(event.detail?.language));
    $('#show-registration').addEventListener('click', () => showRegistration(false));
    $('#edit-profile').addEventListener('click', () => showRegistration(true));
    $('#profile-cancel').addEventListener('click', () => { setHidden('#registration', true); setHidden('#member-content', false); });
    $('#contact-preference').addEventListener('change', contactControls);
    handleProfileSubmit(); handleImport(); handlePlace(); handleDeletion();
  }
  attach(); setLanguage(language); load();
})();
