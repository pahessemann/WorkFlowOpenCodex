import { readFile, writeFile, mkdir, readdir, cp } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPrototype } from './prototype-check.mjs';
import { validate, coreVersion } from '../assets/prototype/model.mjs';
const template=resolve(dirname(fileURLToPath(import.meta.url)),'../assets/prototype');
const args=process.argv.slice(2), command=args.shift();
const opts={}; for(let i=0;i<args.length;i+=2) {if(!['--root','--spec','--dir','--owner'].includes(args[i])||!args[i+1])throw Error('Options : --root <dossier> --spec <json>');opts[args[i]]=args[i+1]}
const rootOption=opts['--root']||process.env.PROTOTYPES_ROOT;
if(!rootOption&&!['check','resume'].includes(command))throw Error('Préciser --root ou PROTOTYPES_ROOT');
const root=resolve(rootOption||'.');
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function entries(path) {try{return await readdir(path,{withFileTypes:true})}catch(e){if(e.code==='ENOENT')return [];throw e}}
async function index(){
 const rows=[];
 for(const project of await entries(join(root,'projets')))if(project.isDirectory())for(const page of await entries(join(root,'projets',project.name)))if(page.isDirectory()){
   const dir=join(root,'projets',project.name,page.name);let s;try{s=JSON.parse(await readFile(join(dir,'spec.json'),'utf8'))}catch{continue}
   const revisions=(await entries(join(dir,'revisions'))).filter(e=>e.isDirectory()&&!e.name.startsWith('.')).map(e=>e.name);
   rows.push(`<tr><td>${esc(s.project)}</td><td>${esc(s.title)}</td><td>${esc(s.library.package)}@${esc(s.library.version)}</td><td>Brouillon r${s.revision} · ${revisions.length} révision(s) validée(s)</td><td><code>${esc(dir)}</code><br>Ouvrir un terminal ici : <code>pnpm dev</code></td></tr>`);
 }
 await mkdir(root,{recursive:true});
 await writeFile(join(root,'index.html'),`<!doctype html><html lang="fr"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prototypes</title><style>body{font:16px system-ui;max-width:1200px;margin:40px auto;padding:20px;color:#172033}td,th{padding:14px;text-align:left;border-bottom:1px solid #ddd}table{width:100%}code{overflow-wrap:anywhere}</style><h1>Prototypes le Design System</h1><p>Les serveurs de revue sont lancés à la demande. Aucun démarrage automatique de toutes les applications.</p><table><tr><th>Projet</th><th>Page</th><th>Bibliothèque</th><th>État</th><th>Accès local</th></tr>${rows.join('')}</table>${rows.length?'':'<p>Aucun prototype métier créé. Le socle est prêt pour le premier cadrage.</p>'}</html>`);
 console.log(join(root,'index.html'));
}
if(command==='check') {
 if(!opts['--dir'])throw Error('--dir requis');
 console.log(JSON.stringify(await checkPrototype(resolve(opts['--dir'])),null,2));
}else if(command==='resume') {
 if(!opts['--dir'])throw Error('--dir requis');
 const dir=resolve(opts['--dir']),file=join(dir,'prototype.local.json');
 let session;
 try {session=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(session&&opts['--owner']&&session.owner!==opts['--owner'])throw Error(`Prototype suivi par ${session.owner}. Transfert explicite nécessaire avant modification du responsable.`);
 if(!session){
  if(!opts['--owner'])throw Error('--owner <identifiant-discussion> requis pour enregistrer la reprise');
  const spec=JSON.parse(await readFile(join(dir,'spec.json'),'utf8'));
  session={directory:'.',start:'pnpm dev',coreVersion:spec.coreVersion||'non renseignée',owner:opts['--owner']};
  await writeFile(file,JSON.stringify(session,null,2)+'\n',{flag:'wx'});
 }
 console.log(JSON.stringify({...session,directory:dir},null,2));
}else if(command==='init'){
 if(!opts['--spec'])throw Error('--spec requis');
 const spec=validate(JSON.parse(await readFile(resolve(opts['--spec']),'utf8')));
 const dest=join(root,'projets',spec.project,spec.page);
 await mkdir(dirname(dest),{recursive:true});await mkdir(dest); // Refuse tout écrasement.
 await cp(template,dest,{recursive:true});
 spec.revision=0;spec.coreVersion=coreVersion;
 await writeFile(join(dest,'spec.json'),JSON.stringify(spec,null,2)+'\n');
 await writeFile(join(dest,'package.json'),JSON.stringify({name:`prototype-${spec.project}-${spec.page}`,private:true,type:'module',version:coreVersion,engines:{node:'>=22.12.0'},packageManager:'pnpm@11.0.8',scripts:{dev:'vite',build:'vite build'},dependencies:{react:'19.2.3','react-dom':'19.2.3',[spec.library.package]:spec.library.version},devDependencies:{vite:'8.2.1'}},null,2)+'\n');
 if(spec.library.package.startsWith('@exemple/')) await writeFile(join(dest,'.npmrc'),'@exemple:registry=https://npm.pkg.github.com\n');
 await writeFile(join(dest,'.gitignore'),'node_modules/\ndist/\n.env*\n*.tmp\nprototype.local.json\n');
 console.log(`Créé : ${dest}\nComposition à réaliser puis pnpm install et pnpm dev. Aucun accès privé installé automatiquement.`);
 await index();
}else if(command==='index'){await index()}else throw Error('Commandes : init, index, check --dir <prototype>, resume --dir <prototype> [--owner <discussion>]');
