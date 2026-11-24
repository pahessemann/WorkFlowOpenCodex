import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as P from './pilote.mjs';

test('validation locale : SHA exact, travail propre et base inchangée', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-autonome-')); const repo = path.join(root, 'repo'); const etat = path.join(root, 'etat'); fs.mkdirSync(repo); fs.mkdirSync(path.join(etat, 'campagnes'), {recursive:true});
  const g = (...a) => { const r = spawnSync('git', ['-C', repo, ...a], {encoding:'utf8'}); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  g('init', '-b', 'main'); g('config', 'user.name', 'Test'); g('config', 'user.email', 'test@example.invalid'); fs.writeFileSync(path.join(repo, 'a'), 'initial'); g('add', 'a'); g('commit', '-m', 'initial'); g('update-ref', 'refs/remotes/origin/main', g('rev-parse', 'HEAD')); g('checkout', '-b', 'campagne'); fs.writeFileSync(path.join(repo, 'a'), 'candidat'); g('commit', '-am', 'candidat');
  fs.writeFileSync(path.join(etat, 'campagnes', 'c.json'), JSON.stringify({id:'c', projet:'projet', statut:'en_cours', items:[]})); const cfg={etat,workflow_autonome:true,projets:{projet:{branche_principale:'main'}}};
  const refus = (fn, titre) => assert.throws(fn, e => e instanceof P.Refus && e.titre === titre);
  refus(() => P.verifierValidationLocale(cfg,'c'), 'GO LOCAL ABSENT'); const p=P.presenterLocal(cfg,'c',{dossier:repo,branche:'campagne',lancer:'npm start puis tester le parcours'}); assert.equal(p.sha,g('rev-parse','HEAD')); assert.match(P.ligneEtat(cfg,'c').texte,/tester la version locale/);
  refus(() => P.validerLocal(cfg,'c','0'.repeat(40)), 'SHA NON PRÉSENTÉ'); P.validerLocal(cfg,'c',p.sha); assert.equal(P.verifierValidationLocale(cfg,'c').autorisee,true);
  fs.writeFileSync(path.join(repo,'a'),'changement non committé'); refus(() => P.verifierValidationLocale(cfg,'c'), 'VERSION MODIFIÉE'); g('checkout','--','a');
  g('update-ref','refs/remotes/origin/main',p.sha); refus(() => P.verifierValidationLocale(cfg,'c'), 'VERSION MODIFIÉE');
  fs.rmSync(root,{recursive:true,force:true});
});

test('profil autonome : preuve libre et escalade non imposée', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'dev-autonome-')); const f=path.join(root,'preuve.md'); fs.writeFileSync(f,'Test ciblé exécuté : sortie 0.'); assert.equal(P.verifierPreuveAutonome('DEV-1',f),1);
  assert.match(P.consigneAutonome({}, {id:'c'}), /GO explicite/); assert.match(P.consigneAutonome({}, {id:'c'}), /modèle/); assert.equal(P.gardeBoucle({workflow_autonome:true},'c','DEV-1','dev').issue,'DEV-1');
  assert.throws(() => P.refuserSiLivreParPaul({workflow_autonome:true,livraison_par_paul:['p']},{projet:'p'}), e => e.titre === 'LIVRAISON PAR PAUL' && /GO explicite/.test(e.message));
  const c={id:'c',projet:'p',items:[{type:'issue_standalone',linear_id:'DEV-1',projet:'p',statut:'en_cours',branche:'codex/issue-DEV-1',sha_reprise:'a'.repeat(40)},{type:'issue_standalone',linear_id:'DEV-2',projet:'p',statut:'en_attente',blocked_by:['DEV-1']}]};
  assert.equal(P.admissibilite({etat:root,workflow_autonome:true},c,c.items[1],{'DEV-1':'en_cours'}).ok,true);
  assert.equal(P.admissibilite({etat:root},c,c.items[1],{'DEV-1':'en_cours'}).ok,false);
  fs.rmSync(root,{recursive:true,force:true});
});
