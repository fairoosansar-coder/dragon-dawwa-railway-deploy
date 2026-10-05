// Operator-only bounded voice samples. Do not include generated audio in Git or publish it.
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createGeminiStudyProvider} from '../server/gemini-study.mjs';
const output=process.argv[2];
if(!output||!path.isAbsolute(output)||!process.env.GEMINI_API_KEY)throw new Error('Absolute private output directory and protected Google key required');
const provider=createGeminiStudyProvider({...process.env,STUDY_LIVE_CANARY:'true',STUDY_LIVE_CANARY_USER_ID:'qa_voice_sample_operator',STUDY_GEMINI_TIMEOUT_MS:'20000'}, {id:'qa_voice_sample_operator'});
const samples={
 en:'Dragon Dawwa. This is a short voice sample for clear English. Listen carefully and share your feedback.',
 ta:'டிராகன் தவ்வா. தெளிவான தமிழ் உச்சரிப்புக்கான குரல் மாதிரி இது. கவனமாகக் கேட்டு உங்கள் கருத்தை பகிருங்கள்.',
 si:'ඩ්‍රැගන් දව්වා. පැහැදිලි සිංහල උච්චාරණය සඳහා හඬ නියැදියකි. සවන් දී ඔබගේ අදහස් දක්වන්න.',
};
await mkdir(output,{recursive:true,mode:0o700});
for(const [language,text] of Object.entries(samples)){
 if(text.length>180)throw new Error('Sample text too long');
 const {bytes,model}=await provider.synthesize({text,language,voice:'Kore'});
 if(bytes.length>2*1024*1024)throw new Error('Unexpectedly long sample');
 const name=`Kore-${language}.wav`;await writeFile(path.join(output,name),bytes,{mode:0o600});
 console.log(JSON.stringify({name,model,bytes:bytes.length,approxSeconds:Math.round((bytes.length-44)/48000),spokenScript:text}));
}
