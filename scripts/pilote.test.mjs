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
  return { hote: 'local', deploiement_serveurs: true, etat, admission: { dev_max: 4, lourdes_max: 1, pression_cpu_fichier: path.join(etat, 'pression-cpu-absente') }, // tests indépendants de la charge réelle de l'hôte
    modeles: { cerveau: OPUS, dev: [OPUS, SONNET], controle: [SONNET, 'gpt-6.2-sol'], ouvrier: [HAIKU, 'gpt-6-luna'],
      lecteur: { jusqu_a_100k: HAIKU, au_dela: SONNET, fallback: 'gpt-6.1-terra' }, second_regard: 'gpt-6.2-astra', recours: FABLE51, oeil: FABLE51,
      reserve_paul: [FABLE52], sous_agents: [HAIKU, OPUS, FABLE51, 'gpt-6-luna'], fable_autorise: false },
    contexte: { resume_large_max_tokens: 8000, log_brut_max_tokens: 2000 }, ...extra };
}
const code = (fn) => { try { fn(); return 0; } catch (e) { assert.ok(e instanceof P.Refus, e.stack); return e.titre; } };

test('les 5 cas de routage exigés (v2.7 : Sonnet en standard)', () => {
  const c = configTest();
  assert.equal(P.router(c, { tache: 'dev', criticite: 'standard', volumetrie: 'compact' }).modele, SONNET);
  assert.equal(P.router(c, { tache: 'dev', criticite: 'sensible', volumetrie: 'compact' }).modele, OPUS);
  const large = P.router(c, { tache: 'dev', criticite: 'standard', volumetrie: 'large', entree: 40000 });
  assert.equal(large.lecteur, HAIKU); assert.equal(large.executant, SONNET); assert.equal(large.budget_resume_tokens, 8000);
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

// ---------- v2.6 : $dev point ----------
const empreinteDossier = (d) => { const out = []; const walk = (x) => { for (const f of fs.readdirSync(x, { withFileTypes: true })) { const p = path.join(x, f.name); if (f.isDirectory()) walk(p); else out.push(p + ':' + fs.readFileSync(p, 'utf8')); } }; walk(d); return out.sort().join('\n'); };
function campagnesPoint() {
  const at = configTest({ hote: 'atelier', deploiement_serveurs: false, admission: { dev_max: 15, lourdes_max: 4 } });
  fs.mkdirSync(path.join(at.etat, 'campagnes'), { recursive: true });
  const il = (id, statut, x = {}) => ({ type: 'issue_standalone', linear_id: id, statut, blocked_by: [], ...x });
  const t0 = new Date(Date.now() - 10 * 3600000).toISOString(), t1 = new Date(Date.now() - 2 * 3600000).toISOString();
  fs.writeFileSync(path.join(at.etat, 'campagnes', 'a.json'), JSON.stringify({ id: 'a', projet: 'p', mode: 'auto', statut: 'en_cours', lancee_le: t0, items: [
    il('DEV-1', 'close', { admise_le: t0, close_le: t1 }), il('DEV-2', 'bloquee'), il('DEV-3', 'revue', { arret: { attend: 'paul', quoi: 'Fournir le compte service (proposé : compte _2)', le: t1 } }),
    il('DEV-4', 'en_attente', { blocked_by: ['DEV-3'] }), il('DEV-5', 'revue', { arret: { attend: 'agents', quoi: 'faux services à écrire', le: t1 } }), il('DEV-6', 'en_cours')] }));
  fs.writeFileSync(path.join(at.etat, 'campagnes', 'a.decisions.md'), '- ' + t1 + ' · DEV-2 · DEV-2 bloquée : 504 sous charge, correction hors mandat.\n');
  fs.writeFileSync(path.join(at.etat, 'campagnes', 'b.json'), JSON.stringify({ id: 'b', projet: 'q', mode: 'sup', statut: 'en_cours', lancee_le: t0, items: [il('DEV-9', 'bloquee', { arret: { attend: 'paul', quoi: 'fournir le compte service (proposé : compte _2)', le: t1 } })] }));
  fs.writeFileSync(path.join(at.etat, 'campagnes', 'c.json'), JSON.stringify({ id: 'c', projet: 'q', mode: 'auto', statut: 'en_pause', items: [il('DEV-20', 'bloquee')] }));
  return at;
}

test('point 2.6 : lecture seule, qui débloque, actions dédoublonnées et triées, campagne en pause exclue', () => {
  const at = campagnesPoint(); const avant = empreinteDossier(at.etat);
  const p = P.point(at);
  assert.equal(empreinteDossier(at.etat), avant, 'point n’écrit rien');
  assert.deepEqual(p.campagnes.map((c) => c.campagne).sort(), ['a', 'b'], 'en pause exclue par défaut');
  const a = p.campagnes.find((c) => c.campagne === 'a');
  const q = Object.fromEntries(a.arrets.map((x) => [x.issue, x]));
  assert.equal(q['DEV-2'].qui, 'à qualifier'); assert.match(q['DEV-2'].quoi, /504 sous charge/, 'la cause vient du journal, sans invention');
  assert.equal(q['DEV-3'].qui, 'Toi'); assert.equal(q['DEV-5'].qui, 'agents'); assert.equal(q['DEV-6'], undefined, 'une issue en travail n’est pas un blocage');
  assert.equal(p.actions_paul.length, 1, 'même action dans deux campagnes : une seule ligne');
  assert.deepEqual(p.actions_paul[0].issues.sort(), ['DEV-3', 'DEV-9']); assert.equal(p.actions_paul[0].debloque, 3, 'DEV-3, DEV-4 (dépendante) et DEV-9');
  assert.equal(a.estimation.fiabilite, 'faible'); assert.equal(a.estimation.unite, 'heures de travail des agents');
  assert.equal(a.estimation.plafond_sans_toi, 4, 'sans Paul : DEV-1 close + DEV-2, DEV-5, DEV-6');
  assert.ok(a.estimation.si_actions_faites[1] >= a.estimation.sinon[1]);
  assert.match(p.ligne_etat, /^⏸ À TOI · point de 2 campagne\(s\) fait, 1 blocage\(s\) à qualifier · Toi : Fournir le compte service/);
  assert.match(p.rendu, /\*\*Ce que tu dois faire\*\*\n\n1\. Fournir le compte service \(proposé : compte _2\) — débloque 3 issue\(s\)/);
  assert.equal(p.rendu.split('\n').at(-1), p.ligne_etat, 'le rendu finit par la ligne d’état');
  assert.deepEqual(P.point(at, ['c']).campagnes.map((c) => c.campagne), ['c'], 'nommée : incluse même en pause');
});

test('point 2.6 : statut --attend/--quoi, levé au changement de statut ; arret ne solde pas le retour du poste', () => {
  const at = campagnesPoint();
  assert.equal(code(() => P.statutIssue(at, 'a', 'DEV-6', 'bloquee', null, { attend: 'paul' })), 'CAUSE ABSENTE');
  assert.equal(code(() => P.statutIssue(at, 'a', 'DEV-6', 'bloquee', null, { attend: 'moi', quoi: 'x' })), 'ATTENTE INCONNUE');
  P.statutIssue(at, 'a', 'DEV-6', 'bloquee', null, { attend: 'env', quoi: 'Docker arrêté' });
  assert.equal(P.point(at, ['a']).campagnes[0].arrets.find((x) => x.issue === 'DEV-6').qui, 'environnement');
  P.statutIssue(at, 'a', 'DEV-6', 'en_attente');
  assert.equal(P.issues(P.lireCampagne(at, 'a')).find((i) => i.linear_id === 'DEV-6').arret, undefined, 'changement de statut sans --attend : arrêt levé');
  P.modifierCampagne(at, 'a', (c) => { const i = c.items.find((x) => x.linear_id === 'DEV-5'); i.poste = 'retour'; i.poste_resultat = 'ok'; });
  P.qualifierArret(at, 'a', 'DEV-5', { attend: 'agents', quoi: 'vérifier le retour du poste' });
  const i5 = P.issues(P.lireCampagne(at, 'a')).find((i) => i.linear_id === 'DEV-5'); assert.equal(i5.poste, 'retour'); assert.equal(i5.statut, 'revue');
  P.qualifierArret(at, 'a', 'DEV-5', { lever: true }); assert.equal(P.issues(P.lireCampagne(at, 'a')).find((i) => i.linear_id === 'DEV-5').arret, undefined);
});

test('point 2.6 : estimation par durée médiane dès 5 issues mesurées', () => {
  const at = configTest({ hote: 'atelier', deploiement_serveurs: false, admission: { dev_max: 15, lourdes_max: 4 } });
  fs.mkdirSync(path.join(at.etat, 'campagnes'), { recursive: true });
  const now = Date.now(); const il = (k, statut, x = {}) => ({ type: 'issue_standalone', linear_id: 'DEV-' + k, statut, blocked_by: [], ...x });
  const closes = [1, 2, 3, 4, 5].map((k) => il(k, 'close', { admise_le: new Date(now - 5 * 3600000).toISOString(), close_le: new Date(now - 3 * 3600000).toISOString() }));
  fs.writeFileSync(path.join(at.etat, 'campagnes', 'm.json'), JSON.stringify({ id: 'm', projet: 'p', mode: 'auto', statut: 'en_cours', lancee_le: new Date(now - 6 * 3600000).toISOString(), items: [...closes, il(6, 'en_cours'), il(7, 'en_cours'), il(8, 'en_attente'), il(9, 'en_attente')] }));
  const e = P.point(at).campagnes[0].estimation;
  assert.match(e.base, /durée médiane de 5 issues mesurées, 2 place\(s\) occupée\(s\)/); assert.equal(e.fiabilite, 'moyenne');
  assert.deepEqual(e.si_actions_faites, [3, 6], '4 issues × 2 h / 2 places = 4 h, fourchette 0,75 à 1,5');
});

test('2.6.1 : un fichier JSON qui n’est pas une campagne (matrice, preuve) est ignoré par le ménage et le point', () => {
  const at = configTest({ hote: 'atelier', deploiement_serveurs: false });
  fs.mkdirSync(path.join(at.etat, 'campagnes'), { recursive: true });
  fs.writeFileSync(path.join(at.etat, 'campagnes', 'k.json'), JSON.stringify({ id: 'k', projet: 'p', mode: 'auto', statut: 'en_cours', items: [{ type: 'issue_standalone', linear_id: 'DEV-1', statut: 'en_attente', blocked_by: [] }] }));
  fs.writeFileSync(path.join(at.etat, 'campagnes', 'k.DEV-1.matrice.json'), JSON.stringify([{ ligne: 1 }]));
  fs.writeFileSync(path.join(at.etat, 'campagnes', 'k.DEV-1.preuve.json'), JSON.stringify({ issue: 'DEV-1', criteres: [] }));
  assert.deepEqual(P.listerCampagnes(at).map((c) => c.id), ['k']);
  assert.equal(code(() => P.analyserMenage(at, { chats: [] })), 0);
  assert.equal(P.point(at).campagnes.length, 1);
});

// ---------- v2.6.2 : archivage automatique, campagne ajouter ----------
function etatArchivage() {
  const at = configTest({ hote: 'atelier', deploiement_serveurs: false, chats: { archive_apres_heures: 1 } });
  fs.mkdirSync(path.join(at.etat, 'campagnes'), { recursive: true });
  const il = (id, statut) => ({ type: 'issue_standalone', linear_id: id, statut, blocked_by: [] });
  fs.writeFileSync(path.join(at.etat, 'campagnes', 'ouverte.json'), JSON.stringify({ id: 'ouverte', projet: 'p', mode: 'auto', statut: 'en_cours', chat: 'C-AUTO-1', items: [il('DEV-1', 'close'), il('DEV-2', 'revue')] }));
  fs.writeFileSync(path.join(at.etat, 'campagnes', 'finie.json'), JSON.stringify({ id: 'finie', projet: 'p', mode: 'auto', statut: 'close', chat: 'C-AUTO-2', items: [il('DEV-9', 'close')] }));
  fs.writeFileSync(path.join(at.etat, 'campagnes', 'sansbilan.json'), JSON.stringify({ id: 'sansbilan', projet: 'p', mode: 'auto', statut: 'close', chat: 'C-AUTO-3', items: [il('DEV-8', 'close')] }));
  fs.writeFileSync(path.join(at.etat, 'aide.json'), JSON.stringify({ chat_id: 'C-AIDE' }));
  const il2 = new Date(Date.now() - 2 * 3600000).toISOString(), recent = new Date(Date.now() - 10 * 60000).toISOString();
  const ch = (role, titre, x = {}) => ({ role, titre, hote: 'atelier', statut: 'clos', derniere_ligne_le: il2, ...x });
  fs.writeFileSync(path.join(at.etat, 'chats.json'), JSON.stringify({
    'C-DEV-VIEUX': ch('DEV', '🔵 DEV · p · DEV-1 · ✅', { lien: { type: 'issue', id: 'DEV-1' } }),
    'C-DEV-RECENT': ch('DEV', '🔵 DEV · p · DEV-7 · ✅', { derniere_ligne_le: recent }),
    'C-DEV-NONCLOSE': ch('DEV', '🔵 DEV · p · DEV-2 · ✅', { objet: 'DEV-2', lien: { type: 'sujet', id: 'DEV-2' } }),
    'C-CADRE-ACTIF': ch('CADRE', '🟣 CADRE · p · sujet', { statut: 'actif' }),
    'C-CADRE-FINI': ch('CADRE', '🟣 CADRE · p · sujet2 · ✅'),
    'C-AIDE': ch('AIDE', '❓ AIDE · workflow'), 'C-ARCHI': ch('ARCHI', '🏛 ARCHI · workflow'),
    'C-POSTE': ch('DEV', '🔵 DEV · p · DEV-5 · ✅', { hote: 'local' }),
    'C-DEJA': ch('DEV', 'x', { statut: 'archive' }),
    'C-AUTO-1': ch('AUTO', '🟢 AUTO · p · ouverte', { statut: 'actif', orchestrateur: true, campagne: 'ouverte' }),
    'C-AUTO-2': ch('AUTO', '🟢 AUTO · p · finie', { statut: 'actif', orchestrateur: true, campagne: 'finie' }),
    'C-BILAN-2': ch('BILAN', '📘 BILAN · p · finie · ✅', { objet: 'finie', lien: { type: 'sujet', id: 'finie' }, derniere_ligne_le: recent }),
    'C-AUTO-3': ch('AUTO', '🟢 AUTO · p · sansbilan', { statut: 'actif', orchestrateur: true, campagne: 'sansbilan' }) }));
  return at;
}

test('2.6.2 : le réveil archive les chats terminés depuis 1 h, jamais AIDE, ARCHI, une campagne en cours, un chat qui travaille ni l’issue non close', async () => {
  const at = etatArchivage();
  assert.deepEqual(P.chatsAArchiver(at).map((x) => x.chat).sort(), ['C-AUTO-2', 'C-CADRE-FINI', 'C-DEV-VIEUX']);
  const appels = []; const s = { call: async (m, p) => { appels.push([m, p?.threadId]); if (m === 'thread/read') return { thread: { status: { type: p.threadId === 'C-CADRE-FINI' ? 'active' : 'idle' } } }; if (m === 'threadSection/list') return { data: [{ id: 's99', name: '99 Archives' }] }; return {}; } };
  const r = await P.archiverTermines(at, s);
  assert.deepEqual(r.map((x) => x.chat).sort(), ['C-AUTO-2', 'C-DEV-VIEUX'], 'chat en plein tour : au prochain réveil');
  assert.ok(appels.some(([m, id]) => m === 'thread/archive' && id === 'C-DEV-VIEUX'));
  const reg = JSON.parse(fs.readFileSync(path.join(at.etat, 'chats.json'), 'utf8'));
  assert.equal(reg['C-DEV-VIEUX'].statut, 'archive'); assert.ok(reg['C-DEV-VIEUX'].archive_le); assert.equal(reg['C-AIDE'].statut, 'clos');
  assert.equal(P.chatsArchives24h(at).length, 2);
  assert.match(P.point(at).rendu, /\*\*Chats archivés \(24 h\)\*\* : 2 —/);
});

test('2.6.2 : le ménage archive après archive_apres_heures (1 h)', () => {
  const at = configTest({ chats: { archive_apres_heures: 1 } });
  const vieux = new Date(Date.now() - 2 * 3600000).toISOString();
  const a = P.analyserMenage(at, { chats: [{ id: 'X', titre: '🔵 DEV · p · DEV-3 · ✅', maj: vieux }, { id: 'Y', titre: '🔵 DEV · p · DEV-4 · ✅', maj: new Date().toISOString() }] });
  assert.equal(a.totaux.a_archiver, 1);
  const d = JSON.parse(fs.readFileSync(path.join(at.etat, 'menage', 'derniere.json'), 'utf8'));
  assert.deepEqual(d.lignes.filter((l) => l.categorie === 'a_archiver').map((l) => l.chat), ['X']);
});

test('2.6.2 : campagne ajouter : issue admissible, motif obligatoire, doublon signalé, journal tenu', () => {
  const at = configTest({ hote: 'atelier', deploiement_serveurs: false, projets: { p: { chemin: '/x' } } });
  fs.mkdirSync(path.join(at.etat, 'campagnes'), { recursive: true });
  fs.writeFileSync(path.join(at.etat, 'campagnes', 'k.json'), JSON.stringify({ id: 'k', projet: 'p', mode: 'auto', statut: 'en_cours', items: [{ type: 'issue_standalone', linear_id: 'DEV-1', statut: 'revue', blocked_by: [] }, { type: 'milestone', linear_id: 'MS-1', slug: 'ms-1', issues: [] }] }));
  assert.equal(code(() => P.ajouterIssues(at, 'k', ['DEV-5'], {})), 'MOTIF ABSENT');
  assert.equal(code(() => P.ajouterIssues(at, 'k', ['dev5'], { motif: 'm' })), 'IDENTIFIANT INVALIDE');
  assert.equal(code(() => P.ajouterIssues(at, 'k', ['DEV-5'], { motif: 'm', projet: 'inconnu' })), 'PROJET INCONNU');
  const r = P.ajouterIssues(at, 'k', ['DEV-5', 'DEV-1'], { motif: 'mandat de cadrage autonome de Paul', bloqueePar: ['DEV-1'], projet: 'p' });
  assert.deepEqual(r.ajoutees, ['DEV-5']); assert.deepEqual(r.deja_presentes, ['DEV-1']); assert.equal(r.total, 2);
  const i5 = P.issues(P.lireCampagne(at, 'k')).find((i) => i.linear_id === 'DEV-5');
  assert.equal(i5.statut, 'en_attente'); assert.deepEqual(i5.blocked_by, ['DEV-1']); assert.equal(i5.branche, 'codex/issue-DEV-5');
  P.ajouterIssues(at, 'k', ['DEV-6'], { motif: 'm', milestone: 'ms-1' });
  assert.equal(P.lireCampagne(at, 'k').items[1].issues[0].linear_id, 'DEV-6');
  assert.match(fs.readFileSync(path.join(at.etat, 'campagnes', 'k.decisions.md'), 'utf8'), /DEV-5 · Ajoutée à la campagne en cours \(pilote\.mjs campagne ajouter\) : mandat de cadrage autonome de Paul ; bloquée par DEV-1/);
  P.modifierCampagne(at, 'k', (c) => { c.statut = 'close'; });
  assert.equal(code(() => P.ajouterIssues(at, 'k', ['DEV-7'], { motif: 'm' })), 'CAMPAGNE CLOSE');
});


test('2.6.5 : relance sur changement d’état, sinon une fois par heure ; état mémorisé à la fin du tour', () => {
  const at = configTest({ hote: 'atelier', deploiement_serveurs: false });
  fs.mkdirSync(path.join(at.etat, 'campagnes'), { recursive: true });
  fs.writeFileSync(path.join(at.etat, 'campagnes', 'k.json'), JSON.stringify({ id: 'k', projet: 'p', mode: 'auto', statut: 'en_cours', chat: 'C1', dernier_reveil: new Date(Date.now() - 20 * 60000).toISOString(), items: [{ type: 'issue_standalone', linear_id: 'DEV-1', statut: 'revue', blocked_by: [] }, { type: 'issue_standalone', linear_id: 'DEV-2', statut: 'en_attente', blocked_by: ['DEV-1'] }] }));
  const c0 = () => P.lireCampagne(at, 'k'); const t = (min) => new Date(Date.now() + min * 60000);
  assert.equal(P.decisionReprise(at, c0()).relancer, true, 'campagne sans état mémorisé : reprise');
  P.modifierCampagne(at, 'k', (c) => { c.empreinte_repos = null; });
  let d = P.decisionReprise(at, c0()); assert.equal(d.relancer, false); assert.equal(d.memoriser, true, 'premier passage après le tour : état mémorisé');
  P.modifierCampagne(at, 'k', (c) => { c.empreinte_repos = d.empreinte; c.repos_le = new Date().toISOString(); });
  d = P.decisionReprise(at, c0(), { maintenant: t(30) }); assert.equal(d.relancer, false); assert.match(d.raison, /aucun changement depuis 30 min/);
  assert.equal(P.decisionReprise(at, c0(), { maintenant: t(61) }).relancer, true, 'relance horaire');
  P.decision(at, 'k', 'DEV-1', 'retour du poste');
  d = P.decisionReprise(at, c0(), { maintenant: t(11) }); assert.equal(d.relancer, true); assert.equal(d.raison, 'changement détecté');
  P.modifierCampagne(at, 'k', (c) => { c.dernier_reveil = new Date().toISOString(); c.empreinte_repos = null; });
  assert.equal(P.decisionReprise(at, c0(), { maintenant: t(5) }).raison, 'reprise récente');
  at.reveil = { relance_sans_changement_min: 45 }; P.modifierCampagne(at, 'k', (c) => { c.empreinte_repos = P.empreinteReprise(at, c); c.repos_le = new Date().toISOString(); });
  assert.equal(P.decisionReprise(at, c0(), { maintenant: t(46) }).relancer, true, 'intervalle réglable');
});

// ---------- v2.7 : routage Sonnet, scission, voie de recette ----------
test('2.7 : Sonnet en standard (sous-agent compris), Opus en sensible et dès le 2ᵉ essai', () => {
  const c = configTest(); c.modeles.sous_agents = [HAIKU, OPUS, SONNET, FABLE51, 'gpt-6-luna'];
  assert.equal(P.router(c, { tache: 'dev', criticite: 'standard', sousAgent: true }).modele, SONNET);
  assert.equal(P.router(c, { tache: 'revue', criticite: 'standard', sousAgent: true }).modele, SONNET);
  assert.equal(P.router(c, { tache: 'dev', criticite: 'sensible', sousAgent: true }).modele, OPUS);
  assert.equal(P.escalade(c, { criticite: 'standard', essai: 1, sousAgent: true }).modele, SONNET);
  assert.equal(P.escalade(c, { criticite: 'standard', essai: 2, sousAgent: true }).modele, OPUS);
  assert.equal(P.escalade(c, { criticite: 'sensible', essai: 1, sousAgent: true }).modele, OPUS);
  const sans = configTest(); assert.equal(P.router(sans, { tache: 'dev', criticite: 'standard', sousAgent: true }).modele, OPUS, 'Sonnet absent des sous-agents : Opus');
});

function campagneScission() {
  const at = configTest({ hote: 'atelier', deploiement_serveurs: false, admission: { dev_max: 6, lourdes_max: 4 } });
  fs.mkdirSync(path.join(at.etat, 'campagnes'), { recursive: true });
  const il = (id, statut, x = {}) => ({ type: 'issue_standalone', linear_id: id, statut, blocked_by: [], ...x });
  fs.writeFileSync(path.join(at.etat, 'campagnes', 'cmp.json'), JSON.stringify({ id: 'cmp', projet: 'front', mode: 'auto', statut: 'en_cours', contrat: '/c.md', contrat_valide: true, chat: 'C-CMP', items: [
    il('API-1', 'revue', { projet: 'api' }), il('API-2', 'en_attente', { projet: 'api', blocked_by: ['API-1'] }), il('FR-1', 'en_attente', { blocked_by: ['API-1'] }), il('FR-2', 'recette'), il('FR-3', 'fusionnee', { blocked_by: [] }), il('FR-4', 'en_attente', { blocked_by: ['FR-2'] }),
    { type: 'milestone', linear_id: 'MS-A', slug: 'ms-a', issues: [il('API-3', 'en_cours', { projet: 'api' })] }, { type: 'milestone', linear_id: 'MS-X', slug: 'ms-x', issues: [il('FR-9', 'en_attente'), il('API-9', 'en_attente', { projet: 'api' })] }] }));
  fs.writeFileSync(path.join(at.etat, 'campagnes', 'cmp.decisions.md'), '- 2026-11-21T08:00:00.000Z · FR-2 · historique\n');
  return at;
}
test('2.7 : campagne scinder : milestone mixte refusé, issues transférées, statuts redirigés, dépendances suivies entre sœurs', () => {
  const at = campagneScission();
  assert.equal(code(() => P.scinderCampagne(at, 'cmp', { projets: ['api'], vers: 'cmp-api' })), 'MILESTONE MIXTE');
  P.modifierCampagne(at, 'cmp', (c) => { c.items = c.items.filter((it) => it.linear_id !== 'MS-X'); });
  const tp = P.posteDeposer(at, 'cmp', 'API-1', { fiche: 'recette Windows' });
  const r = P.scinderCampagne(at, 'cmp', { projets: ['api'], vers: 'cmp-api' });
  assert.deepEqual(r.deplacees.sort(), ['API-1', 'API-2', 'API-3', 'MS-A']); assert.deepEqual(r.taches_poste, [tp.tache]);
  const a = P.lireCampagne(at, 'cmp-api'), f = P.lireCampagne(at, 'cmp');
  assert.equal(a.chat, undefined); assert.equal(a.contrat, '/c.md'); assert.deepEqual(a.soeurs, ['cmp']); assert.deepEqual(f.soeurs, ['cmp-api']);
  assert.equal(P.issues(f).some((i) => /^API/.test(i.linear_id)), false);
  assert.match(fs.readFileSync(path.join(at.etat, 'campagnes', 'cmp-api.decisions.md'), 'utf8'), /FR-2 · historique[\s\S]*GLOBAL · Scission/);
});
test('2.7 : après scission, une commande sur l’ancienne campagne est redirigée ; FR-1 attend API-1 dans la campagne sœur', () => {
  const at = campagneScission();
  P.modifierCampagne(at, 'cmp', (c) => { c.items = c.items.filter((it) => it.linear_id !== 'MS-X'); });
  P.scinderCampagne(at, 'cmp', { projets: ['api'], vers: 'cmp-api' });
  const s = P.statutIssue(at, 'cmp', 'API-3', 'revue'); assert.equal(s.campagne, 'cmp-api', 'redirigée vers la sœur');
  assert.equal(P.issues(P.lireCampagne(at, 'cmp-api')).find((i) => i.linear_id === 'API-3').statut, 'revue', 'statut écrit dans la campagne sœur');
  P.decision(at, 'cmp', 'API-3', 'note redirigée');
  assert.match(fs.readFileSync(path.join(at.etat, 'campagnes', 'cmp-api.decisions.md'), 'utf8'), /API-3 · note redirigée/);
  const cli = P.executer(['essai', 'cmp', 'API-3', 'echec'], at); assert.equal(cli.attempts, 1);
  assert.equal(P.retenues(at, P.lireCampagne(at, 'cmp-api'))['API-1'], 2, 'API-2 et FR-1 (sœur) attendent API-1');
  P.modifierCampagne(at, 'cmp', (c) => { for (const i of c.items) if (['FR-2', 'FR-3'].includes(i.linear_id)) i.statut = 'close'; });
  assert.doesNotMatch(P.ligneEtat(at, 'cmp').ligne, /admission de FR-1/, 'FR-1 non éligible tant qu’API-1 n’est pas close');
  P.modifierCampagne(at, 'cmp-api', (c) => { c.items.find((i) => i.linear_id === 'API-1').statut = 'close'; });
  assert.match(P.ligneEtat(at, 'cmp').ligne, /admission de FR-1/);
});
test('2.7 : voie de recette : issues en recette hors des places, triées par issues retenues, ligne d’état propre', () => {
  const at = campagneScission();
  P.modifierCampagne(at, 'cmp', (c) => { c.voie_recette = { chat: 'C-TEST', modele: 'anthropic/claude-sonnet-5-5' }; });
  const k = P.contexte(at, 'cmp');
  assert.equal(k.a_relancer.includes('FR-2'), false, 'FR-2 appartient à la voie'); assert.deepEqual(k.a_recetter, []); assert.equal(k.voie_recette, 'C-TEST');
  assert.match(k.consigne, /Voie de recette dédiée/); assert.equal(k.a_relancer[0], 'API-1', 'API-1 débloque le plus d’issues');
  assert.equal(P.actifsAdmission(P.issues(P.lireCampagne(at, 'cmp')), null, true).some((i) => i.linear_id === 'FR-2'), false);
  const v = P.recettesVoie(at, 'cmp');
  assert.deepEqual(v.a_recetter.map((x) => x.issue), ['FR-2', 'FR-3'], 'FR-2 retient FR-4'); assert.equal(v.a_recetter[0].retient, 1);
  assert.match(v.ligne, /^▶ EN COURS · 2 issue\(s\) à recetter \(FR-2, FR-3\)/); assert.match(v.consigne, /Tu ne développes rien/);
  P.modifierCampagne(at, 'cmp', (c) => { c.items.find((i) => i.linear_id === 'FR-2').statut = 'close'; c.items.find((i) => i.linear_id === 'FR-3').statut = 'close'; });
  assert.match(P.recettesVoie(at, 'cmp').ligne, /^⏳ EN ATTENTE · aucune issue à recetter/);
  fs.writeFileSync(path.join(at.etat, 'chats.json'), JSON.stringify({ 'C-TEST': { role: 'TEST', titre: '🧪 TEST · front · recettes cmp · ✅', hote: 'atelier', statut: 'clos', campagne: 'cmp', voie_recette: true, derniere_ligne_le: new Date(Date.now() - 5 * 3600000).toISOString() } }));
  assert.deepEqual(P.chatsAArchiver(at), [], 'la voie d’une campagne en cours n’est jamais archivée');
});

// ---------- v2.8 : admission empilée, chaîne critique, file lourde par priorité, veille ----------
function campagneChaine() {
  const at = configTest({ hote: 'atelier', deploiement_serveurs: false, admission: { dev_max: 6, lourdes_max: 4, empilement_max: 3 } });
  fs.mkdirSync(path.join(at.etat, 'campagnes'), { recursive: true });
  const il = (id, statut, deps = [], x = {}) => ({ type: 'issue_standalone', linear_id: id, statut, blocked_by: deps, branche: 'codex/issue-' + id, ...x });
  fs.writeFileSync(path.join(at.etat, 'campagnes', 'k.json'), JSON.stringify({ id: 'k', projet: 'p', mode: 'auto', statut: 'en_cours', items: [
    il('A', 'recette'), il('B', 'en_attente', ['A']), il('C', 'en_attente', ['B']), il('D', 'en_attente', ['C']), il('E', 'en_attente', ['D']),
    il('R', 'revue'), il('S', 'en_attente', ['R']), il('X', 'recette', [], { projet: 'autre' }), il('Y', 'en_attente', ['X']), il('Z', 'en_attente', ['A', 'B'])] }));
  return at;
}
const empiler = (at, id, prof, sur) => P.modifierCampagne(at, 'k', (c) => { const i = c.items.find((x) => x.linear_id === id); i.statut = 'recette'; i.empile_sur = sur; i.empile_profondeur = prof; });
test('2.8 : admission empilée sur une dépendance en recette, profondeur 3 au plus, base = branche de la dépendance', () => {
  const at = campagneChaine(); const c = () => P.lireCampagne(at, 'k'); const i = (id) => P.issues(c()).find((x) => x.linear_id === id);
  const b = P.admissibilite(at, c(), i('B')); assert.equal(b.ok, true); assert.deepEqual(b.empile, { sur: ['A'], base_sur: 'A', branche: 'codex/issue-A', profondeur: 1 });
  assert.equal(P.admissibilite(at, c(), i('S')).ok, false, 'dépendance en revue (pas encore favorable) : attendre');
  const y = P.admissibilite(at, c(), i('Y')); assert.equal(y.ok, true); assert.equal(y.empile.branche, null, 'autre dépôt : empilement logique, base par défaut');
  empiler(at, 'B', 1, ['A']); empiler(at, 'C', 2, ['B']); empiler(at, 'D', 3, ['C']);
  assert.match(P.admissibilite(at, c(), i('E')).raison, /profondeur 4, au-delà de 3/);
  assert.match(P.admissibilite(at, c(), i('Z')).raison, /plusieurs dépendances du même dépôt/);
  at.admission.empilement_max = 0; P.modifierCampagne(at, 'k', (k) => { const x = k.items.find((y) => y.linear_id === 'B'); x.statut = 'en_attente'; delete x.empile_sur; delete x.empile_profondeur; });
  assert.equal(P.admissibilite(at, c(), i('B')).ok, false, 'empilement désactivé : attendre la clôture');
});
test('2.8 : clôture prématurée refusée, désempilement quand la dépendance échoue, a_rebaser après fusion', () => {
  const at = campagneChaine(); empiler(at, 'B', 1, ['A']);
  const mat = path.join(at.etat, 'm.json'); fs.writeFileSync(mat, JSON.stringify({ issue: 'B', criteres: [{ critere: 'x', statut: 'ok', preuve: 'p' }] }));
  assert.equal(code(() => P.statutIssue(at, 'k', 'B', 'close', mat)), 'CLÔTURE PRÉMATURÉE');
  const r = P.statutIssue(at, 'k', 'A', 'en_cours');
  assert.deepEqual(r.desempilees.map((x) => x.issue), ['B']);
  const b = P.issues(P.lireCampagne(at, 'k')).find((x) => x.linear_id === 'B'); assert.equal(b.statut, 'en_attente'); assert.equal(b.empile_sur, undefined);
  assert.match(fs.readFileSync(path.join(at.etat, 'campagnes', 'k.decisions.md'), 'utf8'), /B · Désempilée \(v2\.8\) : la dépendance A repasse en en_cours/);
  P.statutIssue(at, 'k', 'A', 'recette'); empiler(at, 'B', 1, ['A']); P.modifierCampagne(at, 'k', (c) => { c.items[0].statut = 'fusionnee'; });
  const k = P.contexte(at, 'k'); assert.deepEqual(k.a_rebaser, ['B']); assert.match(k.consigne, /Admission empilée \(v2\.8\)/);
  P.desempiler(at, 'k', 'B'); assert.deepEqual(P.contexte(at, 'k').a_rebaser, []);
});
test('2.8 : chaîne critique et admissibles dans contexte', () => {
  const at = campagneChaine(); const k = P.contexte(at, 'k');
  assert.deepEqual(k.chaine_critique, ['A', 'B', 'C', 'D', 'E']);
  assert.ok(k.admissibles.includes('B (empilée sur A)')); assert.ok(k.admissibles.includes('Y (empilée sur X)')); assert.equal(k.admissibles.some((x) => x.startsWith('S')), false);
});
test('2.8 : la file lourde sert la plus haute priorité dont la campagne a une place, puis la plus ancienne', () => {
  const t = [{ pid: 1, campagne: 'a', priorite: 0, depuis: '1' }, { pid: 2, campagne: 'b', priorite: 1005, depuis: '3' }, { pid: 3, campagne: 'a', priorite: 4, depuis: '2' }, { pid: 4, campagne: 'a', priorite: 4, depuis: '1' }];
  assert.equal(P.prochainLourd(t, () => true), 2);
  assert.equal(P.prochainLourd(t, (c) => c !== 'b'), 4, 'campagne b pleine : la plus prioritaire de a, la plus ancienne à égalité');
  assert.equal(P.prochainLourd([], () => true), null);
});
test('2.8 : veille sur secteur coupée tant que la file du poste n’est pas vide, restaurée ensuite', () => {
  assert.equal(P.decisionVeille(2, null), 'desactiver'); assert.equal(P.decisionVeille(1, { STANDBYIDLE: 0 }), 'rien');
  assert.equal(P.decisionVeille(0, { STANDBYIDLE: 0, HIBERNATEIDLE: 10800 }), 'restaurer'); assert.equal(P.decisionVeille(0, null), 'rien');
  assert.equal(P.garderEveilSecteur(configTest({ atelier_simule: '/x' }), 3).action, 'rien', 'jamais en simulation');
});

test('2.8.1 : le retour sous la garde CPU avec une place libre et une issue admissible déclenche la reprise', () => {
  const f = path.join(os.tmpdir(), 'pression-281-' + process.pid);
  const at = configTest({ hote: 'atelier', deploiement_serveurs: false, admission: { dev_max: 2, lourdes_max: 1, garde_cpu_pct: 40, pression_cpu_fichier: f } });
  fs.mkdirSync(path.join(at.etat, 'campagnes'), { recursive: true });
  fs.writeFileSync(path.join(at.etat, 'campagnes', 'k.json'), JSON.stringify({ id: 'k', projet: 'p', mode: 'auto', statut: 'en_cours', chat: 'C', items: [{ type: 'issue_standalone', linear_id: 'DEV-1', statut: 'revue', blocked_by: [] }, { type: 'issue_standalone', linear_id: 'DEV-2', statut: 'en_attente', blocked_by: [] }] }));
  fs.writeFileSync(f, 'some avg10=70.00 avg60=60.00 avg300=50.00 total=1\n'); const sature = P.empreinteReprise(at, P.lireCampagne(at, 'k'));
  fs.writeFileSync(f, 'some avg10=5.00 avg60=6.00 avg300=20.00 total=1\n'); const libre = P.empreinteReprise(at, P.lireCampagne(at, 'k'));
  assert.notEqual(sature, libre, 'garde repassée : changement');
  fs.writeFileSync(f, 'some avg10=5.00 avg60=7.00 avg300=20.00 total=1\n'); assert.equal(P.empreinteReprise(at, P.lireCampagne(at, 'k')), libre, 'variation sous la garde : pas de changement');
  fs.rmSync(f, { force: true });
});



test('2.8.2 : $dev livrer lance l’exécuteur directement, au premier plan, sans session codex exec', async () => {
  const c = configTest({ deploiement_serveurs: true, maintien_eveille: false, chat_local: { actif: false, option: 'b' }, codexExecutable: '/inexistant/codex', projets: {} }); c.appServerFactice = path.join(c.etat, 'as.jsonl');
  const journalSsh = path.join(c.etat, 'ssh.jsonl'); const scenario = path.join(c.etat, 'scenario.json'); fs.writeFileSync(scenario, JSON.stringify({ journal: journalSsh }));
  process.env.FAUX_SSH_SCENARIO = scenario; c.ssh_commande = [process.execPath, fileURLToPath(new URL('./faux-ssh.mjs', import.meta.url))];
  const paquet = path.join(c.etat, 'paquet.tgz'); fs.writeFileSync(paquet, 'octets'); const retour = path.join(c.etat, 'retour.md'); fs.writeFileSync(retour, '# retour');
  P.composer(c, { nom: 'livd', projet: 'deployeur', ids: ['DEV-9'], mode: 'supervise', hoteLivraison: 'local' });
  const plan = path.join(c.etat, 'plan-livraison.md');
  fs.writeFileSync(plan, '# Plan\n\n' + '```json livraison\n' + JSON.stringify({ cibles: { s: { ssh: 's', chemin_disque: '/', disque_min_gio: 1, version: 'cat /srv/VERSION' } }, paquet: { chemin: paquet, sha256: P.sha256Fichier(paquet) }, retour_arriere: { procedure: retour }, etapes: [{ id: '1', titre: 'copie', cible: 's', commande: 'deposer-paquet', retour: 'R1' }], verification: [] }) + '\n```\n');
  P.goLivraison(c, 'livd', plan);
  const ab = await P.livrer(c, 'livd', { aBlanc: true }); assert.equal(ab.code, 0); assert.equal(ab.session_pid, undefined, 'aucune session codex exec'); assert.match(ab.journal, /-a-blanc$/);
  const r = await P.livrer(c, 'livd'); assert.equal(r.code, 0); assert.match(r.message, /terminée/);
  assert.ok(fs.readFileSync(journalSsh, 'utf8').includes('deposer-paquet'), 'les étapes sont exécutées par l’exécuteur lui-même');
  await assert.rejects(P.livrer(c, 'livd'), (e) => e.titre === 'GO DÉJÀ UTILISÉ');
});


test('2.8.3 : orchestrateur au repos avec une admission possible relancé après 20 min, sinon horaire ; --dry-run vaut --a-blanc ; campagne absente nommée', () => {
  const f = path.join(os.tmpdir(), 'pression-283-' + process.pid); fs.writeFileSync(f, 'some avg10=5.00 avg60=6.00 avg300=9.00 total=1\n');
  const at = configTest({ hote: 'atelier', deploiement_serveurs: false, admission: { dev_max: 2, lourdes_max: 1, garde_cpu_pct: 40, pression_cpu_fichier: f } });
  fs.mkdirSync(path.join(at.etat, 'campagnes'), { recursive: true });
  fs.writeFileSync(path.join(at.etat, 'campagnes', 'k.json'), JSON.stringify({ id: 'k', projet: 'p', mode: 'auto', statut: 'en_cours', chat: 'C', items: [{ type: 'issue_standalone', linear_id: 'DEV-1', statut: 'revue', blocked_by: [] }, { type: 'issue_standalone', linear_id: 'DEV-2', statut: 'en_attente', blocked_by: [] }] }));
  P.modifierCampagne(at, 'k', (c) => { c.empreinte_repos = P.empreinteReprise(at, c); c.repos_le = new Date().toISOString(); c.dernier_reveil = new Date(Date.now() - 30 * 60000).toISOString(); });
  const t = (m) => new Date(Date.now() + m * 60000);
  assert.equal(P.decisionReprise(at, P.lireCampagne(at, 'k'), { maintenant: t(15) }).relancer, false);
  const d = P.decisionReprise(at, P.lireCampagne(at, 'k'), { maintenant: t(21) }); assert.equal(d.relancer, true); assert.match(d.raison, /admission possible/);
  fs.writeFileSync(f, 'some avg10=70.00 avg60=65.00 avg300=50.00 total=1\n');
  P.modifierCampagne(at, 'k', (c) => { c.empreinte_repos = P.empreinteReprise(at, c); });
  assert.equal(P.decisionReprise(at, P.lireCampagne(at, 'k'), { maintenant: t(21) }).relancer, false, 'CPU au-dessus de la garde : relance horaire seulement');
  fs.rmSync(f, { force: true });
  assert.equal(code(() => P.lireCampagne(at, '--aide')), 'CAMPAGNE ABSENTE'); assert.equal(code(() => P.lireCampagne(at, undefined)), 'CAMPAGNE ABSENTE');
  const dep = path.join(at.etat, 'depot'); fs.mkdirSync(dep); at.projets = { p: { chemin: dep } };
  const r = P.executer(['ouvrir', 'k', 'DEV-2', '--dry-run', '--fiche', 'fiche'], at); assert.equal(r.a_blanc, true); assert.equal(P.issues(P.lireCampagne(at, 'k'))[1].statut, 'en_attente', 'aucun effet');
});


test('2.8.4 : clôture refusée tant que la branche d’une issue autonome n’est pas fusionnée dans la branche principale ; --sans-fusion journalisé', () => {
  const at = configTest({ hote: 'atelier', deploiement_serveurs: false, gh: false });
  const g = (cwd, ...a) => { const r = spawnSync('git', ['-C', cwd, ...a], { encoding: 'utf8' }); if (r.status) throw new Error(a.join(' ') + ' : ' + r.stderr); return r.stdout.trim(); };
  const nu = path.join(at.etat, 'origine.git'); spawnSync('git', ['init', '-q', '--bare', '-b', 'master', nu]);
  const dep = path.join(at.etat, 'depot'); spawnSync('git', ['clone', '-q', nu, dep]); g(dep, 'config', 'user.email', 't@t'); g(dep, 'config', 'user.name', 't');
  g(dep, 'checkout', '-q', '-b', 'master'); fs.writeFileSync(path.join(dep, 'a.txt'), '1'); g(dep, 'add', '.'); g(dep, 'commit', '-q', '-m', 'base'); g(dep, 'push', '-q', '-u', 'origin', 'master');
  g(dep, 'checkout', '-q', '-b', 'codex/issue-DEV-1'); fs.writeFileSync(path.join(dep, 'b.txt'), '2'); g(dep, 'add', '.'); g(dep, 'commit', '-q', '-m', 'dev'); g(dep, 'push', '-q', '-u', 'origin', 'codex/issue-DEV-1');
  at.projets = { p: { chemin: dep, branche_principale: 'master' } };
  fs.mkdirSync(path.join(at.etat, 'campagnes'), { recursive: true });
  fs.writeFileSync(path.join(at.etat, 'campagnes', 'k.json'), JSON.stringify({ id: 'k', projet: 'p', mode: 'auto', statut: 'en_cours', items: [{ type: 'issue_standalone', linear_id: 'DEV-1', statut: 'recette', branche: 'codex/issue-DEV-1', blocked_by: [] }, { type: 'issue_standalone', linear_id: 'DEV-2', statut: 'recette', branche: 'codex/issue-DEV-2', blocked_by: [] }] }));
  const mat = (id) => { const f = path.join(at.etat, id + '.json'); fs.writeFileSync(f, JSON.stringify({ issue: id, criteres: [{ critere: 'c', statut: 'ok', preuve: 'p' }] })); return f; };
  assert.equal(code(() => P.statutIssue(at, 'k', 'DEV-1', 'close', mat('DEV-1'))), 'CLÔTURE SANS FUSION');
  g(dep, 'checkout', '-q', 'master'); g(dep, 'merge', '-q', '--no-ff', '-m', 'Merge pull request #1', 'codex/issue-DEV-1'); g(dep, 'push', '-q', 'origin', 'master');
  let r; try { r = P.statutIssue(at, 'k', 'DEV-1', 'close', mat('DEV-1')); } catch (e) { if (e.titre !== 'RECETTE INCOMPLÈTE') throw e; r = null; }
  if (r) assert.equal(r.statut, 'close');
  assert.equal(code(() => P.statutIssue(at, 'k', 'DEV-2', 'close', mat('DEV-2'))), 'CLÔTURE SANS FUSION', 'branche introuvable');
  assert.equal(P.verifierFusion(at, P.lireCampagne(at, 'k'), P.issues(P.lireCampagne(at, 'k'))[1], { sansFusion: 'revue sans diff' }).motif, 'revue sans diff');
});

test('2.8.5 : badge par options nommées ; badge ou décision incomplets refusés, sans ligne « undefined » au journal', () => {
  const at = configTest({ hote: 'atelier', deploiement_serveurs: false });
  assert.equal(P.executer(['badge', '--role', 'DEV', '--issue', 'DEV-7', '--projet', 'p', '--hote', 'atelier', '--modele', 'Sonnet'], at).badge, P.badge('DEV', 'DEV-7', 'p', 'atelier', 'Sonnet'));
  assert.ok(!P.executer(['badge', 'DEV', '-', 'p', 'local', 'Haiku'], at).badge.includes('undefined'));
  assert.equal(code(() => P.executer(['badge', 'DEV'], at)), 'BADGE INCOMPLET');
  fs.mkdirSync(path.join(at.etat, 'campagnes'), { recursive: true });
  fs.writeFileSync(path.join(at.etat, 'campagnes', 'k.json'), JSON.stringify({ id: 'k', projet: 'p', mode: 'auto', statut: 'en_cours', items: [] }));
  assert.equal(code(() => P.executer(['decision', 'k'], at)), 'DÉCISION VIDE');
  assert.equal(code(() => P.executer(['decision', 'k', 'DEV-1'], at)), 'DÉCISION VIDE');
  const j = path.join(at.etat, 'campagnes', 'k.decisions.md'); assert.ok(!fs.existsSync(j) || !fs.readFileSync(j, 'utf8').includes('undefined'));
  P.executer(['decision', 'k', 'DEV-1', 'choix', 'noté'], at); assert.match(fs.readFileSync(j, 'utf8'), /DEV-1 · choix noté/);
});


test('2.9 : places libérées par l’attente extérieure, CADREUR REQUIS, cadreurs lancés par le réveil, ligne d’état honnête', async () => {
  const at = configTest({ hote: 'atelier', deploiement_serveurs: false, gh: false });
  fs.mkdirSync(path.join(at.etat, 'campagnes'), { recursive: true });
  const it = (id, statut, extra = {}) => ({ type: 'issue_standalone', linear_id: id, statut, blocked_by: [], ...extra });
  fs.writeFileSync(path.join(at.etat, 'campagnes', 'k.json'), JSON.stringify({ id: 'k', projet: 'p', mode: 'auto', statut: 'en_cours', items: [it('DEV-1', 'revue'), it('DEV-2', 'revue'), it('DEV-3', 'recette'), it('DEV-4', 'en_attente', { blocked_by: ['DEV-1'] })] }));
  assert.equal(code(() => P.statutIssue(at, 'k', 'DEV-1', 'revue', null, { attend: 'paul', quoi: 'choisir A ou B' })), 'CADREUR REQUIS');
  assert.equal(code(() => P.executer(['arret', 'k', 'DEV-1', '--attend', 'paul', '--quoi', 'choisir'], at)), 'CADREUR REQUIS');
  P.executer(['arret', 'k', 'DEV-2', '--attend', 'paul', '--quoi', 'lancer la commande root', '--irreversible', 'commande sudo sur atelier'], at);
  P.decision(at, 'k', 'DEV-1', 'cadrage de déblocage ouvert (deblocage-DEV-1)');
  assert.equal(code(() => P.statutIssue(at, 'k', 'DEV-1', 'revue', null, { attend: 'paul', quoi: 'x' })), 'CADREUR REQUIS', 'une ouverture de cadrage ne vaut pas conclusion');
  P.decision(at, 'k', 'DEV-1', 'Conclusion du cadreur : option A retenue sauf avis contraire ; réservé à Paul : oui');
  P.statutIssue(at, 'k', 'DEV-1', 'revue', null, { attend: 'paul', quoi: 'confirmer option A' });
  const l = P.issues(P.lireCampagne(at, 'k'));
  assert.deepEqual(P.actifsAdmission(l).map((i) => i.linear_id), ['DEV-3'], 'les issues qui attendent Paul libèrent leur place');
  assert.equal(P.ouvertesAdmission(l).length, 3); assert.equal(P.ouvertesMax(at), 8);
  const ligne = P.ligneEtat(at, 'k').ligne; assert.match(ligne, /^▶/); assert.match(ligne, /2 en attente hors agents/); assert.match(ligne, /Toi : .*décider pour DEV-1 \(confirmer option A\)/);
  const lances = []; const lanceur = async (cfg, o) => { lances.push(o); return { action: 'cree', chat: 'chat-' + o.args[0] }; };
  const t0 = new Date('2026-11-21T00:00:00Z'); const k = () => P.lireCampagne(at, 'k');
  assert.equal(await P.cadreursAuto(at, k(), { maintenant: t0, lanceur }), null, 'premier passage : état mémorisé');
  assert.equal(await P.cadreursAuto(at, k(), { maintenant: new Date(+t0 + 60 * 60000), lanceur }), null, 'immobile depuis 1 h seulement');
  const r = await P.cadreursAuto(at, k(), { maintenant: new Date(+t0 + 125 * 60000), lanceur });
  assert.deepEqual(r.lances.map((x) => x.issue), ['DEV-3'], 'DEV-1 attend Paul après cadrage, DEV-2 est irréversible, DEV-4 attend sa dépendance');
  assert.equal(lances[0].depuisRole, 'AUTO'); assert.equal(lances[0].nouveau, true); assert.match(lances[0].fiche, /Conclusion du cadreur/);
  assert.equal(P.issues(k()).find((i) => i.linear_id === 'DEV-3').cadreur.chat, 'chat-deblocage-DEV-3');
  assert.equal(await P.cadreursAuto(at, k(), { maintenant: new Date(+t0 + 130 * 60000), lanceur }), null, 'le journal a bougé : nouvel état');
  P.statutIssue(at, 'k', 'DEV-2', 'en_cours'); P.statutIssue(at, 'k', 'DEV-1', 'en_cours');
  assert.match(P.ligneEtat(at, 'k').ligne, /Toi : rien/, 'attente levée');
});

