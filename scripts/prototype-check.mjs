import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { validate, issue } from '../assets/prototype/model.mjs';

// Lecture seule : aucun serveur, installation, export validé ou publication.
export async function checkPrototype(dir) {
 const spec=validate(JSON.parse(await readFile(join(dir,'spec.json'),'utf8')));
 const ids=new Set(spec.zones.map(z=>z.id)), used=new Set(), warnings=[];
 async function scan(folder) {
  for(const entry of await readdir(folder,{withFileTypes:true})) {
   const path=join(folder,entry.name);
   if(entry.isDirectory()) {await scan(path);continue;}
   if(!/\.[jt]sx?$/.test(entry.name)||['main.jsx','editor.jsx','context-menu.jsx','export-dialog.jsx'].includes(entry.name))continue;
   const source=await readFile(path,'utf8');
   if(source.includes('PROTOTYPE_NOT_IMPLEMENTED'))throw Error('Composition non réalisée');
   // IDs littéraux de Zone et des adaptateurs de composants (zoneId).
   for(const match of source.matchAll(/\b(?:id|zoneId)\s*=\s*(?:["']([^"']+)["']|\{\s*["']([^"']+)["']\s*\})/g)) {
    const id=match[1]||match[2];
    // id HTML ordinaire : contrôler seulement les balises de revue.
    const start=source.lastIndexOf('<',match.index);
    if(!/^<(?:Zone|Review\w+)\b/.test(source.slice(start,match.index)))continue;
    if(!ids.has(id))throw Error(`Zone inconnue : ${id} (${entry.name})`);
    used.add(id);
   }
   if(/\b(?:id|zoneId)\s*=\s*\{(?!\s*["'])/.test(source))warnings.push(`${entry.name} : références dynamiques à vérifier dans le rendu`);
  }
 }
 await scan(join(dir,'src'));
 const pkg=JSON.parse(await readFile(join(dir,'package.json'),'utf8'));
 if(pkg.dependencies?.[spec.library.package]!==spec.library.version)throw Error('Version du manifeste différente de la spec');
 for(const id of ids)if(!used.has(id))warnings.push(`${id} : pas de référence littérale détectée ; vérifier le raccordement`);
 // Exerce la génération sans contourner les conditions de validation finale.
 let exportStatus='prêt';
 try {issue(spec,'verification','non-publie');} catch(e) {
  if(spec.blockers.length||!spec.acceptance.length||!spec.checks.length||!spec.states.length) {exportStatus='incomplet';warnings.push(`Export final bloqué : ${e.message}`);} else throw e;
 }
 return {zones:ids.size,literalReferences:used.size,export:exportStatus,warnings};
}
