// Operator-only public MCP probe. Does not call Gemini, save source text or use member data.
// node scripts/probe-quran-ai.mjs rules | search
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const mode = process.argv[2] || 'rules';
if (!['rules','search','tafsir_lengths'].includes(mode)) throw new Error('Choose rules, search or tafsir_lengths');
const client = new Client({name:'dragon-dawwa-readonly-probe',version:'1.0.0'});
try {
  await client.connect(new StreamableHTTPClientTransport(new URL('https://mcp.quran.ai')));
  const tools = await client.listTools();
  const search = tools.tools?.find(item=>item.name==='search_quran');
  if (!search?.annotations?.readOnlyHint) throw new Error('Read-only Quran search tool unavailable');
  const rules = await client.callTool({name:'fetch_grounding_rules',arguments:{}});
  const message = rules.content?.filter(item=>item.type==='text').map(item=>item.text).join('\n') || '';
  const nonce = message.match(/<grounding_nonce>\s*([^<\s]{1,500})\s*<\/grounding_nonce>/i)?.[1];
  if (!nonce) throw new Error('Current grounding nonce unavailable');
  if (mode === 'rules') {
    console.log(message.replace(/<grounding_nonce>[\s\S]*?<\/grounding_nonce>/i,'<grounding_nonce>[withheld]</grounding_nonce>'));
  } else if (mode === 'tafsir_lengths') {
    for (const edition of ['en-ibn-kathir','en-maarif-ul-quran','en-tazkirul-quran','ar-muyassar']) {
      const result = await client.callTool({name:'fetch_tafsir',arguments:{ayahs:'1:1',editions:edition,grounding_nonce:nonce}});
      const value = result.structuredContent || JSON.parse(result.content?.find(item=>item.type==='text')?.text||'{}');
      const passages = value.results?.[edition];
      console.log(JSON.stringify({edition,passages:Array.isArray(passages)?passages.map(item=>({ayahs:item.ayahs,range:item.range,length:item.text?.length})):null,error:Boolean(result.isError),warningsCount:value.warnings?.length||0}));
    }
  } else {
    const result = await client.callTool({name:'search_quran',arguments:{query:'patience in hardship',translations:'en',grounding_nonce:nonce}});
    const value = result.structuredContent || JSON.parse(result.content?.find(item=>item.type==='text')?.text||'{}');
    const keys = value && typeof value==='object' ? Object.keys(value) : [];
    const summarize = (node,depth=0) => depth > 3 || !node ? null : Array.isArray(node)
      ? {length:node.length,first:node.length?summarize(node[0],depth+1):null}
      : typeof node==='object' ? Object.fromEntries(Object.entries(node).slice(0,12).map(([key,child])=>[key,/text|quote|arabic|content|body/i.test(key)?typeof child:summarize(child,depth+1)]))
      : typeof node;
    console.log(JSON.stringify({isError:result.isError||false,keys,shape:summarize(value),groundingRulesInjected:value.grounding_rules!==null},null,2));
  }
} finally { await client.close().catch(()=>{}); }
