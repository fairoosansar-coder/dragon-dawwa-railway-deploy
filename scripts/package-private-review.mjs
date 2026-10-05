// Operator-only local source export. Does not commit, push, publish or contact a provider.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFileSync,existsSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const project=path.resolve(import.meta.dirname,'..');
const output=process.argv[2]||'/home/ubuntu/work/dragon-dawwa/Dragon-Dawwa-Private-Review-master-2026-10-05.zip';
const root='Dragon-Dawwa-Private-Review-master';
const tracked=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:project});
const files=[...new Set(tracked.toString('utf8').split('\0'))].filter(Boolean).sort();
const forbidden=/(^|\/)(?:\.git|node_modules|dist|\.wrangler|\.sites-runtime|\.next|__pycache__|\.private)(?:\/|$)|(^|\/)\.env(?!\.example$)|(^|\/)\.openai\/hosting\.json$|\.(?:pem|p12|pfx|sqlite|db|log)$/i;
const selected=files.filter(file=>existsSync(path.join(project,file))&&lstatSync(path.join(project,file)).isFile()&&!forbidden.test(file));
if(selected.length<150)throw new Error('Refusing incomplete source export');
const secretNames=['DATABASE_URL','MANUS_JWT_SECRET','QURAN_CLIENT_SECRET','QURAN_CLIENT_ID','GEMINI_API_KEY','OPENAI_API_KEY'];
const secretValues=secretNames.map(name=>process.env[name]).filter(value=>typeof value==='string'&&value.length>12);
const localCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:project}).toString().trim();
const worktreeDirty=Boolean(execFileSync('git',['status','--porcelain'],{cwd:project}).toString().trim());
const manifest={kind:'private review source export; not a deployment or publication',sourceHandoffCommit:'0a9baadd6682fb30f8514fe06d25a998f881a853',localCommit,worktreeDirty,createdAt:new Date().toISOString(),files:[]};
const staging=mkdtempSync(path.join(os.tmpdir(),'dragon-source-export-'));
try{
 for(const file of selected){
  const bytes=readFileSync(path.join(project,file));
  if(secretValues.some(value=>bytes.includes(Buffer.from(value))))throw new Error(`Possible runtime credential in ${file}; export stopped`);
  if(file.split('/').some(segment=>segment==='.'||segment==='..')||path.isAbsolute(file))throw new Error(`Unsafe source path: ${file}`);
  const target=path.join(staging,root,file);mkdirSync(path.dirname(target),{recursive:true});copyFileSync(path.join(project,file),target);
  manifest.files.push({path:file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
 }
 const manifestPath=path.join(staging,root,'SOURCE_EXPORT_MANIFEST.json');writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n',{mode:0o644});
 mkdirSync(path.dirname(output),{recursive:true});
 execFileSync('zip',['-q','-X','-r',output,root],{cwd:staging,stdio:'pipe'});
 const zip=readFileSync(output);
 console.log(JSON.stringify({path:output,sha256:createHash('sha256').update(zip).digest('hex'),sourceFiles:selected.length,bytes:zip.length,localCommit,worktreeDirty}));
}finally{rmSync(staging,{recursive:true,force:true});}
