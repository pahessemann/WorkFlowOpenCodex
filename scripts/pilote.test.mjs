import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as P from './pilote.mjs';

const OPUS = 'claude-opus-5-5', SONNET = 'claude-sonnet-5-5', HAIKU = 'claude-haiku-5-5', FABLE51 = 'claude-fable-5-1', FABLE52 = 'claude-fable-5-2';
export function configTest(extra = {}) {
  const etat = fs.mkdtempSync(path.join(os.tmpdir(), 'pilote-'));
  return { hote: 'local', deploiement_serveurs: true, etat, admission: { dev_max: 4, lourdes_max: 1 },
    modeles: { cerveau: OPUS, dev: [OPUS, SONNET], controle: [SONNET, 'gpt-6.2-sol'], ouvrier: [HAIKU, 'gpt-6-luna'],
      lecteur: { jusqu_a_100k: HAIKU, au_dela: SONNET, fallback: 'gpt-6.1-terra' }, second_regard: 'gpt-6.2-astra', recours: FABLE51, oeil: FABLE51,
      reserve_paul: [FABLE52], sous_agents: [HAIKU, OPUS, FABLE51, 'gpt-6-luna'], fable_autorise: false },
    contexte: { resume_large_max_tokens: 8000, log_brut_max_tokens: 2000 }, ...extra };
}
const code = (fn) => { try { fn(); return 0; } catch (e) { assert.ok(e instanceof P.Refus, e.stack); return e.titre; } };

test('les 5 cas de routage exigés', () => {
  const c = configTest();
  assert.equal(P.router(c, { tache: 'dev', criticite: 'standard', volumetrie: 'compact' }).modele, OPUS);
  const large = P.router(c, { tache: 'dev', criticite: 'standard', volumetrie: 'large', entree: 40000 });
  assert.equal(large.lecteur, HAIKU); assert.equal(large.executant, OPUS); assert.equal(large.budget_resume_tokens, 8000);
  assert.equal(P.router(c, { tache: 'tests', criticite: 'sensible', volumetrie: 'compact' }).modele, OPUS);
  assert.equal(P.router(c, { tache: 'pilotage', criticite: 'leger', volumetrie: 'compact' }).modele, HAIKU);
  const revue = P.router(c, { tache: 'revue', criticite: 'standard', volumetrie: 'large', entree: 30000 });
  assert.equal(revue.lecteur, HAIKU); assert.equal(revue.executant, SONNET);
});

test('en sous-agent : revue sur Opus à neuf, tests sur Haiku, jamais de modèle indisponible', () => {
  const c = configTest();
  const r = P.router(c, { tache: 'revue', criticite: 'standard', sousAgent: true });
  assert.equal(r.modele, OPUS); assert.match(r.consigne, /à neuf/);
  assert.equal(P.router(c, { tache: 'tests', criticite: 'standard', sousAgent: true }).modele, HAIKU);
  for (const tache of Object.keys(P.MATRICE)) for (const criticite of P.CRITICITES) for (const volumetrie of ['compact', 'large']) {
    if (tache === 'recette-milestone') continue;
    const x = P.router(c, { tache, criticite, volumetrie, sousAgent: true, entree: volumetrie === 'large' ? 150000 : 0 });
    for (const m of [x.modele, x.fallback, x.lecteur].filter(Boolean)) assert.ok(c.modeles.sous_agents.includes(m), tache + ' ' + criticite + ' ' + volumetrie + ' -> ' + m);
  }
});

test('recette de Milestone : Sonnet en chat TEST, refusée en sous-agent', () => {
  const c = configTest();
  assert.equal(P.router(c, { tache: 'recette-milestone', criticite: 'standard' }).modele, SONNET);
  assert.equal(code(() => P.router(c, { tache: 'recette-milestone', criticite: 'standard', sousAgent: true })), 'MODÈLE INDISPONIBLE');
});

test('proportionnalité : une tâche triviale reste sur Haiku dans une campagne sensible', () => {
  const c = configTest();
  assert.equal(P.router(c, { tache: 'dev', criticite: 'sensible', trivial: true }).modele, HAIKU);
});

test('Fable 5.2 n’est jamais routé ; choix visuels sur Fable 5.1 ; img2code non repris', () => {
  const c = configTest();
  assert.equal(P.router(c, { tache: 'choix-visuel', criticite: 'standard', sousAgent: true }).modele, FABLE51);
  const c2 = configTest(); c2.modeles.oeil = FABLE52;
  assert.equal(code(() => P.router(c2, { tache: 'choix-visuel', criticite: 'leger' })), 'MODÈLE RÉSERVÉ À PAUL');
  assert.equal(code(() => P.router(c, { tache: 'img2code', criticite: 'standard' })), 'TÂCHE NON REPRISE');
});

test('gardes de volume et refus fournisseur', () => {
  const c = configTest();
  assert.notEqual(P.router(c, { tache: 'pilotage', criticite: 'leger', entree: 150000 }).modele, HAIKU);
  P.refus(c, SONNET, 'HTTP 429 rate_limit_error');
  assert.equal(P.router(c, { tache: 'revue', criticite: 'standard' }).modele, 'gpt-6.2-sol');
});

test('escalade et circuit-breaker', () => {
  const c = configTest();
  assert.equal(P.escalade(c, { criticite: 'leger', essai: 2 }).modele, SONNET);
  assert.equal(P.escalade(c, { criticite: 'standard', essai: 3, nature: 'bug' }).modele, 'gpt-6.2-astra');
  assert.equal(code(() => P.escalade(c, { criticite: 'standard', essai: 4 })), 'CIRCUIT-BREAKER');
  P.composer(c, { nom: 'essai-cb', projet: 'p', ids: ['DEV-1'] });
  P.essai(c, 'essai-cb', 'DEV-1', 'echec'); P.essai(c, 'essai-cb', 'DEV-1', 'echec');
  const r = P.essai(c, 'essai-cb', 'DEV-1', 'echec');
  assert.equal(r.statut, 'bloquee'); assert.equal(r.attempts, 3);
});

test('déploiement refusé sur atelier, autorisé à préparer sur le poste', () => {
  assert.equal(code(() => P.deployer(configTest({ hote: 'atelier', deploiement_serveurs: false }), 'deployeur', 'serveur1')), 'DÉPLOIEMENT REFUSÉ SUR CET HÔTE');
  const r = spawnSync(process.execPath, [new URL('./pilote.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'deployer', 'deployeur', 'serveur1'], { encoding: 'utf8', env: { ...process.env, PILOTE_CONFIG: ecrireConfig(configTest({ hote: 'atelier', deploiement_serveurs: false })) } });
  assert.equal(r.status, 3); assert.match(r.stderr, /DÉPLOIEMENT REFUSÉ/);
  assert.match(P.deployer(configTest(), 'deployeur', 'serveur1').consigne, /GO/);
});
function ecrireConfig(c) { const f = path.join(c.etat, 'poste.local.json'); fs.writeFileSync(f, JSON.stringify(c)); return f; }

test('campagne : brouillon, contrat obligatoire, lancement, statuts fermés, titre', () => {
  const c = configTest();
  P.composer(c, { nom: 'refonte', projet: 'mon-api', ids: ['DEV-101', 'DEV-102'] });
  assert.equal(code(() => P.lancer(c, 'refonte')), 'CONTRAT NON VALIDÉ');
  fs.writeFileSync(path.join(c.etat, 'campagnes', 'refonte.contrat.md'), '# Contrat');
  P.validerContrat(c, 'refonte');
  const l = P.lancer(c, 'refonte', 'auto');
  assert.equal(l.statut, 'en_cours'); assert.equal(l.titre, '🟢 AUTO · mon-api · refonte · 0%'); assert.equal(l.dossier, '01 Campagnes');
  assert.equal(code(() => P.statutIssue(c, 'refonte', 'DEV-101', 'termine')), 'STATUT INCONNU');
  assert.equal(code(() => P.statutIssue(c, 'refonte', 'DEV-101', 'close')), 'PREUVE DE RECETTE ABSENTE');
  const preuve = path.join(c.etat, 'DEV-101.recette.json');
  fs.writeFileSync(preuve, JSON.stringify({ issue: 'DEV-101', criteres: [{ critere: 'export refusé sans période', controle: 'dialogue sans période', resultat: 'echec' }] }));
  assert.equal(code(() => P.statutIssue(c, 'refonte', 'DEV-101', 'close', preuve)), 'RECETTE INCOMPLÈTE');
  fs.writeFileSync(preuve, JSON.stringify({ issue: 'DEV-101', criteres: [{ critere: 'export refusé sans période', controle: 'dialogue sans période', resultat: 'ok', preuve: 'capture 01' }, { critere: 'rendu tablette', controle: 'aucun', resultat: 'non_applicable', justification: 'tablette physique réservée à Paul' }] }));
  P.statutIssue(c, 'refonte', 'DEV-101', 'close', preuve);
  assert.equal(P.titreCampagne(P.lireCampagne(c, 'refonte')).titre, '🟢 AUTO · mon-api · refonte · 50%');
  assert.equal(P.titre('TEST', 'mon-api', 'ms auth-core').dossier, '04 Relais & maintenance');
});

test('$dev aide : création, ouverture sans doublon, SKILL.md modifié, archivage, nettoyeur', () => {
  const c = configTest({ skill_md: 'SKILL.md' }); fs.writeFileSync(path.join(c.etat, 'SKILL.md'), 'v1');
  const A = (id, extra = {}) => ({ id, titre: P.TITRE_AIDE, archive: false, maj: '2026-11-19T10:00:00Z', ...extra });
  let r = P.aide(c, { chats: [] });
  assert.equal(r.action, 'creer'); assert.equal(r.raison, 'absent'); assert.equal(r.creation.modele, 'gpt-6-luna'); assert.equal(r.creation.dossier, '00 Accueil');
  assert.ok(r.creation.premier_message.startsWith('▣ ❓ AIDE — workflow')); assert.ok(r.creation.premier_message.includes('« ⚠ Workflow : »'));
  P.enregistrerAide(c, 'T1', 'gpt-6-luna');
  r = P.aide(c, { chats: [A('T1')] }); assert.equal(r.action, 'ouvrir'); assert.deepEqual(r.archiver, []);
  r = P.aide(c, { chats: [A('T1'), A('T0', { maj: '2026-11-18T10:00:00Z' })] }); assert.equal(r.action, 'ouvrir'); assert.deepEqual(r.archiver, ['T0']); assert.equal(r.signalements.length, 1);
  fs.writeFileSync(path.join(c.etat, 'SKILL.md'), 'v2');
  r = P.aide(c, { chats: [A('T1')] }); assert.equal(r.action, 'maj'); assert.match(r.message, /^ℹ SKILL\.md mis à jour le .+ : relis-le avant de répondre$/);
  P.enregistrerAide(c, 'T1'); assert.equal(P.aide(c, { chats: [A('T1')] }).action, 'ouvrir');
  r = P.aide(c, { chats: [A('T1', { archive: true })] }); assert.equal(r.action, 'creer'); assert.equal(r.raison, 'archivé'); assert.deepEqual(r.archiver, []);
  r = P.aide(c, { chats: [A('T9')] }); assert.equal(r.raison, 'non enregistré'); assert.deepEqual(r.archiver, ['T9']);
  r = P.aide(c, { chats: [A('T1')], recreer: true }); assert.equal(r.action, 'creer'); assert.deepEqual(r.archiver, ['T1']);
  r = P.aide(c, { chats: [], indisponibles: ['gpt-6-luna'] }); assert.equal(r.creation.modele, 'claude-haiku-5-5'); assert.match(r.signalements[0], /indisponible/);
  const vieux = '2026-11-01T10:00:00Z';
  assert.deepEqual(P.candidatsNettoyeur(c, [A('T1', { titre: P.TITRE_AIDE + ' ✅', maj: vieux }), { id: 'X', titre: '🟢 AUTO · p · x · 100% · ✅', maj: vieux }, { id: 'T1', titre: 'autre ✅', maj: vieux }], { maintenant: new Date('2026-11-19') }), ['X']);
});

test('réglage d’exécution appliqué à chaque tour', () => {
  assert.deepEqual(P.parametresTour(configTest({ execution: { sandbox: 'danger-full-access', approvalPolicy: 'never' } })), { approvalPolicy: 'never', sandboxPolicy: { type: 'dangerFullAccess' } });
});

test('ouvrir : worktree, branche distante, fichiers hors Git, compte exclusif puis rendu', () => {
  const g = (cwd, ...a) => { const r = spawnSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.autocrlf=false', ...a], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'depot-'));
  const origine = path.join(base, 'origine.git'), depot = path.join(base, 'depot');
  spawnSync('git', ['init', '-q', '--bare', '-b', 'main', origine]);
  spawnSync('git', ['clone', '-q', origine, depot]);
  fs.writeFileSync(path.join(depot, 'README.md'), 'x\n'); g(depot, 'add', '.'); g(depot, 'commit', '-q', '-m', 'init'); g(depot, 'push', '-q', 'origin', 'HEAD:main');
  fs.writeFileSync(path.join(depot, 'AGENTS.override.md'), 'local\n');
  fs.writeFileSync(path.join(depot, '.env.local'), 'APP_SANDBOX_TEST_1_USERNAME="u1"\nAPP_SANDBOX_TEST_1_PASSWORD="p1"\n');
  const c = configTest({ worktrees: path.join(base, 'wt'), projets: { demo: { chemin: depot, main_deploie: false, hors_git: ['AGENTS.override.md'] } } });
  P.composer(c, { nom: 'demo-c', projet: 'demo', ids: ['DEV-7', 'DEV-8'] });
  const o = P.ouvrir(c, 'demo-c', 'DEV-7', { compte: 'APP_SANDBOX_TEST' });
  assert.equal(o.statut, 'preflight'); assert.equal(o.compte.numero, 1);
  assert.equal(fs.readFileSync(path.join(o.worktree, 'AGENTS.override.md'), 'utf8'), 'local\n');
  assert.match(fs.readFileSync(path.join(o.worktree, '.env.local'), 'utf8'), /APP_SANDBOX_TEST_USERNAME="u1"/);
  assert.ok(g(depot, 'ls-remote', 'origin', 'codex/issue-DEV-7').length > 0);
  assert.equal(code(() => P.ouvrir(c, 'demo-c', 'DEV-8', { compte: 'APP_SANDBOX_TEST' })), 'COMPTE INDISPONIBLE');
  assert.match(P.rendre(c, 'demo-c', 'DEV-7').compte_rendu, /APP_SANDBOX_TEST_1/);
  assert.equal(P.ouvrir(c, 'demo-c', 'DEV-8', { compte: 'APP_SANDBOX_TEST' }).compte.numero, 1);
  // Campagne multi-dépôts : l'issue porte son propre projet.
  const m = configTest({ worktrees: path.join(base, 'wt2'), projets: { autre: { chemin: depot, main_deploie: false } } });
  P.composer(m, { nom: 'multi', projet: 'inexistant', depuis: (() => { const f = path.join(base, 'items.json'); fs.writeFileSync(f, JSON.stringify([{ type: 'issue_standalone', linear_id: 'DEV-11', projet: 'autre' }])); return f; })() });
  assert.equal(P.ouvrir(m, 'multi', 'DEV-11').statut, 'preflight');
  const p = configTest({ projets: { absent: { chemin: path.join(base, 'nexistepas') } } });
  P.composer(p, { nom: 'pf', projet: 'absent', ids: ['DEV-9'] });
  assert.equal(code(() => P.ouvrir(p, 'pf', 'DEV-9')), 'PRÉFLIGHT TECHNIQUE BLOQUÉ');
  assert.equal(P.issues(P.lireCampagne(p, 'pf'))[0].statut, 'bloquee');
});

test('chaque commande $dev a son contrat ; img2code refusé', () => {
  for (const cmd of Object.keys(P.COMMANDES)) assert.ok(P.contrat(cmd).existe, cmd);
  assert.equal(code(() => P.contrat('img2code')), 'COMMANDE NON REPRISE');
});


test('charge lourde : un seul créneau, le second attend la fin du premier', () => {
  const c = configTest(); P.composer(c, { nom: 'lourd', projet: 'p', ids: ['DEV-1'] });
  const f = P.prendreCreneauLourd(c, 'lourd');
  assert.equal(code(() => P.prendreCreneauLourd(c, 'lourd', { attenteMax: 300, pas: 100 })), 'CRÉNEAU LOURD INDISPONIBLE');
  fs.rmSync(f);
  const r = P.lourde(c, 'lourd', [process.execPath, '-e', 'process.exit(0)']);
  assert.equal(r.code, 0);
  assert.equal(fs.readdirSync(path.join(c.etat, 'lourdes', 'lourd')).length, 0);
  fs.writeFileSync(path.join(c.etat, 'lourdes', 'lourd', '1.lock'), JSON.stringify({ pid: 999999 }));
  assert.ok(P.prendreCreneauLourd(c, 'lourd', { attenteMax: 300, pas: 100 }), 'verrou orphelin repris');
});

test('charges lourdes : plusieurs par campagne, plafond hôte commun', () => {
  const c = configTest({ admission: { dev_max: 4, lourdes_max: 3, lourdes_max_hote: 4 } });
  P.composer(c, { nom: 'lourd-a', projet: 'p', ids: ['DEV-1'] }); P.composer(c, { nom: 'lourd-b', projet: 'p', ids: ['DEV-2'] });
  for (let i = 0; i < 3; i++) assert.ok(P.prendreCreneauLourd(c, 'lourd-a', { attenteMax: 300, pas: 100 }));
  assert.equal(code(() => P.prendreCreneauLourd(c, 'lourd-a', { attenteMax: 300, pas: 100 })), 'CRÉNEAU LOURD INDISPONIBLE');
  assert.ok(P.prendreCreneauLourd(c, 'lourd-b', { attenteMax: 300, pas: 100 }));
  assert.equal(code(() => P.prendreCreneauLourd(c, 'lourd-b', { attenteMax: 300, pas: 100 })), 'CRÉNEAU LOURD INDISPONIBLE');
});

test('fiche : mention de modèle ignorée et signalée, Fable 5.2 réservé à Paul ; livrable sans code', () => {
  const c = configTest();
  const m = P.mentionsModele(c, 'Utiliser Fable 5.2 pour les visuels, puis un modèle Claude plus modeste.');
  assert.deepEqual(m.map((x) => x.modele), ['claude-fable-5-2']); assert.equal(m[0].reserve_paul, true);
  assert.match(P.signalementModele('DEV-1335', m[0]), /réservé à Paul : à lancer à la main si Paul le souhaite$/);
  assert.deepEqual(P.mentionsModele(c, 'Critères : écran de connexion.'), []);
  assert.equal(P.natureFiche('Aucun code. ## Recette développeur Statut : SANS OBJET'), 'livrable');
  assert.equal(P.natureFiche('Recette développeur : REQUISE'), 'code');
});

test('chats de travail : créés par pilote.mjs en accès de l’hôte ; accès restreint relancé sans élévation', async () => {
  const c = configTest({ hote: 'atelier', execution: { sandbox: 'danger-full-access', approvalPolicy: 'never' } }); c.appServerFactice = path.join(c.etat, 'as.jsonl');
  const r = await P.ouvrirChatTravail(c, { role: 'DEV', projet: 'p', objet: '#1 x', modele: 'claude-opus-5-5', consigne: 'Traiter DEV-1.' });
  const appels = () => fs.readFileSync(c.appServerFactice, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const tour = appels().find((x) => x.method === 'turn/start');
  assert.deepEqual(tour.params.sandboxPolicy, { type: 'dangerFullAccess' }); assert.equal(tour.params.approvalPolicy, 'never');
  assert.match(tour.params.input[0].text, /ne demande JAMAIS d'élévation/); assert.match(tour.params.input[0].text, new RegExp('acces-restreint ' + r.chat));
  assert.equal((await P.reveil(c)).length, 0, 'chat sain : aucune relance');
  c.appServerFacticeMessage = P.MARQUE_RESTREINT + '\nécriture refusée';
  const rv = await P.reveil(c); assert.equal(rv[0].action, 'relance-acces');
  const relance = appels().filter((x) => x.method === 'turn/start').at(-1);
  assert.deepEqual(relance.params.sandboxPolicy, { type: 'dangerFullAccess' }); assert.doesNotMatch(JSON.stringify(appels()), /escalat|requestApproval/i);
  assert.equal(P.accesRestreint(c, r.chat).signale, true);
  await assert.rejects(P.ouvrirChatTravail({ ...c, appServerFactice: null, appServerSocket: null, ssh: {} }, { role: 'DEV', projet: 'p', objet: 'x', modele: 'm' }), (e) => e.titre === 'APP-SERVER INDISPONIBLE');
});

test('$dev livrer : poste seulement, GO et plan figés, répétition à blanc, arrêt à la première erreur', async () => {
  const c = configTest({ deploiement_serveurs: true, maintien_eveille: false }); c.appServerFactice = path.join(c.etat, 'as.jsonl');
  const journalSsh = path.join(c.etat, 'ssh.jsonl'); const scenario = path.join(c.etat, 'scenario.json');
  const ecrireScenario = (x) => fs.writeFileSync(scenario, JSON.stringify({ journal: journalSsh, ...x })); ecrireScenario({});
  process.env.FAUX_SSH_SCENARIO = scenario; c.ssh_commande = [process.execPath, fileURLToPath(new URL('./faux-ssh.mjs', import.meta.url))];
  const paquet = path.join(c.etat, 'paquet.tgz'); fs.writeFileSync(paquet, 'octets'); const retour = path.join(c.etat, 'retour.md'); fs.writeFileSync(retour, '# retour');
  P.composer(c, { nom: 'livr', projet: 'deployeur', ids: ['DEV-9'], mode: 'supervise', hoteLivraison: 'local' });
  P.modifierCampagne(c, 'livr', (x) => { x.chat = 'chat-sup'; x.chat_modele = 'claude-haiku-5-5'; });
  const plan = path.join(c.etat, 'plan-livraison.md');
  const corps = (etapes) => '# Plan\n\n' + '```json livraison\n' + JSON.stringify({ cibles: { serveur1: { ssh: 'serveur1', chemin_disque: '/', disque_min_gio: 2, version: 'cat /srv/VERSION' } }, paquet: { chemin: paquet, sha256: P.sha256Fichier(paquet) }, retour_arriere: { procedure: retour }, etapes, verification: [{ cible: 'serveur1', titre: 'santé', commande: 'curl -fsS http://127.0.0.1/sante', attendu: 'ok' }] }, null, 1) + '\n```\n';
  const etapes = [{ id: '1', titre: 'copie', cible: 'serveur1', commande: 'deposer-paquet', retour: 'RETOUR-1' }, { id: '2', titre: 'bascule', cible: 'serveur1', commande: 'basculer-version', retour: 'RETOUR-2' }];
  fs.writeFileSync(plan, corps(etapes));
  await assert.rejects(P.executerLivraison({ ...c, deploiement_serveurs: false }, 'livr'), (e) => e.titre === 'LIVRAISON REFUSÉE SUR CET HÔTE' && e.code === 6);
  await assert.rejects(P.executerLivraison(c, 'livr'), (e) => e.titre === 'GO ABSENT');
  P.goLivraison(c, 'livr', plan);
  fs.appendFileSync(plan, '\n<!-- retouche après GO -->\n');
  await assert.rejects(P.executerLivraison(c, 'livr'), (e) => e.titre === 'PLAN MODIFIÉ DEPUIS LE GO');
  fs.writeFileSync(plan, corps(etapes)); P.goLivraison(c, 'livr', plan);
  ecrireScenario({ libre_ko: 100000 });
  let r = await P.executerLivraison(c, 'livr'); assert.equal(r.code, 7); assert.match(r.message, /disque serveur1/);
  const cmds = () => fs.readFileSync(journalSsh, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).commande);
  assert.ok(!cmds().includes('deposer-paquet'), 'aucune étape après une répétition en échec');
  assert.match(P.titreCampagne(P.lireCampagne(c, 'livr')).titre, /⛔ BLOQUÉ/);
  ecrireScenario({ echecs: ['basculer-version'] });
  r = await P.executerLivraison(c, 'livr', { aBlanc: true }); assert.equal(r.code, 0); assert.ok(!cmds().includes('deposer-paquet'), 'à blanc : aucune étape');
  r = await P.executerLivraison(c, 'livr'); assert.equal(r.code, 8); assert.match(r.message, /étape 2/); assert.match(r.message, /RETOUR-2/); assert.match(r.message, /NON exécuté/);
  assert.ok(!cmds().some((x) => x.startsWith('RETOUR')), 'le retour arrière n’est jamais exécuté'); assert.equal(cmds().filter((x) => x === 'basculer-version').length, 1, 'aucun nouvel essai');
  assert.ok(fs.readFileSync(path.join(r.journal, 'journal.log'), 'utf8').includes('étape 2'));
  const posts = fs.readFileSync(c.appServerFactice, 'utf8');
  assert.match(posts, /démarrée sur le poste\. Journal : /); assert.match(posts, /RETOUR-2/);
  await assert.rejects(P.executerLivraison(c, 'livr'), (e) => e.titre === 'GO DÉJÀ UTILISÉ');
  ecrireScenario({}); P.goLivraison(c, 'livr', plan);
  r = await P.executerLivraison(c, 'livr'); assert.equal(r.code, 0); assert.match(r.message, /✅ Livraison livr terminée/); assert.match(r.message, /Versions en place/);
  assert.doesNotMatch(P.titreCampagne(P.lireCampagne(c, 'livr')).titre, /⛔/);
});


test('reprise automatique : les limites d’admission figurent en clair dans le message (v2.4.3)', async () => {
  const c = configTest({ hote: 'atelier', admission: { dev_max: 6, lourdes_max: 4, lourdes_max_hote: 8 }, execution: { sandbox: 'danger-full-access', approvalPolicy: 'never' } }); c.appServerFactice = path.join(c.etat, 'as.jsonl');
  fs.mkdirSync(path.join(c.etat, 'campagnes'), { recursive: true });
  fs.writeFileSync(path.join(c.etat, 'campagnes', 'x.json'), JSON.stringify({ id: 'x', projet: 'p', mode: 'auto', statut: 'en_cours', chat: 'C1', chat_modele: 'm', items: [{ type: 'issue_standalone', linear_id: 'DEV-1', statut: 'en_attente', blocked_by: [] }] }));
  const rv = await P.reveil(c); assert.ok(['reprise', 'digest'].includes(rv[0].action), JSON.stringify(rv));
  const tour = fs.readFileSync(c.appServerFactice, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.method === 'turn/start').at(-1);
  assert.match(tour.params.input[0].text, /6 développements actifs et 4 charges lourdes par campagne, 8 sur l'hôte/);
  assert.match(tour.params.input[0].text, /priment .* sur toute décision antérieure du journal/);
});

test('ligne d’état : 5 états lus, ligne absente ou incomplète refusée (v2.5)', () => {
  for (const [icone, etat] of Object.entries(P.ETATS_LIGNE)) { const l = P.formatLigne(icone, 'fait  quelque chose', 'rien'); assert.equal(P.lireLigneEtat('Bilan.\n\n' + l).etat, etat); }
  assert.equal(P.lireLigneEtat('Bilan sans ligne d’état'), null);
  assert.equal(P.lireLigneEtat('▶ EN COURS · il manque le segment Toi'), null);
  const go = P.lireLigneEtat('**⏸️ À TOI · GO de livraison prêt · Toi : $dev livrer x**'); assert.equal(go.statut, 'attente_go'); assert.equal(go.suffixe, '⏸ GO');
});

test('passerelle poste : dépôt hors quota, relève, preuves, retour, essais selon la cause, délai dépassé (v2.5)', () => {
  const at = configTest({ hote: 'atelier', deploiement_serveurs: false, admission: { dev_max: 1, lourdes_max: 1 } });
  const fa = path.join(at.etat, 'atelier.json'); fs.writeFileSync(fa, JSON.stringify(at));
  fs.mkdirSync(path.join(at.etat, 'campagnes'), { recursive: true });
  fs.writeFileSync(path.join(at.etat, 'campagnes', 'k.json'), JSON.stringify({ id: 'k', projet: 'p', mode: 'auto', statut: 'en_cours', items: [{ type: 'issue_standalone', linear_id: 'DEV-1', statut: 'revue', blocked_by: [] }, { type: 'issue_standalone', linear_id: 'DEV-2', statut: 'en_attente', blocked_by: ['DEV-1'] }] }));
  const actifs = () => P.actifsAdmission(P.issues(P.lireCampagne(at, 'k'))).length;
  assert.equal(actifs(), 1);
  const d = P.posteDeposer(at, 'k', 'DEV-1', { fiche: 'Rejouer P04 sur Windows au SHA abc', reglages: ['imprimante par défaut : Microsoft Print to PDF'] });
  assert.equal(actifs(), 0, 'une issue en file poste sort du quota dev_max');
  assert.equal(code(() => P.posteDeposer(at, 'k', 'DEV-1', { fiche: 'x' })), 'TÂCHE DÉJÀ EN FILE');
  assert.deepEqual(P.contexte(at, 'k').a_relancer, []);
  assert.match(P.ligneEtat(at, 'k').ligne, /^⏳ EN ATTENTE · retour du poste Windows attendu pour DEV-1 · Toi : ouvrir ta session sur le poste/);
  const session = path.join(at.etat, 'session.mjs');
  fs.writeFileSync(session, "import fs from 'node:fs'; import path from 'node:path'; const d = process.env.PASSERELLE_TRAVAIL; const consigne = fs.readFileSync(0, 'utf8'); fs.writeFileSync(path.join(d, 'preuves', 'matrice.json'), JSON.stringify({ reglages: consigne.includes('Microsoft Print to PDF'), sansGestionnaire: consigne.includes('gestionnaire de mots de passe'), ligneDirigee: consigne.includes('✅ TERMINÉ si le résultat est ok') })); fs.writeFileSync(path.join(d, 'retour.md'), 'DEV-1 : P04 ok'); fs.writeFileSync(path.join(d, 'resultat.json'), JSON.stringify({ resultat: 'ok' })); console.log('fini\\n✅ TERMINÉ · P04 rejoué sur Windows · Toi : rien');");
  const po = configTest({ hote: 'local', atelier_simule: fa, passerelle: { actif: true, dossier_travail: path.join(at.etat, 'travail'), commande_test: [process.execPath, session] } });
  const rel = P.posteRelever(po);
  assert.equal(rel.resultat, 'ok'); assert.equal(rel.preuves_deposees, true); assert.match(rel.ligne, /^✅ TERMINÉ · P04/);
  const preuve = JSON.parse(fs.readFileSync(path.join(at.etat, 'poste', 'retours', d.tache, 'preuves', 'matrice.json'), 'utf8'));
  assert.deepEqual(preuve, { reglages: true, sansGestionnaire: true, ligneDirigee: true }, 'la consigne de la session porte les réglages permis et les règles du poste');
  assert.equal(P.contexte(at, 'k').retours_poste[0].issue, 'DEV-1');
  assert.match(P.ligneEtat(at, 'k').ligne, /^▶ EN COURS · retours du poste à vérifier : DEV-1/);
  assert.equal(P.posteRelever(po).raison, 'file vide');
  assert.equal(code(() => P.posteRelever({ ...at })), 'PASSERELLE SUR LE POSTE');
  P.statutIssue(at, 'k', 'DEV-1', 'recette'); assert.equal(P.issues(P.lireCampagne(at, 'k'))[0].poste, undefined, 'un changement de statut solde le retour');
  const essais = () => P.issues(P.lireCampagne(at, 'k'))[0].attempts || 0;
  P.posteDeposer(at, 'k', 'DEV-1', { fiche: 'y' }); P.posteRendre(at, P.postePrendre(at).tache.id, { resultat: 'environnement' }); assert.equal(essais(), 0, 'environnement : pas d’essai');
  P.statutIssue(at, 'k', 'DEV-1', 'recette'); P.posteDeposer(at, 'k', 'DEV-1', { fiche: 'z' }); P.posteRendre(at, P.postePrendre(at).tache.id, { resultat: 'echec' }); assert.equal(essais(), 1, 'échec du code : un essai');
  P.statutIssue(at, 'k', 'DEV-1', 'recette'); const d4 = P.posteDeposer(at, 'k', 'DEV-1', { fiche: 'w' }); P.postePrendre(at);
  const r4 = P.postePrendre(at, { maintenant: new Date(Date.now() + 4 * 3600000) }); assert.deepEqual(r4.expirees, [d4.tache]); assert.equal(r4.tache.id, d4.tache, 'tâche dépassée remise en file puis reprise');
  assert.equal(code(() => P.posteRendre(at, d4.tache, { resultat: 'peut-être' })), 'RÉSULTAT INCONNU');
});

test('réveil : la ligne d’état met à jour le registre et le suffixe du titre ; ligne absente signalée (v2.5)', async () => {
  const c = configTest({ hote: 'atelier', execution: { sandbox: 'danger-full-access', approvalPolicy: 'never' } }); c.appServerFactice = path.join(c.etat, 'as.jsonl');
  P.inscrireChat(c, { chat_id: 'W1', role: 'DEV', projet: 'p', objet: '#1 x', statut: 'actif', hote: 'atelier' });
  c.appServerFacticeMessage = 'Bilan.\n⛔ BLOQUÉ · 3 échecs sur DEV-1 (wkhtmltopdf) · Toi : reprendre ce chat';
  await P.reveil(c);
  const reg = P.lireRegistreChats(c).W1; assert.equal(reg.statut, 'bloque'); assert.match(reg.derniere_ligne, /^⛔ BLOQUÉ/);
  const noms = fs.readFileSync(c.appServerFactice, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.method === 'thread/name/set').map((x) => x.params.name);
  assert.ok(noms.includes('🔵 DEV · p · #1 x · ⛔ BLOQUÉ'), JSON.stringify(noms));
  c.appServerFacticeMessage = 'Bilan sans ligne.'; await P.reveil(c); assert.equal(P.lireRegistreChats(c).W1.ligne_absente, true);
  assert.match(P.chatsEtat(c).tableau.join('\n'), /⛔ BLOQUÉ · 3 échecs/);
});

test('poste retirer : tâche retirée, issue exclue (file, admission, ligne d’état), nouveau dépôt seulement avec --forcer (v2.5.1)', () => {
  const at = configTest({ hote: 'atelier', deploiement_serveurs: false });
  fs.mkdirSync(path.join(at.etat, 'campagnes'), { recursive: true });
  fs.writeFileSync(path.join(at.etat, 'campagnes', 'k.json'), JSON.stringify({ id: 'k', projet: 'p', mode: 'auto', statut: 'en_cours', items: [{ type: 'issue_standalone', linear_id: 'DEV-7', statut: 'en_attente', blocked_by: [] }, { type: 'issue_standalone', linear_id: 'DEV-8', statut: 'revue', blocked_by: [] }] }));
  const d = P.posteDeposer(at, 'k', 'DEV-7', { fiche: 'Recette sur tablette physique' });
  assert.equal(code(() => P.posteRetirer(at, 'DEV-7', {})), 'MOTIF ABSENT');
  const r = P.posteRetirer(at, 'DEV-7', { motif: 'recette tablette faite par Paul' });
  assert.equal(r.tache, d.tache); assert.equal(r.statut, 'retiree');
  const i = P.issues(P.lireCampagne(at, 'k'))[0]; assert.equal(i.poste, undefined); assert.equal(i.poste_exclu, 'recette tablette faite par Paul');
  assert.equal(P.postePrendre(at).tache, null, 'une tâche retirée n’est jamais relevée');
  assert.equal(code(() => P.posteDeposer(at, 'k', 'DEV-7', { fiche: 'x' })), 'POSTE EXCLU');
  assert.deepEqual(P.contexte(at, 'k').exclues_poste, ['DEV-7 : recette tablette faite par Paul']);
  assert.match(P.ligneEtat(at, 'k').ligne, /Toi : à faire par toi : DEV-7 \(recette tablette faite par Paul\)$/);
  assert.match(fs.readFileSync(path.join(at.etat, 'campagnes', 'k.decisions.md'), 'utf8'), /DEV-7 · Retirée de la passerelle poste par Paul/);
  assert.deepEqual(P.posteFile(at).retirees, ['DEV-7 : recette tablette faite par Paul']);
  P.modifierCampagne(at, 'k', (c) => { c.items[1].statut = 'close'; });
  assert.match(P.ligneEtat(at, 'k').ligne, /^⏸ À TOI · il ne reste que ta part : DEV-7/);
  const d2 = P.posteDeposer(at, 'k', 'DEV-7', { fiche: 'y', forcer: true }); assert.equal(P.issues(P.lireCampagne(at, 'k'))[0].poste_exclu, undefined, '--forcer lève l’exclusion'); assert.equal(code(() => P.posteRetirer(at, d2.tache, { motif: 'm' })), 0);
});

test('ligne d’état : un poste qui exécute une tâche n’est pas déclaré absent (v2.5.1)', () => {
  const at = configTest({ hote: 'atelier', deploiement_serveurs: false });
  fs.mkdirSync(path.join(at.etat, 'campagnes'), { recursive: true });
  fs.writeFileSync(path.join(at.etat, 'campagnes', 'k.json'), JSON.stringify({ id: 'k', projet: 'p', mode: 'auto', statut: 'en_cours', items: [{ type: 'issue_standalone', linear_id: 'DEV-1', statut: 'recette', blocked_by: [] }, { type: 'issue_standalone', linear_id: 'DEV-2', statut: 'recette', blocked_by: [] }] }));
  P.posteDeposer(at, 'k', 'DEV-1', { fiche: 'a' }); P.posteDeposer(at, 'k', 'DEV-2', { fiche: 'b' });
  P.postePrendre(at, { maintenant: new Date(Date.now() - 2 * 3600000) });
  assert.match(P.ligneEtat(at, 'k').ligne, /Toi : rien$/, 'poste occupé depuis 2 h : présent');
});

test('passerelle 2.5.4 : imprimante PDF basculée puis restaurée, même si la session échoue ; absente : défaut inchangé', () => {
  const at = configTest({ hote: 'atelier', deploiement_serveurs: false });
  const fa = path.join(at.etat, 'atelier.json'); fs.writeFileSync(fa, JSON.stringify(at));
  fs.mkdirSync(path.join(at.etat, 'campagnes'), { recursive: true });
  fs.writeFileSync(path.join(at.etat, 'campagnes', 'k.json'), JSON.stringify({ id: 'k', projet: 'p', mode: 'auto', statut: 'en_cours', items: [{ type: 'issue_standalone', linear_id: 'DEV-1', statut: 'recette', blocked_by: [] }] }));
  const imp = path.join(at.etat, 'imprimantes.json'); fs.writeFileSync(imp, JSON.stringify({ defaut: 'HP physique', liste: ['HP physique', 'Microsoft Print to PDF'] }));
  const session = path.join(at.etat, 'session.mjs');
  fs.writeFileSync(session, "import fs from 'node:fs'; import path from 'node:path'; const consigne = fs.readFileSync(0, 'utf8'); const imp = JSON.parse(fs.readFileSync(process.env.IMP, 'utf8')); fs.writeFileSync(path.join(process.env.PASSERELLE_TRAVAIL, 'pendant.json'), JSON.stringify({ defaut: imp.defaut, consigne: consigne.includes('la passerelle a déjà mis') })); process.exit(3);");
  process.env.IMP = imp;
  const po = configTest({ hote: 'local', atelier_simule: fa, passerelle: { actif: true, dossier_travail: path.join(at.etat, 'travail'), commande_test: [process.execPath, session], imprimante_simulee: imp } });
  P.posteDeposer(at, 'k', 'DEV-1', { fiche: 'Tests PDF' });
  const r = P.posteRelever(po);
  const pendant = JSON.parse(fs.readFileSync(path.join(r.travail, 'pendant.json'), 'utf8'));
  assert.deepEqual(pendant, { defaut: 'Microsoft Print to PDF', consigne: true }, 'PDF par défaut pendant la tâche, et la consigne le dit');
  assert.equal(JSON.parse(fs.readFileSync(imp, 'utf8')).defaut, 'HP physique', 'restaurée malgré l’échec de la session');
  assert.equal(r.resultat, 'environnement'); assert.match(r.imprimante, /restaurée : oui/);
  fs.writeFileSync(imp, JSON.stringify({ defaut: 'HP physique', liste: ['HP physique'] }));
  const b = P.basculerImprimante(po); b.restaurer(); assert.match(b.note, /absente du poste/); assert.equal(JSON.parse(fs.readFileSync(imp, 'utf8')).defaut, 'HP physique');
});

test('passerelle 2.5.4 : plafond des échecs d’environnement, levée par --forcer ou par un résultat ok', () => {
  const at = configTest({ hote: 'atelier', deploiement_serveurs: false });
  fs.mkdirSync(path.join(at.etat, 'campagnes'), { recursive: true });
  fs.writeFileSync(path.join(at.etat, 'campagnes', 'k.json'), JSON.stringify({ id: 'k', projet: 'p', mode: 'auto', statut: 'en_cours', items: [{ type: 'issue_standalone', linear_id: 'DEV-3', statut: 'recette', blocked_by: [] }] }));
  const tour = (res) => { P.posteDeposer(at, 'k', 'DEV-3', { fiche: 'f' }); return P.posteRendre(at, P.postePrendre(at).tache.id, { resultat: res, retour: '- Anomalie 1 : 403 sur les paquets, jeton read:packages absent\n- Verdict : bloqué' }); };
  assert.equal(tour('environnement').echecs_environnement, 1);
  P.statutIssue(at, 'k', 'DEV-3', 'recette'); const r2 = tour('environnement'); assert.equal(r2.a_debloquer_par_paul, true);
  P.statutIssue(at, 'k', 'DEV-3', 'recette');
  assert.equal(code(() => P.posteDeposer(at, 'k', 'DEV-3', { fiche: 'f' })), 'POSTE À DÉBLOQUER');
  assert.match(P.ligneEtat(at, 'k').ligne, /Toi : débloquer le poste pour DEV-3 \(Anomalie 1 : 403 sur les paquets/);
  assert.match(P.contexte(at, 'k').poste_a_debloquer[0], /^DEV-3 : 2 échecs/);
  P.posteDeposer(at, 'k', 'DEV-3', { fiche: 'f', forcer: true }); assert.equal(P.issues(P.lireCampagne(at, 'k'))[0].poste_env_echecs, undefined, '--forcer remet le compteur à zéro');
  P.posteRendre(at, P.postePrendre(at).tache.id, { resultat: 'environnement', retour: 'x' }); P.statutIssue(at, 'k', 'DEV-3', 'recette');
  P.posteDeposer(at, 'k', 'DEV-3', { fiche: 'f' }); P.posteRendre(at, P.postePrendre(at).tache.id, { resultat: 'ok', retour: 'ok' });
  assert.equal(P.issues(P.lireCampagne(at, 'k'))[0].poste_env_echecs, undefined, 'un résultat ok remet le compteur à zéro');
});

test('passerelle 2.5.4 : poste rendre --issue depuis le poste, sans tâche préalable, preuves déposées ; jamais remise en file', () => {
  const at = configTest({ hote: 'atelier', deploiement_serveurs: false });
  const fa = path.join(at.etat, 'atelier.json'); fs.writeFileSync(fa, JSON.stringify(at));
  fs.mkdirSync(path.join(at.etat, 'campagnes'), { recursive: true });
  fs.writeFileSync(path.join(at.etat, 'campagnes', 'k.json'), JSON.stringify({ id: 'k', projet: 'p', mode: 'auto', statut: 'en_cours', items: [{ type: 'issue_standalone', linear_id: 'DEV-4', statut: 'revue', blocked_by: [] }] }));
  const preuves = path.join(at.etat, 'manuel', 'retour'); fs.mkdirSync(preuves, { recursive: true }); fs.writeFileSync(path.join(preuves, 'matrice.json'), '[]');
  const po = configTest({ hote: 'local', atelier_simule: fa });
  assert.equal(code(() => P.posteRendre(po, null, { resultat: 'ok', retour: 'x' })), 'ATELIER INJOIGNABLE', 'sans issue ni tâche : refus d’atelier (ISSUE ABSENTE)');
  const r = P.posteRendre(po, null, { resultat: 'ok', retour: 'DEV-4 : recette Windows ok', issue: 'DEV-4', campagne: 'k', preuves });
  assert.equal(r.tache_creee, true); assert.equal(r.preuves_deposees, true);
  assert.ok(fs.existsSync(path.join(at.etat, 'poste', 'retours', r.tache, 'preuves', 'matrice.json')));
  assert.equal(P.contexte(at, 'k').retours_poste[0].issue, 'DEV-4');
  assert.equal(P.postePrendre(at, { maintenant: new Date(Date.now() + 9 * 3600000) }).tache, null, 'une tâche hors passerelle n’est jamais relevée');
});

test('admission 2.5.4 : garde CPU sur l’attente moyenne à 60 s ; une issue déjà active n’est pas concernée', () => {
  const f = path.join(os.tmpdir(), 'pression-' + process.pid);
  const c = configTest({ admission: { dev_max: 15, lourdes_max: 4, garde_cpu_pct: 40, pression_cpu_fichier: f } });
  fs.writeFileSync(f, 'some avg10=60.00 avg60=55.20 avg300=30.00 total=1\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=0\n');
  assert.equal(code(() => P.gardeCpu(c, { statut: 'en_attente' })), 'ADMISSION DIFFÉRÉE');
  assert.equal(P.gardeCpu(c, { statut: 'revue' }), null);
  fs.writeFileSync(f, 'some avg10=5.00 avg60=12.50 avg300=10.00 total=1\n'); assert.equal(P.gardeCpu(c, { statut: 'en_attente' }), 12.5);
  assert.match(P.limitesTexte(c), /attente CPU dépasse 40 %/);
  fs.rmSync(f, { force: true });
});
