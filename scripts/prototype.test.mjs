import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { validate, issue } from '../assets/prototype/model.mjs';
const fixture=()=>({schemaVersion:1,project:'test',page:'page',title:'Test',objective:'Vérifier le socle',scope:'Fixture uniquement',library:{package:'@exemple/ui',version:'0.3.1',theme:'commun',source:'fixture',storybook:'fixture'},shell:{sidebar:'Sidebar',topbar:'Topbar'},zones:[{id:'action',purpose:'Action',selected:'button',options:[{id:'button',component:'Button',import:'@exemple/ui',props:{children:'Action'},rationale:'Action simple'}],comments:[]}],behaviors:['Cliquer'],states:['Défaut'],dataBindings:[],acceptance:['Action visible'],checks:['Fixture'],blockers:[],revision:0});
test('Export bloqué pour manque ou sélection inexistante',()=>{
 let s=fixture();s.zones[0].comment='Commentaire libre';assert.match(issue(s,'r1','sha'),/Commentaire libre/);
 s=fixture();s.blockers.push('Composant manquant');assert.throws(()=>validate(s,true),/Manques/);
 s=fixture();s.zones[0].selected='inconnu';assert.throws(()=>validate(s),/Sélection/);
});
test('Export contient les choix et décisions validés',()=>{
 const s=fixture();s.zones[0].comments.push({text:'Quel bouton ?',resolved:true,decision:'Conserver Button'});
 const result=issue(s,'r1','sha');assert.match(result,/@exemple\/ui@0.3.1/);assert.match(result,/Conserver Button/);assert.match(result,/"children": "Action"/);
});
test('Initialisation isolée, aucun écrasement, index et dépendance exacte',async()=>{
 const root=await mkdtemp(join(tmpdir(),'prototype-test-'));
 try {
   const file=join(root,'input.json');await writeFile(file,JSON.stringify(fixture()));
   const args=[fileURLToPath(new URL('./prototype.mjs',import.meta.url)),'init','--root',root,'--spec',file];
   execFileSync(process.execPath,args);
   const p=JSON.parse(await readFile(join(root,'projets/test/page/package.json')));assert.equal(p.dependencies['@exemple/ui'],'0.3.1');
   assert.match(await readFile(join(root,'index.html'),'utf8'),/Brouillon r0/);
   assert.throws(()=>execFileSync(process.execPath,args,{stdio:'pipe'}),/Command failed/);
 } finally { await rm(root,{recursive:true,force:true}); } // Fixture /tmp explicitement jetable.
});
test('Variante effective identique dans le rendu et les consignes, sans perdre les props de base',async()=>{
 const {effectiveOption,renderSpec}=await import('../assets/prototype/model.mjs');
 const s=fixture(),o=s.zones[0].options[0];o.variants=[{id:'secondary',label:'Secondaire',props:{variant:'secondary'}}];o.selectedVariant='secondary';
 assert.equal(effectiveOption(o).props.children,'Action');
 assert.equal(renderSpec(s).zones[0].options[0].props.variant,'secondary');
 assert.match(issue(s,'r1','sha'),/Variante : Secondaire/);
 assert.match(issue(s,'r1','sha'),/"variant": "secondary"/);
 o.selectedVariant='missing';assert.throws(()=>validate(s),/Variante inconnue/);
});
test('Vérification sans export disque : zones inconnues, version et brouillon incomplet',async()=>{
 const {checkPrototype}=await import('./prototype-check.mjs');
 const root=await mkdtemp(join(tmpdir(),'check-'));
 try {
  const {mkdir,readdir}=await import('node:fs/promises');await mkdir(join(root,'src'));
  const s=fixture();await writeFile(join(root,'spec.json'),JSON.stringify(s));
  await writeFile(join(root,'package.json'),JSON.stringify({dependencies:{'@exemple/ui':'0.3.1'}}));
  await writeFile(join(root,'src/composition.jsx'),'<Zone id="action"><Button/></Zone>');
  assert.equal((await checkPrototype(root)).export,'prêt');
  assert.equal((await readdir(root)).includes('revisions'),false);
  await writeFile(join(root,'src/composition.jsx'),'<Zone id="absente"/>');
  await assert.rejects(checkPrototype(root),/Zone inconnue/);
  await writeFile(join(root,'src/composition.jsx'),'<Zone id={dynamic}/>');
  assert.ok((await checkPrototype(root)).warnings.length);
  s.blockers=['Choix manquant'];await writeFile(join(root,'spec.json'),JSON.stringify(s));
  assert.equal((await checkPrototype(root)).export,'incomplet');
  await writeFile(join(root,'package.json'),'{}');await assert.rejects(checkPrototype(root),/Version/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('Reprise conserve le responsable et refuse une reprise concurrente',async()=>{
 const root=await mkdtemp(join(tmpdir(),'resume-'));
 try {
  await writeFile(join(root,'spec.json'),JSON.stringify({...fixture(),coreVersion:'0.2.0'}));
  const args=[fileURLToPath(new URL('./prototype.mjs',import.meta.url)),'resume','--dir',root];
  execFileSync(process.execPath,[...args,'--owner','discussion-a']);
  assert.equal(JSON.parse(execFileSync(process.execPath,args)).owner,'discussion-a');
  assert.throws(()=>execFileSync(process.execPath,[...args,'--owner','discussion-b'],{stdio:'pipe'}));
  assert.equal(JSON.parse(await readFile(join(root,'prototype.local.json'))).owner,'discussion-a');
 }finally{await rm(root,{recursive:true,force:true});}
});
