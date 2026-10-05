(() => {
  'use strict';

  const languages = ['en', 'ta', 'si'];
  const copy = {
    en: {
      mosqueTitle: 'A public record, read with care.', mosqueLead: 'A dedicated profile for Jamia Kadheeja Jummah Mosque, limited to the details printed in the Department of Muslim Religious and Cultural Affairs district list.', officialRecord: 'Official directory record', sourceStatus: 'The following are directory facts, not claims about current operations, membership, service boundaries or endorsement.', serial: 'Directory serial', registration: 'Registration number', listedAddress: 'Listed address', city: 'Listed city', source: 'Official source', openPdf: 'Open the Anuradhapura District PDF, page 2', scopeTitle: 'What this page does—and does not—say', scopeOne: 'Serial 97 is a list position, not a ranking.', scopeTwo: 'The listing is not a current certificate or proof of every approval, activity or service.', scopeThree: 'Dragon Dawwa does not claim mosque, Department or Wakfs Board endorsement.', scopeFour: 'An address does not define mosque boundaries or identify members or worshippers.', directoryLink: 'Explore the preserved 108-entry government directory', suggestTitle: 'Suggest a correction', suggestLead: 'Point to the public record or source that should be checked. A suggestion is reviewed; it does not change the government dataset automatically.', subject: 'What should be checked?', correction: 'Suggested correction', supportingSource: 'Public source or record link (optional)', contactPreference: 'Contact preference', noContact: 'Do not contact me', email: 'Email', phone: 'Phone', contactDetail: 'Email address or phone number', consent: 'I understand this suggestion is stored for authorised review. I consent to be contacted only through my preference above.', submitCorrection: 'Store correction suggestion', correctionStored: 'Your correction suggestion was stored for review. It was not published or sent as a message.', correctionError: 'The suggestion could not be stored right now. Please try again later.', contactRequired: 'Provide the requested contact detail, or choose “Do not contact me”.', consentRequired: 'Please confirm consent before submitting.', required: 'Complete the required fields before submitting.',
      eventsTitle: 'Gatherings, when confirmed.', eventsLead: 'Published sessions appear here only when an administrator has supplied and published their actual details.', eventMethod: 'No future gathering, speaker, venue or recording is assumed by this page.', loadingEvents: 'Checking published events…', eventsEmpty: 'No confirmed gatherings have been posted yet.', eventsError: 'Published events are unavailable right now. No event is shown until its record can be retrieved.', eventLanguage: 'Language', eventTime: 'Time', eventPlace: 'Location', eventSpeaker: 'Speaker', eventOnline: 'Join online', eventResource: 'Authorized resource', eventsNote: 'Only published events belong here. Cancelled or draft sessions are not presented as invitations.',
      aboutTitle: 'Learning with evidence. Held with humility.', aboutLead: 'Dragon Dawwa is a source-aware learning space. We distinguish original texts, named translations, scholarly explanations and editorial reflections.', approachTitle: 'Our editorial method', approachOneTitle: 'Follow the source', approachOne: 'We link readers back to a source where possible and name the source type. A link does not turn a quotation into a ruling.', approachTwoTitle: 'Keep limits visible', approachTwo: 'We do not turn a directory entry, census total, translation or editorial approval into a claim of endorsement, authority or consensus.', approachThreeTitle: 'Welcome correction', approachThree: 'A correction can be suggested for review. A review is not a promise that a change will be adopted or that a message will be sent.', peopleTitle: 'What is not claimed', people: 'No named scholar, mosque committee, Department or Wakfs Board endorsement is claimed here. Editorial approval is not scholarly endorsement. Missing information remains missing rather than being filled by assumption.', exploreQuran: 'Read the Qur’an', exploreResearch: 'Explore research',
      participateTitle: 'Choose how you would like to take part.', participateLead: 'You may record an interest, volunteering offer or inquiry for authorised review. Sharing contact details is optional unless you ask to be contacted.', privacyTitle: 'A deliberate, limited request', privacyOne: 'Choose one purpose and one contact preference.', privacyTwo: 'No automatic group enrolment is created.', privacyThree: 'Submitting stores a record for review; it does not promise an outbound reply or message.', purpose: 'Purpose', interest: 'Interest in future learning', volunteer: 'Offer to volunteer', inquiry: 'General inquiry', message: 'Optional note', contactConsent: 'I consent to being contacted through my selected preference about this submission.', submitParticipation: 'Store my submission for review', participationStored: 'Your submission was stored for review. It does not enrol you in a group or promise an outbound message.', participationError: 'The submission could not be stored right now. Please try again later.', formHelp: 'Fields marked required are needed to store the request. Please avoid sensitive personal information.', skip: 'Skip to content', footer: 'Source-aware learning for a thoughtful multilingual community.', sending: 'Storing…'
    },
    ta: {
      mosqueTitle: 'பொதுப் பதிவை கவனமாக வாசிப்போம்.', mosqueLead: 'முஸ்லிம் சமய பண்பாட்டலுவல்கள் திணைக்களத்தின் மாவட்டப் பட்டியலில் அச்சிடப்பட்ட விவரங்களுக்கு மட்டுப்படுத்தப்பட்ட ஜாமிஆ கதீஜா ஜும்மா பள்ளிவாசலின் தனிப்பக்கம்.', officialRecord: 'அதிகாரப்பூர்வப் பட்டியல் பதிவு', sourceStatus: 'கீழுள்ளவை பட்டியல் விவரங்கள்; இவை தற்போதைய செயல்பாடு, உறுப்பினர், சேவை எல்லை அல்லது ஒப்புதலுக்கான கூற்றுகள் அல்ல.', serial: 'பட்டியல் தொடர் எண்', registration: 'பதிவு எண்', listedAddress: 'பட்டியலிலுள்ள முகவரி', city: 'பட்டியலிலுள்ள நகரம்', source: 'அதிகாரப்பூர்வ ஆதாரம்', openPdf: 'அனுராதபுர மாவட்ட PDF, பக்கம் 2 திறக்கவும்', scopeTitle: 'இந்தப் பக்கம் சொல்வதும் சொல்லாததும்', scopeOne: '97 என்பது பட்டியல் இடம்; தரவரிசை அல்ல.', scopeTwo: 'இந்தப் பதிவு தற்போதைய சான்றிதழ் அல்லது ஒவ்வொரு ஒப்புதல், செயல்பாடு, சேவைக்கான ஆதாரம் அல்ல.', scopeThree: 'Dragon Dawwa பள்ளிவாசல், திணைக்களம் அல்லது வக்பு சபையின் ஒப்புதலைக் கோரவில்லை.', scopeFour: 'முகவரி பள்ளிவாசல் எல்லைகளை வரையறுக்கவோ உறுப்பினர்கள் அல்லது தொழுகையாளர்களை அடையாளப்படுத்தவோ இல்லை.', directoryLink: 'பாதுகாக்கப்பட்ட 108 பதிவுகளுள்ள அரசுப் பட்டியலைப் பார்க்கவும்', suggestTitle: 'திருத்தத்தைப் பரிந்துரைக்கவும்', suggestLead: 'சரிபார்க்க வேண்டிய பொதுப் பதிவு அல்லது ஆதாரத்தைச் சுட்டுங்கள். பரிந்துரை பரிசீலிக்கப்படும்; அது அரசு தரவை தானாக மாற்றாது.', subject: 'எதைச் சரிபார்க்க வேண்டும்?', correction: 'பரிந்துரைக்கப்பட்ட திருத்தம்', supportingSource: 'பொது ஆதாரம் அல்லது பதிவு இணைப்பு (விருப்பம்)', contactPreference: 'தொடர்பு விருப்பம்', noContact: 'என்னைத் தொடர்புகொள்ள வேண்டாம்', email: 'மின்னஞ்சல்', phone: 'தொலைபேசி', contactDetail: 'மின்னஞ்சல் முகவரி அல்லது தொலைபேசி எண்', consent: 'இந்தப் பரிந்துரை அங்கீகரிக்கப்பட்ட பரிசீலனைக்காகச் சேமிக்கப்படும் என்பதை நான் புரிந்துகொள்கிறேன். மேலே தேர்ந்தெடுத்த முறையில் மட்டுமே தொடர்பு கொள்ள ஒப்புக்கொள்கிறேன்.', submitCorrection: 'திருத்தப் பரிந்துரையைச் சேமிக்கவும்', correctionStored: 'உங்கள் திருத்தப் பரிந்துரை பரிசீலனைக்காகச் சேமிக்கப்பட்டது. அது வெளியிடப்படவோ செய்தியாக அனுப்பப்படவோ இல்லை.', correctionError: 'இப்போது பரிந்துரையைச் சேமிக்க முடியவில்லை. பின்னர் முயற்சிக்கவும்.', contactRequired: 'தொடர்பு விவரத்தை வழங்குங்கள் அல்லது “என்னைத் தொடர்புகொள்ள வேண்டாம்” என்பதைத் தேர்ந்தெடுக்கவும்.', consentRequired: 'சமர்ப்பிப்பதற்கு முன் ஒப்புதலை உறுதிசெய்யவும்.', required: 'தேவையான புலங்களை நிரப்பவும்.',
      eventsTitle: 'உறுதிப்படுத்தப்பட்டால் மட்டுமே சந்திப்புகள்.', eventsLead: 'நிர்வாகி உண்மையான விவரங்களை வழங்கி வெளியிட்ட பின்னரே அமர்வுகள் இங்கே தோன்றும்.', eventMethod: 'இந்தப் பக்கம் எதிர்காலச் சந்திப்பு, பேச்சாளர், இடம் அல்லது பதிவை முன்கூட்டியே கருதுவதில்லை.', loadingEvents: 'வெளியிடப்பட்ட நிகழ்வுகள் சரிபார்க்கப்படுகின்றன…', eventsEmpty: 'உறுதிப்படுத்தப்பட்ட சந்திப்புகள் எதுவும் இன்னும் வெளியிடப்படவில்லை.', eventsError: 'வெளியிடப்பட்ட நிகழ்வுகள் இப்போது கிடைக்கவில்லை. பதிவைப் பெறும் வரை எந்த நிகழ்வும் காட்டப்படாது.', eventLanguage: 'மொழி', eventTime: 'நேரம்', eventPlace: 'இடம்', eventSpeaker: 'பேச்சாளர்', eventOnline: 'இணையத்தில் பங்கேற்கவும்', eventResource: 'அங்கீகரிக்கப்பட்ட ஆதாரம்', eventsNote: 'வெளியிடப்பட்ட நிகழ்வுகள் மட்டுமே இங்கே இடம்பெறும். ரத்து செய்யப்பட்ட அல்லது வரைவு அமர்வுகள் அழைப்புகளாகக் காட்டப்படாது.',
      aboutTitle: 'ஆதாரத்துடன் கற்றல். பணிவுடன் அணுகுதல்.', aboutLead: 'Dragon Dawwa ஆதார விழிப்புணர்வுள்ள கற்றல் இடமாகும். மூல வாசகம், பெயரிட்ட மொழிபெயர்ப்பு, அறிஞர் விளக்கம், ஆசிரியர் சிந்தனை ஆகியவற்றை வேறுபடுத்துகிறோம்.', approachTitle: 'எங்கள் ஆசிரியர் முறை', approachOneTitle: 'ஆதாரத்தைப் பின்தொடருங்கள்', approachOne: 'முடிந்த இடங்களில் வாசகரை மூல ஆதாரத்துக்கு இணைக்கிறோம்; ஆதார வகையையும் பெயரிடுகிறோம். இணைப்பு மட்டும் மேற்கோளை மார்க்கத் தீர்ப்பாக மாற்றாது.', approachTwoTitle: 'வரம்புகளைத் தெளிவாகக் காட்டுங்கள்', approachTwo: 'பட்டியல் பதிவு, மக்கள்தொகைக் கணக்கு, மொழிபெயர்ப்பு அல்லது ஆசிரியர் ஒப்புதலை ஆதரவு, அதிகாரம் அல்லது ஒருமித்த கருத்தாக மாற்றுவதில்லை.', approachThreeTitle: 'திருத்தத்திற்கு இடமளிப்போம்', approachThree: 'பரிசீலனைக்காகத் திருத்தம் பரிந்துரைக்கலாம். பரிசீலனை என்றால் மாற்றம் ஏற்கப்படும் அல்லது செய்தி அனுப்பப்படும் என்ற வாக்குறுதி அல்ல.', peopleTitle: 'கோரப்படாதவை', people: 'இங்கே பெயரிட்ட அறிஞர், பள்ளிவாசல் குழு, திணைக்களம் அல்லது வக்பு சபை ஒப்புதல் கோரப்படவில்லை. ஆசிரியர் ஒப்புதல் அறிஞர் ஒப்புதல் அல்ல. விடுபட்ட தகவலை ஊகத்தால் நிரப்புவதில்லை.', exploreQuran: 'குர்ஆனை வாசிக்கவும்', exploreResearch: 'ஆய்வைப் பார்க்கவும்',
      participateTitle: 'நீங்கள் பங்கேற்க விரும்பும் முறையைத் தேர்ந்தெடுக்கவும்.', participateLead: 'ஆர்வம், தன்னார்வ உதவி அல்லது கேள்வியை அங்கீகரிக்கப்பட்ட பரிசீலனைக்காகப் பதிவு செய்யலாம். தொடர்பு கொள்ளுமாறு கேட்டால் மட்டுமே தொடர்பு விவரம் தேவை.', privacyTitle: 'கவனமான, வரையறுக்கப்பட்ட கோரிக்கை', privacyOne: 'ஒரு நோக்கத்தையும் ஒரு தொடர்பு விருப்பத்தையும் தேர்ந்தெடுக்கவும்.', privacyTwo: 'தானியங்கி குழுச் சேர்க்கை எதுவும் உருவாக்கப்படாது.', privacyThree: 'சமர்ப்பிப்பு பரிசீலனைக்காகப் பதிவைச் சேமிக்கிறது; வெளிச் செய்தி அல்லது பதிலுக்கு உத்தரவாதம் தராது.', purpose: 'நோக்கம்', interest: 'எதிர்காலக் கற்றலில் ஆர்வம்', volunteer: 'தன்னார்வ உதவி வழங்குதல்', inquiry: 'பொதுவான கேள்வி', message: 'விருப்பக் குறிப்பு', contactConsent: 'இந்தச் சமர்ப்பிப்பு தொடர்பாகத் தேர்ந்தெடுத்த முறையில் தொடர்பு கொள்ள நான் ஒப்புக்கொள்கிறேன்.', submitParticipation: 'என் சமர்ப்பிப்பை பரிசீலனைக்காகச் சேமிக்கவும்', participationStored: 'உங்கள் சமர்ப்பிப்பு பரிசீலனைக்காகச் சேமிக்கப்பட்டது. இது குழுவில் சேர்க்கவோ வெளிச் செய்திக்கு உத்தரவாதம் அளிக்கவோ இல்லை.', participationError: 'இப்போது சமர்ப்பிப்பைச் சேமிக்க முடியவில்லை. பின்னர் முயற்சிக்கவும்.', formHelp: 'தேவையான புலங்கள் கோரிக்கையைச் சேமிக்கத் தேவை. முக்கியமான தனிப்பட்ட தகவல்களைத் தவிர்க்கவும்.', skip: 'உள்ளடக்கத்திற்குச் செல்லவும்', footer: 'சிந்தனையுள்ள பன்மொழிச் சமூகத்திற்கான ஆதார விழிப்புணர்வுள்ள கற்றல்.', sending: 'சேமிக்கப்படுகிறது…'
    },
    si: {
      mosqueTitle: 'පොදු වාර්තාවක්, සැලකිල්ලෙන් කියවමු.', mosqueLead: 'මුස්ලිම් ආගමික හා සංස්කෘතික කටයුතු දෙපාර්තමේන්තුවේ දිස්ත්‍රික් ලැයිස්තුවේ මුද්‍රිත විස්තරවලට සීමා වූ ජාමියා කදීජා ජුම්මා පල්ලියේ විශේෂ පිටුවකි.', officialRecord: 'නිල නාමාවලි වාර්තාව', sourceStatus: 'පහත ඇත්තේ නාමාවලි කරුණු පමණි; ඒවා වත්මන් කටයුතු, සාමාජිකත්වය, සේවා සීමා හෝ අනුමැතිය පිළිබඳ ප්‍රකාශ නොවේ.', serial: 'නාමාවලි අනුක්‍රමික අංකය', registration: 'ලියාපදිංචි අංකය', listedAddress: 'ලැයිස්තුගත ලිපිනය', city: 'ලැයිස්තුගත නගරය', source: 'නිල මූලාශ්‍රය', openPdf: 'අනුරාධපුර දිස්ත්‍රික් PDF, 2 වන පිටුව විවෘත කරන්න', scopeTitle: 'මෙම පිටුව කියන සහ නොකියන දේ', scopeOne: '97 යනු ලැයිස්තු අංකයකි; ශ්‍රේණිගත කිරීමක් නොවේ.', scopeTwo: 'මෙම ලැයිස්තුගත කිරීම වත්මන් සහතිකයක් හෝ සෑම අනුමැතියක්, ක්‍රියාකාරකමක් හෝ සේවාවක් සඳහා සාක්ෂියක් නොවේ.', scopeThree: 'Dragon Dawwa පල්ලියේ, දෙපාර්තමේන්තුවේ හෝ වක්ෆ් මණ්ඩලයේ අනුමැතියක් ප්‍රකාශ නොකරයි.', scopeFour: 'ලිපිනයක් පල්ලියේ සීමා නිර්වචනය නොකරන අතර සාමාජිකයන් හෝ බැතිමතුන් හඳුනා නොදෙයි.', directoryLink: 'සුරැකි රජයේ ප්‍රවේශ 108 නාමාවලිය බලන්න', suggestTitle: 'නිවැරදි කිරීමක් යෝජනා කරන්න', suggestLead: 'පරීක්ෂා කළ යුතු පොදු වාර්තාව හෝ මූලාශ්‍රය පෙන්වන්න. යෝජනාවක් සමාලෝචනය කෙරේ; එය රජයේ දත්ත ස්වයංක්‍රීයව වෙනස් නොකරයි.', subject: 'පරීක්ෂා කළ යුත්තේ කුමක්ද?', correction: 'යෝජිත නිවැරදි කිරීම', supportingSource: 'පොදු මූලාශ්‍රය හෝ වාර්තා සබැඳිය (විකල්ප)', contactPreference: 'සම්බන්ධතා කැමැත්ත', noContact: 'මා සම්බන්ධ කරගන්න එපා', email: 'විද්‍යුත් තැපෑල', phone: 'දුරකථනය', contactDetail: 'විද්‍යුත් තැපැල් ලිපිනය හෝ දුරකථන අංකය', consent: 'මෙම යෝජනාව බලයලත් සමාලෝචනය සඳහා ගබඩා කරන බව මම තේරුම් ගනිමි. ඉහත තෝරාගත් ක්‍රමයෙන් පමණක් මා සම්බන්ධ කරගැනීමට එකඟ වෙමි.', submitCorrection: 'නිවැරදි කිරීමේ යෝජනාව ගබඩා කරන්න', correctionStored: 'ඔබේ නිවැරදි කිරීමේ යෝජනාව සමාලෝචනය සඳහා ගබඩා කරන ලදී. එය ප්‍රකාශයට පත් කර හෝ පණිවිඩයක් ලෙස යවා නැත.', correctionError: 'දැන් යෝජනාව ගබඩා කළ නොහැක. පසුව උත්සාහ කරන්න.', contactRequired: 'ඉල්ලූ සම්බන්ධතා විස්තරය ලබා දෙන්න, නැතහොත් “මා සම්බන්ධ කරගන්න එපා” තෝරන්න.', consentRequired: 'යැවීමට පෙර කැමැත්ත තහවුරු කරන්න.', required: 'අවශ්‍ය ක්ෂේත්‍ර සම්පූර්ණ කරන්න.',
      eventsTitle: 'තහවුරු වූ විට හමුවීම්.', eventsLead: 'පරිපාලකයෙකු සත්‍ය විස්තර ලබා දී ප්‍රකාශයට පත් කළ පසු පමණක් සැසි මෙහි දිස් වේ.', eventMethod: 'මෙම පිටුව අනාගත හමුවක්, කථිකයෙකු, ස්ථානයක් හෝ පටිගත කිරීමක් උපකල්පනය නොකරයි.', loadingEvents: 'ප්‍රකාශිත සිදුවීම් පරීක්ෂා කරමින්…', eventsEmpty: 'තහවුරු කළ හමුවීම් කිසිවක් තවමත් පළ කර නැත.', eventsError: 'ප්‍රකාශිත සිදුවීම් දැනට ලබාගත නොහැක. එහි වාර්තාව ලබාගන්නා තෙක් සිදුවීමක් පෙන්වන්නේ නැත.', eventLanguage: 'භාෂාව', eventTime: 'වේලාව', eventPlace: 'ස්ථානය', eventSpeaker: 'කථිකයා', eventOnline: 'මාර්ගගතව එක්වන්න', eventResource: 'අවසර ලත් සම්පත', eventsNote: 'ප්‍රකාශිත සිදුවීම් පමණක් මෙහි අයත් වේ. අවලංගු කළ හෝ කෙටුම්පත් සැසි ආරාධනා ලෙස ඉදිරිපත් නොකෙරේ.',
      aboutTitle: 'සාක්ෂි සමඟ ඉගෙනීම. නිහතමානීව රඳවා ගැනීම.', aboutLead: 'Dragon Dawwa යනු මූලාශ්‍ර ගැන සැලකිලිමත් ඉගෙනුම් අවකාශයකි. අපි මුල් පාඨ, නම් කළ පරිවර්තන, විද්වත් පැහැදිලි කිරීම් සහ සංස්කාරක සිතුවිලි වෙන්කර දක්වමු.', approachTitle: 'අපගේ සංස්කාරක ක්‍රමය', approachOneTitle: 'මූලාශ්‍රය අනුගමනය කරන්න', approachOne: 'හැකි තැන්වලදී කියවන්නා මුල් මූලාශ්‍රය වෙත සම්බන්ධ කර මූලාශ්‍ර වර්ගය නම් කරමු. සබැඳියක් පමණක් උපුටනයක් ආගමික තීන්දුවක් බවට පත් නොකරයි.', approachTwoTitle: 'සීමාවන් පැහැදිලිව තබන්න', approachTwo: 'නාමාවලි ප්‍රවේශයක්, ජන සංගණන අගයක්, පරිවර්තනයක් හෝ සංස්කාරක අනුමැතියක් අනුමැතිය, අධිකාරිය හෝ එකඟතාවයක් බවට හරවන්නේ නැත.', approachThreeTitle: 'නිවැරදි කිරීමට ඉඩ දෙන්න', approachThree: 'සමාලෝචනය සඳහා නිවැරදි කිරීමක් යෝජනා කළ හැක. සමාලෝචනයක් වෙනසක් පිළිගන්නා හෝ පණිවිඩයක් යවන බවට පොරොන්දුවක් නොවේ.', peopleTitle: 'මෙහි ප්‍රකාශ නොකරන දේ', people: 'මෙහි නම් කළ විද්වතෙකුගේ, පල්ලි කමිටුවක, දෙපාර්තමේන්තුවේ හෝ වක්ෆ් මණ්ඩලයේ අනුමැතියක් ප්‍රකාශ නොකරයි. සංස්කාරක අනුමැතිය විද්වත් අනුමැතියක් නොවේ. නැති තොරතුරු උපකල්පනයෙන් පුරවන්නේ නැත.', exploreQuran: 'අල් කුර්ආනය කියවන්න', exploreResearch: 'පර්යේෂණය බලන්න',
      participateTitle: 'ඔබට සහභාගී වීමට කැමති ආකාරය තෝරන්න.', participateLead: 'උනන්දුවක්, ස්වේච්ඡා උදව්වක් හෝ විමසුමක් බලයලත් සමාලෝචනය සඳහා සටහන් කළ හැක. ඔබ සම්බන්ධ කරගන්නැයි ඉල්ලුවහොත් පමණක් සම්බන්ධතා විස්තර අවශ්‍ය වේ.', privacyTitle: 'හිතාමතා, සීමිත ඉල්ලීමක්', privacyOne: 'එක් අරමුණක් සහ එක් සම්බන්ධතා කැමැත්තක් තෝරන්න.', privacyTwo: 'ස්වයංක්‍රීය කණ්ඩායම් ඇතුළත් කිරීමක් නිර්මාණය නොවේ.', privacyThree: 'යැවීමෙන් සමාලෝචනය සඳහා වාර්තාවක් ගබඩා වේ; පිටත පණිවිඩයක් හෝ පිළිතුරක් පොරොන්දු නොවේ.', purpose: 'අරමුණ', interest: 'අනාගත ඉගෙනීමට උනන්දුව', volunteer: 'ස්වේච්ඡාවෙන් උදව් කිරීමට ඉදිරිපත් වීම', inquiry: 'සාමාන්‍ය විමසුම', message: 'විකල්ප සටහන', contactConsent: 'මෙම යැවීම පිළිබඳව මා තෝරාගත් ක්‍රමයෙන් සම්බන්ධ කරගැනීමට මම එකඟ වෙමි.', submitParticipation: 'මගේ යැවීම සමාලෝචනය සඳහා ගබඩා කරන්න', participationStored: 'ඔබේ යැවීම සමාලෝචනය සඳහා ගබඩා කරන ලදී. මෙය ඔබ කණ්ඩායමකට ඇතුළත් නොකරන අතර පිටත පණිවිඩයක් පොරොන්දු නොවේ.', participationError: 'දැන් යැවීම ගබඩා කළ නොහැක. පසුව උත්සාහ කරන්න.', formHelp: 'අවශ්‍ය ක්ෂේත්‍ර ඉල්ලීම ගබඩා කිරීමට අවශ්‍යය. සංවේදී පුද්ගලික තොරතුරු වළක්වන්න.', skip: 'අන්තර්ගතයට යන්න', footer: 'සිතනසුලු බහුභාෂා ප්‍රජාවක් සඳහා මූලාශ්‍ර දැනුවත් ඉගෙනීම.', sending: 'ගබඩා කරමින්…'
    }
  };

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  let language = readLanguage();
  const eventDetailMatch = window.location.pathname.match(/^\/events\/([A-Za-z0-9-]{1,64})$/);
  const selectedEventId = eventDetailMatch ? eventDetailMatch[1] : null;
  const eventDetailCopy = {
    en: {missing:'This event is not published or is no longer available.',back:'Back to all confirmed events ↗'},
    ta: {missing:'இந்த நிகழ்வு வெளியிடப்படவில்லை அல்லது இனி கிடைக்காது.',back:'உறுதிப்படுத்தப்பட்ட நிகழ்வுகள் அனைத்துக்கும் திரும்பு ↗'},
    si: {missing:'මෙම සිදුවීම ප්‍රකාශිත නැත හෝ තවදුරටත් ලබා ගත නොහැක.',back:'තහවුරු කළ සියලු සිදුවීම් වෙත ආපසු ↗'}
  };
  const storageAcknowledgement = {
    en: 'I understand this record is stored for authorised review. I do not request contact.',
    ta: 'இந்தப் பதிவு அங்கீகரிக்கப்பட்ட பரிசீலனைக்காகச் சேமிக்கப்படும் என்பதைப் புரிந்துகொள்கிறேன். என்னைத் தொடர்புகொள்ள வேண்டாம்.',
    si: 'මෙම වාර්තාව බලයලත් සමාලෝචනය සඳහා ගබඩා කරන බව මම තේරුම් ගනිමි. මා සම්බන්ධ කරගැනීමට ඉල්ලා නොසිටිමි.'
  };

  function readLanguage() {
    try {
      const stored = JSON.parse(localStorage.getItem('dd-language'));
      return languages.includes(stored) ? stored : 'en';
    } catch {
      return 'en';
    }
  }

  function text(key) {
    return copy[language]?.[key] ?? copy.en[key] ?? '';
  }

  function renderCopy() {
    document.documentElement.lang = language;
    $$('[data-page]').forEach(element => {
      const value = text(element.dataset.page);
      if (value) element.textContent = value;
    });
    $$('[data-page-placeholder]').forEach(element => element.setAttribute('placeholder', text(element.dataset.pagePlaceholder)));
    $$('[data-page-aria]').forEach(element => element.setAttribute('aria-label', text(element.dataset.pageAria)));
    const pageTitle = document.body.dataset.pageTitle;
    if (pageTitle && text(pageTitle)) document.title = `${text(pageTitle)} · Dragon Dawwa`;
    $$('.community-form').forEach(form => updateConsentLabel(form));
  }

  function updateConsentLabel(form) {
    const label = form.querySelector('[data-page="consent"], [data-page="contactConsent"]');
    if (label && form.elements.contactPreference?.value === 'none') label.textContent = storageAcknowledgement[language] || storageAcknowledgement.en;
    else if (label) label.textContent = text(label.dataset.page);
  }

  function showStatus(element, message, mode = '') {
    if (!element) return;
    element.hidden = !message;
    element.textContent = message;
    element.className = `form-status${mode ? ` ${mode}` : ''}`;
  }

  function requestedContact(form) {
    const preference = form.elements.contactPreference?.value;
    const detail = form.elements.contact?.value.trim();
    return preference && preference !== 'none' && !detail;
  }

  async function postForm(form, endpoint, kind) {
    const status = form.querySelector('[role="status"]');
    const button = form.querySelector('button[type="submit"]');
    if (!form.checkValidity()) { form.reportValidity(); showStatus(status, text('required'), 'error'); return; }
    if (requestedContact(form)) { showStatus(status, text('contactRequired'), 'error'); return; }
    if (!form.elements.consentRequired?.checked) { showStatus(status, text('consentRequired'), 'error'); return; }
    const payload = Object.fromEntries(new FormData(form).entries());
    // The mandatory checkbox acknowledges storage. Contact consent is recorded only
    // when a visitor actually requests follow-up; otherwise the server forbids it.
    payload.contactConsent = payload.contactPreference !== 'none' && form.elements.consentRequired.checked;
    delete payload.consentRequired;
    if (kind === 'correction') {
      const source = payload.source?.trim();
      if (source && (!URL.canParse(source) || new URL(source).protocol !== 'https:')) {
        showStatus(status, text('correctionError'), 'error');
        return;
      }
      payload.purpose = 'directory_correction';
      payload.details = `${payload.subject?.trim() || ''}\n${payload.correction?.trim() || ''}${source ? `\nSource: ${source}` : ''}`.trim();
      delete payload.subject;
      delete payload.correction;
      delete payload.source;
    }
    button.disabled = true;
    const original = button.textContent;
    button.textContent = text('sending');
    showStatus(status, '');
    try {
      const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error('request_failed');
      form.reset();
      updateConsentLabel(form);
      showStatus(status, text(kind === 'correction' ? 'correctionStored' : 'participationStored'), 'success');
    } catch {
      showStatus(status, text(kind === 'correction' ? 'correctionError' : 'participationError'), 'error');
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  function safeUrl(value) {
    try {
      const url = new URL(value, window.location.origin);
      return url.protocol === 'https:' ? url.href : null;
    } catch {
      return null;
    }
  }

  function eventValue(event, names) {
    for (const name of names) if (event[name] !== undefined && event[name] !== null && event[name] !== '') return String(event[name]);
    return '';
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(language === 'ta' ? 'ta-LK' : language === 'si' ? 'si-LK' : 'en-LK', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  function renderEvents(items) {
    const host = $('#events-list');
    const status = $('#events-status');
    if (!host) return;
    host.setAttribute('aria-busy', 'false');
    const published = items.filter(item => (!item.status || item.status === 'published') && (!selectedEventId || String(item.id) === selectedEventId));
    host.replaceChildren();
    if (!published.length) { showStatus(status, selectedEventId ? eventDetailCopy[language].missing : text('eventsEmpty')); return; }
    showStatus(status, '');
    if (selectedEventId) {
      const back = document.createElement('a'); back.href = '/events'; back.className = 'text-button event-back';
      back.textContent = eventDetailCopy[language].back; host.append(back);
      document.title = `${eventValue(published[0], ['title'])} · Dragon Dawwa`;
    }
    published.forEach(item => {
      const article = document.createElement('article');
      article.className = 'event-card';
      const title = document.createElement('h2');
      if (!selectedEventId && /^[A-Za-z0-9-]{1,64}$/.test(String(item.id || ''))) {
        const detail = document.createElement('a'); detail.href = `/events/${encodeURIComponent(item.id)}`;
        detail.textContent = eventValue(item, ['title']) || '—'; title.append(detail);
      } else title.textContent = eventValue(item, ['title']) || '—';
      article.appendChild(title);
      const description = eventValue(item, ['description']);
      if (description) { const p = document.createElement('p'); p.textContent = description; article.appendChild(p); }
      const details = document.createElement('dl');
      const add = (label, value) => { if (!value) return; const row = document.createElement('div'); const dt = document.createElement('dt'); const dd = document.createElement('dd'); dt.textContent = label; dd.textContent = value; row.append(dt, dd); details.appendChild(row); };
      const startsAt = eventValue(item, ['startsAt', 'startAt', 'dateTime']);
      add(text('eventTime'), startsAt ? `${formatDate(startsAt)}${eventValue(item, ['timezone']) ? ` · ${eventValue(item, ['timezone'])}` : ''}` : '');
      add(text('eventLanguage'), eventValue(item, ['language']));
      add(text('eventPlace'), eventValue(item, ['location']));
      add(text('eventSpeaker'), eventValue(item, ['speaker']));
      if (details.childNodes.length) article.appendChild(details);
      const links = document.createElement('div'); links.className = 'event-links';
      const addLink = (label, value) => { const href = safeUrl(value); if (!href) return; const a = document.createElement('a'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = `${label} ↗`; links.appendChild(a); };
      addLink(text('eventOnline'), eventValue(item, ['onlineUrl', 'onlineLink']));
      addLink(text('eventResource'), eventValue(item, ['recordingUrl', 'resourceUrl']));
      if (links.childNodes.length) article.appendChild(links);
      host.appendChild(article);
    });
  }

  async function loadEvents() {
    const host = $('#events-list');
    const status = $('#events-status');
    if (!host || !status) return;
    showStatus(status, text('loadingEvents'));
    host.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch('/api/events', { credentials: 'same-origin', headers: { 'Accept': 'application/json' } });
      if (!response.ok) throw new Error('events_unavailable');
      const body = await response.json();
      const events = Array.isArray(body) ? body : Array.isArray(body.items) ? body.items : Array.isArray(body.events) ? body.events : [];
      renderEvents(events);
    } catch {
      host.replaceChildren();
      host.setAttribute('aria-busy', 'false');
      showStatus(status, text('eventsError'), 'error');
    }
  }

  document.addEventListener('dd:languagechange', event => {
    language = languages.includes(event.detail?.language) ? event.detail.language : readLanguage();
    renderCopy();
    if ($('#events-list')) loadEvents();
  });

  renderCopy();
  $('#participation-form')?.addEventListener('submit', event => { event.preventDefault(); postForm(event.currentTarget, '/api/participation', 'participation'); });
  $('#correction-form')?.addEventListener('submit', event => { event.preventDefault(); postForm(event.currentTarget, '/api/corrections', 'correction'); });
  $$('.community-form').forEach(form => form.elements.contactPreference?.addEventListener('change', () => updateConsentLabel(form)));
  if ($('#events-list')) loadEvents();
})();
