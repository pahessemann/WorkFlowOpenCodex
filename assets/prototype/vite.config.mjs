import { defineConfig } from 'vite';
import { readFile, writeFile, rename, mkdir, cp, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { validate, issue } from './model.mjs';
const root = import.meta.dirname;
const specPath = join(root, 'spec.json');
let busy = false;
export default defineConfig({
  server: { host: '127.0.0.1', fs: { strict: true, deny: ['**/spec.json', '**/revisions/**', '**/.env*', '**/.git/**'] } },
  plugins: [{ name: 'prototype-review', configureServer(server) {
    server.middlewares.use(async (req,res,next)=>{
      if (req.url !== '/__prototype') return next();
      res.setHeader('Content-Type','application/json'); res.setHeader('Cache-Control','no-store');
      try {
        const host = req.headers.host || '';
        if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw Error('Hôte local requis');
        if (req.headers.origin && req.headers.origin !== `http://${host}`) throw Error('Origine refusée');
        if (req.method === 'GET') { res.end(await readFile(specPath,'utf8')); return; }
        if (req.method !== 'POST' || req.headers['content-type'] !== 'application/json') throw Error('Requête refusée');
        if (busy) throw Error('Sauvegarde en cours, réessayer');
        busy=true;
        try {
          let raw=''; for await (const part of req) { raw+=part; if(Buffer.byteLength(raw)>1000000) throw Error('Spec trop volumineuse'); }
          const {spec, action} = JSON.parse(raw);
          if (!['save','validate'].includes(action)) throw Error('Action inconnue');
          validate(spec,action==='validate');
          const previous=JSON.parse(await readFile(specPath,'utf8'));
          if(spec.revision!==previous.revision) throw Error('Version modifiée ailleurs : recharger avant de sauvegarder');
          if(JSON.stringify(spec.library)!==JSON.stringify(previous.library)) throw Error('Changement de bibliothèque : recadrage requis');
          if(action==='validate') {
            if ((await readFile(join(root,'src/composition.jsx'),'utf8')).includes('PROTOTYPE_NOT_IMPLEMENTED')) throw Error('Composition non réalisée');
            await readFile(join(root,'pnpm-lock.yaml'),'utf8');
            const manifest=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
            const installed=JSON.parse(await readFile(join(root,'node_modules',spec.library.package,'package.json'),'utf8'));
            if(manifest.dependencies?.[spec.library.package]!==spec.library.version || installed.version!==spec.library.version) throw Error('Version du paquet différente de la spécification');
          }
          spec.revision=previous.revision+1;
          const tmp=specPath+'.tmp'; await writeFile(tmp,JSON.stringify(spec,null,2)+'\n'); await rename(tmp,specPath);
          let snapshot;
          if(action==='validate') {
            snapshot=`r${spec.revision}-${randomUUID().slice(0,8)}`;
            const staging=join(root,'revisions',`.pending-${snapshot}`), target=join(root,'revisions',snapshot);
            await mkdir(staging,{recursive:true});
            const files=['spec.json','package.json','pnpm-lock.yaml','index.html','vite.config.mjs','model.mjs','src'];
            for(const file of files) await cp(join(root,file),join(staging,file),{recursive:true});
            if(spec.library.package.startsWith('@exemple/')) await writeFile(join(staging,'.npmrc'),'@exemple:registry=https://npm.pkg.github.com\n'); // Ne jamais recopier des identifiants locaux.
            const hash=createHash('sha256');
            async function digest(dir,rel='') { for(const e of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
              const path=join(dir,e.name), name=rel+e.name;
              if(e.isDirectory()) await digest(path,name+'/'); else { hash.update(name+'\0'); hash.update(await readFile(path)); }
            }}
            await digest(staging); const sha=hash.digest('hex');
            await writeFile(join(staging,'issue.md'),issue(spec,snapshot,sha));
            await rename(staging,target);
          }
          res.end(JSON.stringify({spec,snapshot}));
        } finally { busy=false; }
      } catch(e) { res.statusCode=400; res.end(JSON.stringify({error:e.message})); }
    });
  }}]
});
