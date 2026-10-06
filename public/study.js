(() => {
  'use strict';

  const languages = ['en', 'ta', 'si'];
  const MAX_RECORDING_MS = 30000;
  const MAX_RECORDING_BYTES = 2 * 1024 * 1024;
  const copy = {
    en: { skip:'Skip to content', eyebrow:'SOURCES BEFORE SUMMARY', title:'Study an ayah with care.', lead:'Ask a focused question or bring an ayah from the reader. Any generated explanation is kept distinct from the displayed sources.', principle:'A source reference can be checked. A generated explanation is not a published translation or a religious ruling.', askEyebrow:'YOUR QUESTION', askTitle:'Begin with what you want to understand.', askHelp:'Add a question, an ayah reference, or both. A source-backed answer is requested only when you choose Ask.', providerNote:'When available, the server sends only your selected verse or text question to Quran.ai, without your account ID. After you choose Ask, the question and retrieved evidence can be sent to Google for explanation or narration. Provider privacy tier is not verified; do not enter personal or sensitive information.', reportIssue:'Report a possible source or answer issue for restricted review ↗', verseLabel:'Ayah or short range (optional)', verseHelp:'Use surah:ayah, for example 2:255. The server verifies scope and availability.', questionLabel:'Question (optional when an ayah is entered)', questionPlaceholder:'What would you like to understand?', questionHelp:'Do not include account, contact, or other sensitive information in a study question.', languageLabel:'Response language', saveHistory:'Save this response in my private study history, if my account supports it.', askButton:'Ask with sources', cancel:'Stop waiting', voiceEyebrow:'OPTIONAL VOICE INPUT', voiceTitle:'Speak your question', voiceHelp:'Your browser asks for microphone permission only after you choose to record. If transcription is unavailable, type your question instead.', voiceStart:'Record a question', voiceStop:'Stop recording', voiceUnsupported:'Microphone recording is not available in this browser. You can type a question.', guidanceEyebrow:'HOW TO READ A RESPONSE', guidanceTitle:'Keep the layers visible.', layerOneTitle:'Source quotations', layerOne:'are shown separately with IDs, edition names and links when the source service provides them.', layerTwoTitle:'Generated explanation', layerTwo:'is labelled as such. It can help orient study, but it is not a substitute for a named translation, tafsir, or qualified guidance.', layerThreeTitle:'Unavailable evidence', layerThree:'is shown as unavailable. This page does not invent quotations or citations.', resultEyebrow:'STUDY RESPONSE', resultTitle:'Read the explanation alongside its sources.', sourcesTitle:'Source references', sourcesHelp:'Citation IDs below identify the source material supplied for this response.', listenEyebrow:'LISTEN', listenTitle:'Narrate this displayed response', listenHelp:'Narration is requested for this exact response only. It does not start automatically and it pauses another audio item on this page.', listenButton:'Prepare audio', cancelNarration:'Cancel narration request', play:'Play', pause:'Pause', replay:'Replay', speed:'Speed', seekHelp:'Use the native audio timeline to seek when available.', footer:'Source-aware learning for a thoughtful multilingual community.', promptRequired:'Add a question, an ayah reference, or both before asking.', verseInvalid:'Use an ayah reference such as 2:255 or a short range such as 2:255-257.', requesting:'Requesting source-backed study…', requestCancelled:'Stopped waiting in this browser. Server-side generation may continue and count toward the daily limit.', unavailable:'Study is unavailable right now. No answer or citation was displayed. Please try again later.', invalidResponse:'The study service returned an incomplete response, so it was not displayed.', responseReady:'Study response ready. Read the source references below.', selectedVerse:'Ayah {verse} was added from the reader.', noSources:'No source references were supplied, so this response is not displayed.', preparingAudio:'Preparing narration for this exact response…', audioReady:'Audio is ready. Choose Play when you are ready to listen.', narrationWaiting:'Narration is still preparing. Choose Prepare audio again shortly.', narrationCancelled:'Narration request cancelled in this browser. A server-side job may continue if it had already started.', narrationUnavailable:'Audio could not be prepared right now.', audioError:'Audio could not play. Try preparing it again.', recording:'Recording… up to 30 seconds.', recordingStopped:'Recording stopped. Requesting transcription…', recordingTooLarge:'The recording was not sent because it exceeded 2 MB. Type your question instead.', transcriptionReady:'Transcription added to the question field. Review it before asking.', transcriptionUnavailable:'The recording could not be transcribed. Type your question instead.', microphoneDenied:'Microphone permission was not granted. Type your question instead.', recordingCancelled:'Recording cancelled. No audio was sent.' },
    ta: { skip:'உள்ளடக்கத்திற்குச் செல்ல', eyebrow:'சுருக்கத்திற்கு முன் மூலங்கள்', title:'ஒரு ஆயத்தை கவனத்துடன் படியுங்கள்.', lead:'ஒரு குறிப்பிட்ட கேள்வியைக் கேளுங்கள் அல்லது வாசிப்புப் பகுதியிலிருந்து ஒரு ஆயத்தைக் கொண்டு வாருங்கள். உருவாக்கப்பட்ட விளக்கம் காட்டப்படும் மூலங்களிலிருந்து தனியாக வைக்கப்படுகிறது.', principle:'மூலக் குறிப்பைச் சரிபார்க்கலாம். உருவாக்கப்பட்ட விளக்கம் வெளியிடப்பட்ட மொழிபெயர்ப்போ மார்க்கத் தீர்ப்போ அல்ல.', askEyebrow:'உங்கள் கேள்வி', askTitle:'நீங்கள் புரிந்துகொள்ள விரும்புவதில் தொடங்குங்கள்.', askHelp:'ஒரு கேள்வி, ஆயத் குறிப்பு அல்லது இரண்டையும் சேர்க்கவும். நீங்கள் கேட்கத் தேர்வுசெய்தால் மட்டுமே மூல ஆதாரமுள்ள பதில் கோரப்படும்.', verseLabel:'ஆயத் அல்லது குறுகிய வரம்பு (விருப்பம்)', verseHelp:'உதாரணமாக 2:255 என ஸூரா:ஆயத் வடிவைப் பயன்படுத்தவும். சேவையகம் வரம்பையும் கிடைப்பையும் சரிபார்க்கும்.', questionLabel:'கேள்வி (ஆயத் உள்ளிடப்பட்டால் விருப்பம்)', questionPlaceholder:'நீங்கள் எதைப் புரிந்துகொள்ள விரும்புகிறீர்கள்?', questionHelp:'படிப்புக் கேள்வியில் கணக்கு, தொடர்பு அல்லது பிற முக்கியத் தகவல்களைச் சேர்க்க வேண்டாம்.', languageLabel:'பதில் மொழி', saveHistory:'என் கணக்கு ஆதரித்தால் இந்தப் பதிலை என் தனிப்பட்ட படிப்பு வரலாற்றில் சேமிக்கவும்.', askButton:'மூலங்களுடன் கேளுங்கள்', cancel:'காத்திருப்பதை நிறுத்து', voiceEyebrow:'விருப்பக் குரல் உள்ளீடு', voiceTitle:'உங்கள் கேள்வியைப் பேசுங்கள்', voiceHelp:'நீங்கள் பதிவு செய்யத் தேர்வுசெய்த பின்னரே உலாவி ஒலிவாங்கி அனுமதியைக் கேட்கும். எழுத்தாக்கம் இல்லையெனில் கேள்வியைத் தட்டச்சு செய்யவும்.', voiceStart:'கேள்வியைப் பதிவு செய்', voiceStop:'பதிவை நிறுத்து', voiceUnsupported:'இந்த உலாவியில் ஒலிவாங்கிப் பதிவு இல்லை. கேள்வியைத் தட்டச்சு செய்யலாம்.', guidanceEyebrow:'பதிலை எப்படிப் படிப்பது', guidanceTitle:'அடுக்குகளைத் தெளிவாக வைத்திருங்கள்.', layerOneTitle:'மூல மேற்கோள்கள்', layerOne:'கிடைத்தால் அடையாளங்கள், பதிப்புப் பெயர்கள் மற்றும் இணைப்புகளுடன் தனியாகக் காட்டப்படும்.', layerTwoTitle:'உருவாக்கப்பட்ட விளக்கம்', layerTwo:'அவ்வாறே குறிக்கப்படும். அது படிப்புக்கு உதவலாம்; ஆனால் பெயரிடப்பட்ட மொழிபெயர்ப்பு, தஃப்சீர் அல்லது தகுதியான வழிகாட்டலுக்குப் பதிலல்ல.', layerThreeTitle:'கிடைக்காத ஆதாரம்', layerThree:'கிடைக்கவில்லை என்றே காட்டப்படும். இந்தப் பக்கம் மேற்கோள்களையோ சுட்டுகளையோ உருவாக்குவதில்லை.', resultEyebrow:'படிப்பு பதில்', resultTitle:'விளக்கத்தை அதன் மூலங்களுடன் வாசியுங்கள்.', sourcesTitle:'மூலக் குறிப்புகள்', sourcesHelp:'கீழுள்ள சுட்டு அடையாளங்கள் இந்தப் பதிலுக்குக் கொடுக்கப்பட்ட மூலத் தகவலைக் குறிக்கின்றன.', listenEyebrow:'கேளுங்கள்', listenTitle:'காட்டப்பட்ட பதிலை ஒலியாக்குக', listenHelp:'இந்தக் காட்டப்பட்ட பதிலுக்காக மட்டுமே ஒலியாக்கம் கோரப்படும். அது தானாகத் தொடங்காது; இந்தப் பக்கத்தில் உள்ள வேறு ஒலியையும் இடைநிறுத்தும்.', listenButton:'ஒலியைத் தயாரி', cancelNarration:'ஒலி கோரிக்கையை ரத்து செய்', play:'இயக்கு', pause:'இடைநிறுத்து', replay:'மீண்டும் இயக்கு', speed:'வேகம்', seekHelp:'கிடைத்தால் தேடுவதற்கு இயல்பான ஒலி காலவரிசையைப் பயன்படுத்தவும்.', footer:'சிந்திக்கும் பன்மொழிச் சமூகத்திற்கான மூல விழிப்புணர்வுள்ள கற்றல்.', promptRequired:'கேட்பதற்கு முன் ஒரு கேள்வி, ஆயத் குறிப்பு அல்லது இரண்டையும் சேர்க்கவும்.', verseInvalid:'2:255 போன்ற ஆயத் குறிப்பையோ 2:255-257 போன்ற குறுகிய வரம்பையோ பயன்படுத்தவும்.', requesting:'மூல ஆதாரமுள்ள படிப்பு கோரப்படுகிறது…', requestCancelled:'இந்த உலாவியில் காத்திருப்பது நிறுத்தப்பட்டது. சேவையக உருவாக்கம் தொடரலாம்; தினசரி வரம்பில் கணக்காகலாம்.', unavailable:'படிப்பு இப்போது கிடைக்கவில்லை. பதிலோ சுட்டோ காட்டப்படவில்லை. பிறகு முயற்சிக்கவும்.', invalidResponse:'படிப்புச் சேவை முழுமையற்ற பதிலை அளித்தது; ஆகவே அது காட்டப்படவில்லை.', responseReady:'படிப்பு பதில் தயாராக உள்ளது. கீழே உள்ள மூலக் குறிப்புகளைப் படிக்கவும்.', selectedVerse:'வாசிப்பிலிருந்து ஆயத் {verse} சேர்க்கப்பட்டது.', noSources:'மூலக் குறிப்புகள் இல்லை; ஆகவே இந்தப் பதில் காட்டப்படவில்லை.', preparingAudio:'இந்தப் பதிலுக்கான ஒலியாக்கம் தயாராகிறது…', audioReady:'ஒலி தயாராக உள்ளது. கேட்கத் தயாரானதும் இயக்கு என்பதைத் தேர்ந்தெடுக்கவும்.', narrationWaiting:'ஒலியாக்கம் இன்னும் தயாராகிறது. சிறிது நேரத்தில் மீண்டும் ஒலியைத் தயாரி என்பதைத் தேர்ந்தெடுக்கவும்.', narrationCancelled:'இந்த உலாவியில் ஒலி கோரிக்கை ரத்து செய்யப்பட்டது. ஏற்கனவே தொடங்கியிருந்தால் சேவையகப் பணி தொடரலாம்.', narrationUnavailable:'ஒலியை இப்போது தயாரிக்க முடியவில்லை.', audioError:'ஒலியை இயக்க முடியவில்லை. மீண்டும் தயாரிக்க முயற்சிக்கவும்.', recording:'பதிவாகிறது… அதிகபட்சம் 30 வினாடிகள்.', recordingStopped:'பதிவு நிறுத்தப்பட்டது. எழுத்தாக்கம் கோரப்படுகிறது…', recordingTooLarge:'2 MB-ஐ மீறியதால் பதிவு அனுப்பப்படவில்லை. கேள்வியைத் தட்டச்சு செய்யவும்.', transcriptionReady:'எழுத்தாக்கம் கேள்விப் புலத்தில் சேர்க்கப்பட்டது. கேட்பதற்கு முன் பரிசீலிக்கவும்.', transcriptionUnavailable:'பதிவை எழுத்தாக்க முடியவில்லை. கேள்வியைத் தட்டச்சு செய்யவும்.', microphoneDenied:'ஒலிவாங்கி அனுமதி வழங்கப்படவில்லை. கேள்வியைத் தட்டச்சு செய்யவும்.', recordingCancelled:'பதிவு ரத்து செய்யப்பட்டது. ஒலி எதுவும் அனுப்பப்படவில்லை.' },
    si: { skip:'අන්තර්ගතයට යන්න', eyebrow:'සාරාංශයට පෙර මූලාශ්‍ර', title:'ආයතයක් සැලකිල්ලෙන් අධ්‍යයනය කරන්න.', lead:'ඉලක්කගත ප්‍රශ්නයක් අසන්න, නැතහොත් කියවනයෙන් ආයතයක් රැගෙන එන්න. ජනනය කළ පැහැදිලි කිරීම පෙන්වන මූලාශ්‍රවලින් වෙනම තබා ඇත.', principle:'මූලාශ්‍ර සඳහනක් පරීක්ෂා කළ හැක. ජනනය කළ පැහැදිලි කිරීමක් ප්‍රකාශිත පරිවර්තනයක් හෝ ආගමික තීරණයක් නොවේ.', askEyebrow:'ඔබේ ප්‍රශ්නය', askTitle:'ඔබට තේරුම් ගැනීමට අවශ්‍ය දෙයින් අරඹන්න.', askHelp:'ප්‍රශ්නයක්, ආයත් සඳහනක් හෝ දෙකම එක් කරන්න. ඔබ අසන්න තෝරාගත් විට පමණක් මූලාශ්‍ර-පදනම් පිළිතුරක් ඉල්ලනු ලැබේ.', verseLabel:'ආයතය හෝ කෙටි පරාසය (විකල්ප)', verseHelp:'උදාහරණයක් ලෙස 2:255 ආකාරයෙන් සූරාව:ආයතය භාවිත කරන්න. සේවාදායකය පරාසය සහ තිබේදැයි පරීක්ෂා කරයි.', questionLabel:'ප්‍රශ්නය (ආයතයක් ඇතුළත් නම් විකල්ප)', questionPlaceholder:'ඔබට තේරුම් ගැනීමට අවශ්‍ය කුමක්ද?', questionHelp:'අධ්‍යයන ප්‍රශ්නයකට ගිණුම්, සම්බන්ධතා හෝ වෙනත් සංවේදී තොරතුරු ඇතුළත් නොකරන්න.', languageLabel:'පිළිතුරු භාෂාව', saveHistory:'මගේ ගිණුම එයට සහාය දක්වන්නේ නම්, මෙම පිළිතුර මගේ පෞද්ගලික අධ්‍යයන ඉතිහාසයට සුරකින්න.', askButton:'මූලාශ්‍ර සමඟ අසන්න', cancel:'බලා සිටීම නවත්වන්න', voiceEyebrow:'විකල්ප හඬ ආදානය', voiceTitle:'ඔබේ ප්‍රශ්නය කතා කරන්න', voiceHelp:'ඔබ පටිගත කිරීමට තෝරාගත් පසු පමණක් ඔබගේ බ්‍රවුසරය මයික්‍රෆෝන අවසර ඉල්ලයි. පිටපත් කිරීම නොමැති නම් ප්‍රශ්නය ටයිප් කරන්න.', voiceStart:'ප්‍රශ්නයක් පටිගත කරන්න', voiceStop:'පටිගත කිරීම නවත්වන්න', voiceUnsupported:'මෙම බ්‍රවුසරයේ මයික්‍රෆෝන පටිගත කිරීම නොමැත. ඔබට ප්‍රශ්නය ටයිප් කළ හැක.', guidanceEyebrow:'පිළිතුරක් කියවන්නේ කෙසේද', guidanceTitle:'ස්ථර පැහැදිලිව තබා ගන්න.', layerOneTitle:'මූලාශ්‍ර උපුටා දැක්වීම්', layerOne:'ලබාදෙන විට හැඳුනුම්පත්, සංස්කරණ නාම සහ සබැඳි සමඟ වෙනම පෙන්වයි.', layerTwoTitle:'ජනනය කළ පැහැදිලි කිරීම', layerTwo:'එලෙස ලේබල් කර ඇත. එය අධ්‍යයනයට මඟ පෙන්විය හැකි නමුත් නාමකරණය කළ පරිවර්තනයක්, තෆ්සීරයක් හෝ සුදුසුකම් ලත් මඟපෙන්වීමක් වෙනුවට නොවේ.', layerThreeTitle:'නොලැබෙන සාක්ෂි', layerThree:'නොලැබෙන බව පෙන්වයි. මෙම පිටුව උපුටා දැක්වීම් හෝ සඳහන් නිර්මාණය නොකරයි.', resultEyebrow:'අධ්‍යයන පිළිතුර', resultTitle:'පැහැදිලි කිරීම එහි මූලාශ්‍ර සමඟ කියවන්න.', sourcesTitle:'මූලාශ්‍ර සඳහන්', sourcesHelp:'පහත සඳහන් හැඳුනුම්පත් මෙම පිළිතුර සඳහා ලබාදුන් මූලාශ්‍ර ද්‍රව්‍ය හඳුනා ගනී.', listenEyebrow:'සවන් දෙන්න', listenTitle:'පෙන්වන පිළිතුර හඬින් කියවන්න', listenHelp:'මෙම පෙන්වන පිළිතුර සඳහා පමණක් හඬකරණය ඉල්ලනු ලැබේ. එය ස්වයංක්‍රීයව ආරම්භ නොවන අතර මෙම පිටුවේ වෙනත් හඬක් විරාම කරයි.', listenButton:'හඬ සූදානම් කරන්න', cancelNarration:'හඬ ඉල්ලීම අවලංගු කරන්න', play:'වාදනය', pause:'විරාමය', replay:'නැවත වාදනය', speed:'වේගය', seekHelp:'තිබේ නම් සෙවීම සඳහා මූලික හඬ කාලරේඛාව භාවිත කරන්න.', footer:'සිතන බහුභාෂා ප්‍රජාවක් සඳහා මූලාශ්‍ර දැනුවත් ඉගෙනීම.', promptRequired:'ඇසීමට පෙර ප්‍රශ්නයක්, ආයත් සඳහනක් හෝ දෙකම එක් කරන්න.', verseInvalid:'2:255 වැනි ආයත් සඳහනක් හෝ 2:255-257 වැනි කෙටි පරාසයක් භාවිත කරන්න.', requesting:'මූලාශ්‍ර-පදනම් අධ්‍යයනය ඉල්ලමින්…', requestCancelled:'මෙම බ්‍රවුසරයේ බලා සිටීම නැවැත්විණි. සේවාදායකයේ ජනනය ඉදිරියට යා හැකි අතර දෛනික සීමාවට ගණන් විය හැක.', unavailable:'අධ්‍යයනය දැන් නොමැත. පිළිතුරක් හෝ සඳහනක් පෙන්වා නැත. පසුව උත්සාහ කරන්න.', invalidResponse:'අධ්‍යයන සේවාව අසම්පූර්ණ පිළිතුරක් ලබා දුන් නිසා එය පෙන්වා නැත.', responseReady:'අධ්‍යයන පිළිතුර සූදානම්. පහත මූලාශ්‍ර සඳහන් කියවන්න.', selectedVerse:'කියවනයෙන් {verse} ආයතය එක් කරන ලදී.', noSources:'මූලාශ්‍ර සඳහන් ලබා දී නැති නිසා මෙම පිළිතුර පෙන්වා නැත.', preparingAudio:'මෙම නිශ්චිත පිළිතුර සඳහා හඬකරණය සූදානම් කරමින්…', audioReady:'හඬ සූදානම්. සවන් දීමට සූදානම් වූ විට වාදනය තෝරන්න.', narrationWaiting:'හඬකරණය තවම සූදානම් වෙමින් පවතී. ටික වේලාවකින් නැවත හඬ සූදානම් කරන්න තෝරන්න.', narrationCancelled:'මෙම බ්‍රවුසරයේ හඬ ඉල්ලීම අවලංගු විය. එය දැනටමත් ආරම්භ වී නම් සේවාදායක කාර්යය දිගටම යා හැක.', narrationUnavailable:'දැන් හඬ සූදානම් කළ නොහැක.', audioError:'හඬ වාදනය කළ නොහැකි විය. නැවත සූදානම් කිරීමට උත්සාහ කරන්න.', recording:'පටිගත කරමින්… උපරිම තත්පර 30.', recordingStopped:'පටිගත කිරීම නැවැත්වීය. පිටපත් කිරීම ඉල්ලමින්…', recordingTooLarge:'2 MB ඉක්මවූ නිසා පටිගත කිරීම යවා නැත. ප්‍රශ්නය ටයිප් කරන්න.', transcriptionReady:'පිටපත ප්‍රශ්න ක්ෂේත්‍රයට එක් කරන ලදී. ඇසීමට පෙර එය පරීක්ෂා කරන්න.', transcriptionUnavailable:'පටිගත කිරීම පිටපත් කළ නොහැකි විය. ප්‍රශ්නය ටයිප් කරන්න.', microphoneDenied:'මයික්‍රෆෝන අවසර ලබා දී නැත. ප්‍රශ්නය ටයිප් කරන්න.', recordingCancelled:'පටිගත කිරීම අවලංගු විය. හඬක් යවා නැත.' }
  };

  const reportCopy = {
    en: {reportTitle:'Report a possible source or answer issue',reportHelp:'An owner-only queue receives this report. It does not send email or certify an answer. Do not enter personal details.',reportReason:'Concern',reportCitation:'Citation or source',reportInaccurate:'Possible inaccuracy',reportHarmful:'Potentially harmful answer',reportDetails:'Additional context (optional; no personal details)',reportSend:'Send for restricted review',reportSending:'Saving the report…',reportSaved:'Saved for restricted owner review. No email was sent.',reportFailed:'The report could not be saved. Please try again without personal details.'},
    ta: {reportTitle:'மூலம் அல்லது பதிலில் சாத்தியமான சிக்கலைத் தெரிவிக்கவும்',reportHelp:'உரிமையாளர் மட்டும் பார்க்கும் வரிசையில் இந்த அறிக்கை சேமிக்கப்படும். மின்னஞ்சல் அனுப்பப்படாது; பதிலுக்கு சான்றும் அல்ல. தனிப்பட்ட விவரங்களை இட வேண்டாம்.',reportReason:'சிக்கல்',reportCitation:'மேற்கோள் அல்லது மூலம்',reportInaccurate:'சாத்தியமான தவறு',reportHarmful:'தீங்கு விளைவிக்கக்கூடிய பதில்',reportDetails:'கூடுதல் விளக்கம் (விருப்பம்; தனிப்பட்ட விவரங்கள் வேண்டாம்)',reportSend:'தனிப்பட்ட பரிசீலனைக்கு அனுப்பு',reportSending:'அறிக்கை சேமிக்கப்படுகிறது…',reportSaved:'உரிமையாளர் மட்டும் பார்க்கும் பரிசீலனைக்குச் சேமிக்கப்பட்டது. மின்னஞ்சல் அனுப்பப்படவில்லை.',reportFailed:'அறிக்கையைச் சேமிக்க முடியவில்லை. தனிப்பட்ட விவரங்கள் இன்றி மீண்டும் முயலுங்கள்.'},
    si: {reportTitle:'මූලාශ්‍රය හෝ පිළිතුර ගැන ඇති ගැටලුවක් වාර්තා කරන්න',reportHelp:'මෙම වාර්තාව හිමිකරුට පමණක් පෙනෙන පෝලිමට සුරකිනු ලැබේ. විද්‍යුත් තැපෑලක් නොයැවේ; පිළිතුර සහතික නොවේ. පුද්ගලික තොරතුරු නොදමන්න.',reportReason:'ගැටලුව',reportCitation:'උපුටනය හෝ මූලාශ්‍රය',reportInaccurate:'සාවද්‍යතාවක් විය හැක',reportHarmful:'හානිකර විය හැකි පිළිතුර',reportDetails:'අමතර විස්තර (විකල්ප; පුද්ගලික තොරතුරු නොදමන්න)',reportSend:'සීමිත සමාලෝචනයට යවන්න',reportSending:'වාර්තාව සුරකිමින්…',reportSaved:'හිමිකරුට පමණක් පෙනෙන සමාලෝචනයට සුරකින ලදී. විද්‍යුත් තැපෑලක් යවා නැත.',reportFailed:'වාර්තාව සුරැකිය නොහැකි විය. පුද්ගලික තොරතුරු නොමැතිව නැවත උත්සාහ කරන්න.'}
  };

  const availabilityCopy = {
    en: 'AI study and voice are unavailable until the owner enables them.',
    ta: 'AI படிப்பு மற்றும் குரல் அம்சங்கள் உரிமையாளர் இயக்கும் வரை கிடைக்காது.',
    si: 'AI අධ්‍යයන සහ හඬ පහසුකම් හිමිකරු සක්‍රිය කරන තුරු ලබා ගත නොහැක.'
  };

  const $ = id => document.getElementById(id);
  const form = $('study-form');
  const verseField = $('study-verse');
  const questionField = $('study-question');
  const languageField = $('study-language');
  const status = $('study-form-status');
  const result = $('study-result');
  const paragraphs = $('study-paragraphs');
  const sources = $('study-source-list');
  const disclosure = $('study-disclosure');
  const generatedAt = $('study-generated-at');
  const audio = $('study-audio');
  let language = storedLanguage();
  let studyEnabled = false;
  let studyController = null;
  let narrationController = null;
  let recordingController = null;
  let responseId = null;
  let activeRecorder = null;
  let recordingStarting = false;
  let recordingTimer = null;

  function storedLanguage() {
    try { const value = JSON.parse(localStorage.getItem('dd-language')); return languages.includes(value) ? value : 'en'; } catch { return 'en'; }
  }
  function text(key) { return (copy[language] || copy.en)[key] || copy.en[key] || ''; }
  function setText(node, value) { if (node) node.textContent = value; }
  function setStatus(node, message, kind = '') { node.textContent = message; node.hidden = !message; node.className = 'study-status' + (kind ? ' is-' + kind : ''); }
  function replace(template, values) { return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? '')); }

  function applyLanguage(nextLanguage) {
    language = languages.includes(nextLanguage) ? nextLanguage : 'en';
    document.documentElement.lang = language;
    document.querySelectorAll('[data-study-copy]').forEach(node => setText(node, text(node.dataset.studyCopy)));
    document.querySelectorAll('[data-study-report-copy]').forEach(node => setText(node, reportCopy[language][node.dataset.studyReportCopy]));
    document.querySelectorAll('[data-study-placeholder]').forEach(node => { node.placeholder = text(node.dataset.studyPlaceholder); });
    setText($('study-availability'), availabilityCopy[language]);
    languageField.value = language;
    if (responseId) $('narrate-button').textContent = text('listenButton');
  }

  function validVerse(value) {
    if (!value) return true;
    return /^\d{1,3}:\d{1,3}(?:-\d{1,3}(?::\d{1,3})?)?$/.test(value);
  }

  function clearResult() {
    result.hidden = true;
    paragraphs.replaceChildren();
    sources.replaceChildren();
    disclosure.replaceChildren();
    generatedAt.textContent = '';
    responseId = null;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    $('study-audio-controls').hidden = true;
    setStatus($('narrate-status'), '');
    $('study-report-form').reset();
    setStatus($('study-report-status'), '');
  }

  function safeAudioUrl(value) {
    if (typeof value !== 'string' || !value) return null;
    try {
      const url = new URL(value, window.location.origin);
      return url.origin === window.location.origin && url.pathname.startsWith('/api/study/') ? url.href : null;
    } catch { return null; }
  }

  function safeSourceUrl(value) {
    if (typeof value !== 'string' || !value) return null;
    try {
      const url = new URL(value, window.location.origin);
      const ownEvidence = url.origin === window.location.origin && url.pathname.startsWith('/api/study/evidence/');
      const originalPublisher = url.protocol === 'https:' && ['quran.com', 'www.quran.com', 'mcp.quran.ai'].includes(url.hostname);
      return !url.username && !url.password && (ownEvidence || originalPublisher) ? url.href : null;
    } catch { return null; }
  }

  function sourceIsValid(item) {
    return item && ['id','title','edition','verse','url','quote'].every(key => typeof item[key] === 'string');
  }

  function responseIsValid(data) {
    return data && typeof data.id === 'string' && languages.includes(data.language) && Array.isArray(data.paragraphs) && data.paragraphs.length > 0 && data.paragraphs.every(value => typeof value === 'string' && value.trim()) && Array.isArray(data.sources) && data.sources.length > 0 && data.sources.every(sourceIsValid) && typeof data.disclosure === 'string' && typeof data.generatedAt === 'string';
  }

  function dateLabel(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(language === 'ta' ? 'ta-LK' : language === 'si' ? 'si-LK' : 'en-LK', { dateStyle:'medium', timeStyle:'short' }).format(date);
  }

  function createSourceCard(item) {
    const card = document.createElement('article');
    card.className = 'study-source-card';
    const top = document.createElement('div');
    top.className = 'source-card-top';
    const heading = document.createElement('div');
    const id = document.createElement('span');
    id.className = 'citation-id';
    id.textContent = '[' + item.id + ']';
    const title = document.createElement('h4');
    title.textContent = item.title;
    const meta = document.createElement('p');
    meta.className = 'source-meta';
    meta.textContent = [item.edition, item.verse].filter(Boolean).join(' · ');
    heading.append(id, title, meta);
    top.append(heading);
    const quote = document.createElement('blockquote');
    quote.className = 'source-quote';
    quote.textContent = item.quote;
    card.append(top, quote);
    const url = safeSourceUrl(item.url);
    if (url) {
      const link = document.createElement('a');
      link.className = 'source-link';
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = text('sourcesTitle') + ' ↗';
      card.append(link);
    } else {
      const unavailable = document.createElement('span');
      unavailable.className = 'source-link-unavailable';
      unavailable.textContent = item.url ? 'Source URL unavailable' : 'No source URL supplied';
      card.append(unavailable);
    }
    return card;
  }

  function renderResponse(data) {
    clearResult();
    responseId = data.id;
    data.paragraphs.forEach(value => { const paragraph = document.createElement('p'); paragraph.textContent = value; paragraphs.append(paragraph); });
    disclosure.textContent = data.disclosure;
    generatedAt.dateTime = data.generatedAt;
    generatedAt.textContent = dateLabel(data.generatedAt);
    data.sources.forEach(item => sources.append(createSourceCard(item)));
    result.hidden = false;
    setStatus(status, text('responseReady'), 'success');
    result.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'start' });
  }

  async function readJson(response) {
    try { return await response.json(); } catch { return null; }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!studyEnabled) { setStatus(status, availabilityCopy[language], 'error'); return; }
    const verse = verseField.value.trim();
    const question = questionField.value.trim();
    if (!verse && !question) { setStatus(status, text('promptRequired'), 'error'); questionField.focus(); return; }
    if (!validVerse(verse)) { setStatus(status, text('verseInvalid'), 'error'); verseField.focus(); return; }
    clearResult();
    studyController = new AbortController();
    $('study-submit').disabled = true;
    $('study-cancel').hidden = false;
    setStatus(status, text('requesting'));
    try {
      const response = await fetch('/api/study/generate', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ question, verse, language:languageField.value, saveHistory:$('study-save-history').checked }), signal:studyController.signal });
      const data = await readJson(response);
      if (!response.ok || !responseIsValid(data)) throw new Error(response.ok ? 'invalid' : 'unavailable');
      renderResponse(data);
    } catch (error) {
      if (error && error.name === 'AbortError') setStatus(status, text('requestCancelled'));
      else setStatus(status, error && error.message === 'invalid' ? text('invalidResponse') : text('unavailable'), 'error');
    } finally {
      studyController = null;
      $('study-submit').disabled = !studyEnabled;
      $('study-cancel').hidden = true;
    }
  });

  $('study-cancel').addEventListener('click', () => { if (studyController) studyController.abort(); });

  $('study-report-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!responseId) return;
    const form = $('study-report-form');
    const button = form.querySelector('button[type="submit"]');
    const notice = $('study-report-status');
    button.disabled = true;
    setStatus(notice, reportCopy[language].reportSending);
    try {
      const result = await fetch('/api/study/report', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responseId, reason: $('study-report-reason').value, details: $('study-report-details').value.trim() }),
      });
      if (!result.ok) throw new Error('report_unavailable');
      form.reset();
      setStatus(notice, reportCopy[language].reportSaved, 'success');
    } catch {
      setStatus(notice, reportCopy[language].reportFailed, 'error');
    } finally { button.disabled = false; }
  });

  function pauseOtherAudio() {
    document.querySelectorAll('audio').forEach(item => { if (item !== audio) { try { item.pause(); } catch {} } });
  }

  $('narrate-button').addEventListener('click', async () => {
    if (!responseId) return;
    narrationController = new AbortController();
    $('narrate-button').disabled = true;
    $('narrate-cancel').hidden = false;
    setStatus($('narrate-status'), text('preparingAudio'));
    try {
      const response = await fetch('/api/study/narrate', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ responseId }), signal:narrationController.signal });
      const data = await readJson(response);
      if (!response.ok || !data || typeof data.status !== 'string') throw new Error('unavailable');
      const url = safeAudioUrl(data.audioUrl);
      if (url) {
        audio.pause();
        audio.src = url;
        audio.load();
        $('study-audio-controls').hidden = false;
        setStatus($('narrate-status'), text('audioReady'), 'success');
      } else if (['queued', 'processing', 'pending'].includes(data.status)) {
        setStatus($('narrate-status'), text('narrationWaiting'));
      } else {
        throw new Error('unavailable');
      }
    } catch (error) {
      if (error && error.name === 'AbortError') setStatus($('narrate-status'), text('narrationCancelled'));
      else setStatus($('narrate-status'), text('narrationUnavailable'), 'error');
    } finally {
      narrationController = null;
      $('narrate-button').disabled = false;
      $('narrate-cancel').hidden = true;
    }
  });
  $('narrate-cancel').addEventListener('click', () => { if (narrationController) narrationController.abort(); });
  audio.addEventListener('play', pauseOtherAudio);
  audio.addEventListener('error', () => setStatus($('narrate-status'), text('audioError'), 'error'));
  $('audio-play').addEventListener('click', async () => { if (!audio.src) return; pauseOtherAudio(); try { await audio.play(); } catch { setStatus($('narrate-status'), text('audioError'), 'error'); } });
  $('audio-pause').addEventListener('click', () => audio.pause());
  $('audio-replay').addEventListener('click', async () => { if (!audio.src) return; audio.currentTime = 0; pauseOtherAudio(); try { await audio.play(); } catch { setStatus($('narrate-status'), text('audioError'), 'error'); } });
  $('audio-speed').addEventListener('change', event => { audio.playbackRate = Number(event.target.value) || 1; });

  function stopTracks(stream) { if (stream) stream.getTracks().forEach(track => track.stop()); }
  function clearRecorder() {
    clearTimeout(recordingTimer);
    recordingTimer = null;
    $('voice-start').hidden = !studyEnabled || !micSupported;
    $('voice-stop').hidden = true;
    activeRecorder = null;
  }
  async function transcribe(blob) {
    if (!blob || blob.size > MAX_RECORDING_BYTES) { setStatus($('voice-status'), text('recordingTooLarge'), 'error'); return; }
    recordingController = new AbortController();
    $('voice-start').disabled = true;
    setStatus($('voice-status'), text('recordingStopped'));
    const payload = new FormData();
    payload.append('audio', blob, 'study-question.webm');
    payload.append('language', languageField.value);
    try {
      const response = await fetch('/api/study/transcribe', { method:'POST', body:payload, signal:recordingController.signal });
      const data = await readJson(response);
      if (!response.ok || !data || typeof data.transcript !== 'string' || !data.transcript.trim()) throw new Error('unavailable');
      questionField.value = data.transcript.trim().slice(0, 600);
      questionField.focus();
      setStatus($('voice-status'), text('transcriptionReady'), 'success');
    } catch (error) {
      setStatus($('voice-status'), text('transcriptionUnavailable'), 'error');
    } finally { recordingController = null; $('voice-start').disabled = false; }
  }
  async function startRecording() {
    if (!studyEnabled || recordingStarting || activeRecorder || recordingController) return;
    recordingStarting = true;
    $('voice-start').disabled = true;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio:true });
      if (!studyEnabled) { stopTracks(stream); return; }
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      let size = 0;
      activeRecorder = recorder;
      $('voice-start').hidden = true;
      $('voice-stop').hidden = false;
      setStatus($('voice-status'), text('recording'));
      recorder.addEventListener('dataavailable', event => { if (event.data && event.data.size) { chunks.push(event.data); size += event.data.size; if (size > MAX_RECORDING_BYTES && recorder.state === 'recording') recorder.stop(); } });
      recorder.addEventListener('stop', () => { stopTracks(stream); if (activeRecorder !== recorder) return; const blob = new Blob(chunks, { type:recorder.mimeType || 'audio/webm' }); clearRecorder(); if (size > MAX_RECORDING_BYTES) setStatus($('voice-status'), text('recordingTooLarge'), 'error'); else transcribe(blob); });
      recorder.start(250);
      recordingTimer = setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, MAX_RECORDING_MS);
    } catch { stopTracks(stream); clearRecorder(); setStatus($('voice-status'), text('microphoneDenied'), 'error'); }
    finally { recordingStarting = false; $('voice-start').disabled = Boolean(recordingController); }
  }
  $('voice-start').addEventListener('click', startRecording);
  $('voice-stop').addEventListener('click', () => { if (activeRecorder && activeRecorder.state === 'recording') activeRecorder.stop(); });

  function takeVerseFromQuery() {
    const value = new URLSearchParams(window.location.search).get('verse') || '';
    if (value && validVerse(value)) { verseField.value = value; setStatus(status, replace(text('selectedVerse'), { verse:value }), 'success'); }
  }
  document.addEventListener('dd:languagechange', event => applyLanguage(event.detail && event.detail.language));
  const micSupported = Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  async function loadAvailability() {
    try {
      const response = await fetch('/api/study/availability', { credentials:'same-origin', cache:'no-store' });
      const data = response.ok ? await readJson(response) : null;
      studyEnabled = data?.enabled === true;
    } catch { studyEnabled = false; }
    $('study-submit').disabled = !studyEnabled;
    $('study-availability').hidden = studyEnabled;
    $('voice-start').hidden = !studyEnabled || !micSupported;
    $('voice-unsupported').hidden = !studyEnabled || micSupported;
  }
  applyLanguage(language);
  takeVerseFromQuery();
  loadAvailability();
})();
