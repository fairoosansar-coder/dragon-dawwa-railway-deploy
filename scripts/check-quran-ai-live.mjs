// Read-only provider acceptance: no member data, no Google call, no source-text persistence.
import {createQuranAiProvider} from '../server/quran-ai.mjs';
const mode = process.argv[2] || 'verse';
if (!['verse','question'].includes(mode)) throw new Error('Choose verse or question');
try {
  const packet = await createQuranAiProvider({STUDY_QURAN_TIMEOUT_MS:'12000', STUDY_SOURCE_DEBUG:process.env.STUDY_SOURCE_DEBUG}).retrieve(mode === 'verse'
    ? {verse:'1:1',question:'',language:'en'}
    : {question:'patience in hardship',language:'en'});
  console.log(JSON.stringify({status:'grounded',discovery:packet.discovery,verse:packet.verse,retrievedAt:packet.retrievedAt,
    sources:packet.sources.map(item=>({category:item.category,edition:item.edition,verse:item.verse,quoteLength:item.quote.length,url:item.url}))},null,2));
} catch(error) {
  console.error(JSON.stringify({status:'source_unavailable',code:error?.code||'provider_error',httpStatus:error?.status||503}));
  process.exitCode=1;
}
