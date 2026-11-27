import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import * as T from './tableau.mjs';
import { VERSION } from './pilote.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const PILOTE_REEL = path.join(ICI, 'pilote.mjs');
const FAUX = `import fs from 'node:fs';
const [cmd, ...rest] = process.argv.slice(2);
fs.appendFileSync(process.env.FAUX_JOURNAL, [cmd, ...rest].join(' ') + '\\n');
if (process.env.FAUX_ECHEC === '1') { console.error('ATELIER INJOIGNABLE — ssh : connexion refusée'); process.exit(6); }
if (cmd === 'point') console.log(JSON.stringify({ genere_le: new Date().toISOString(), campagnes: [{ campagne: 'demo', mode: 'auto', closes: 1, total: 3, ligne_etat: '▶ EN COURS · 2 agent(s) · Toi : rien', arrets: [] }], actions_paul: [], ressources: { hote: 'atelier' }, ligne_etat: '✅ TERMINÉ · point fait · Toi : rien', rendu: '**Campagnes**' }));
else if (cmd === 'chats') console.log(JSON.stringify({ hote: 'local', chats: [{ chat_id: 'a', titre: '❓ AIDE · workflow', statut: 'actif', role: 'AIDE', hote: 'local', dossier: '00 Accueil' }, { chat_id: 'b', titre: '🟢 AUTO · p · c', statut: 'attente_go', hote: 'atelier', derniere_ligne: '⏸ À TOI · GO · Toi : décider', derniere_ligne_le: '2026-11-27T08:00:00.000Z' }, { chat_id: 'c', titre: 'vieux', statut: 'archive' }, { chat_id: 'a_creer-x', titre: 'à créer', statut: 'a_creer' }], atelier_injoignable: null }));
else { console.error('COMMANDE INCONNUE — ' + cmd); process.exit(2); }
`;
function cfgTest(extra = {}) {
  const etat = fs.mkdtempSync(path.join(os.tmpdir(), 'tableau-')); const faux = path.join(etat, 'faux-pilote.mjs'); fs.writeFileSync(faux, FAUX);
  process.env.FAUX_JOURNAL = path.join(etat, 'journal.txt'); fs.writeFileSync(process.env.FAUX_JOURNAL, ''); delete process.env.FAUX_ECHEC;
  return { hote: 'local', etat, pilote: faux, modeles: {}, tableau: { cache_s: 60 }, ...extra };
}
const journal = () => fs.readFileSync(process.env.FAUX_JOURNAL, 'utf8').split('\n').filter(Boolean);
const portLibre = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const base = (s) => 'http://127.0.0.1:' + s.port + '/';
const brut = (port, chemin, headers) => new Promise((ok, ko) => http.get({ host: '127.0.0.1', port, path: chemin, headers }, (r) => { let d = ''; r.on('data', (x) => { d += x; }); r.on('end', () => ok({ code: r.statusCode, corps: JSON.parse(d) })); }).on('error', ko));
const json = async (u, init) => { const r = await fetch(u, init); return { code: r.status, type: r.headers.get('content-type'), corps: r.status === 405 || r.status === 403 || r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() }; };

test('tableau : 127.0.0.1 seulement, lecture seule, fichiers de la page, hôte étranger refusé', async () => {
  const cfg = cfgTest(); const s = await T.servir(cfg, { port: 0 });
  try {
    assert.equal(s.serveur.address().address, '127.0.0.1'); assert.ok(s.port > 0); assert.equal(JSON.parse(fs.readFileSync(T.fichierEtat(cfg), 'utf8')).port, s.port);
    const v = await json(base(s) + 'api/version'); assert.equal(v.code, 200); assert.equal(v.corps.version, VERSION); assert.ok(Array.isArray(v.corps.actions)); assert.equal(v.corps.rafraichissement_s, 60);
    assert.equal((await json(base(s), { method: 'POST' })).corps.refus, 'INCONNU', 'POST ailleurs que /api/action'); assert.equal((await json(base(s) + 'api/point', { method: 'PUT' })).corps.refus, 'MÉTHODE REFUSÉE');
    assert.equal((await brut(s.port, '/api/point', { Host: 'evil.example' })).corps.refus, 'HÔTE REFUSÉ', 'protection contre le DNS rebinding');
    assert.equal((await brut(s.port, '/api/version', { Host: 'localhost:' + s.port })).code, 200);
    assert.equal((await json(base(s) + 'inconnu.txt')).code, 404); assert.equal((await json(base(s) + '../pilote.mjs')).code, 404);
    const page = await json(s.url); assert.equal(page.code, 200); assert.match(page.type, /text\/html/); assert.match(page.corps, /Tableau de bord/);
    assert.match((await json(base(s) + 'style.css')).type, /text\/css/); assert.match((await json(base(s) + 'app.js')).type, /javascript/);
  } finally { await s.fermer(); }
});

test('tableau : point et chats recopiés du pilote, cache et appel unique en vol, chats clos ou archivés exclus', async () => {
  const cfg = cfgTest(); const s = await T.servir(cfg, { port: 0 });
  try {
    const [a, b] = await Promise.all([json(base(s) + 'api/point'), json(base(s) + 'api/point')]);
    assert.equal(a.corps.point.campagnes[0].campagne, 'demo'); assert.equal(a.corps.erreur, null); assert.equal(a.corps.releve_le, b.corps.releve_le);
    await json(base(s) + 'api/point'); assert.deepEqual(journal(), ['point'], 'un seul appel du pilote pour trois lectures');
    const c = await json(base(s) + 'api/chats'); assert.equal(c.corps.atelier_injoignable, null);
    assert.deepEqual(c.corps.chats.map((x) => x.chat_id), ['b', 'a'], 'triés par hôte, sans archive ni a_creer');
    assert.equal(c.corps.chats[0].ligne_etat, '⏸ À TOI · GO · Toi : décider'); assert.equal(c.corps.chats[0].statut, 'attente_go'); assert.equal(c.corps.chats[1].ligne_etat, null, 'chat du poste non relevé');
    assert.deepEqual(journal(), ['point', 'chats --deux-hotes']);
  } finally { await s.fermer(); }
});

test('tableau : atelier injoignable, les derniers chiffres restent et l’erreur est affichée', async () => {
  const cfg = cfgTest({ tableau: { cache_s: 0 } }); const s = await T.servir(cfg, { port: 0 });
  try {
    const a = await json(base(s) + 'api/point'); assert.equal(a.corps.erreur, null);
    process.env.FAUX_ECHEC = '1';
    const b = await json(base(s) + 'api/point'); assert.match(b.corps.erreur, /ATELIER INJOIGNABLE/); assert.equal(b.corps.point.campagnes[0].campagne, 'demo'); assert.equal(b.corps.releve_le, a.corps.releve_le);
    const c = await json(base(s) + 'api/chats'); assert.match(c.corps.erreur, /ATELIER INJOIGNABLE/); assert.deepEqual(c.corps.chats, []);
  } finally { delete process.env.FAUX_ECHEC; await s.fermer(); }
});

test('tableau : pilote réel avec atelier simulé, point et chats des deux hôtes', async () => {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'tableau-reel-')); const cfgHote = (h) => ({ hote: h, etat: path.join(racine, h), admission: { dev_max: 4, lourdes_max: 1 }, modeles: { cerveau: 'claude-opus-5-5', dev: ['claude-opus-5-5'], controle: ['claude-sonnet-5-5'], ouvrier: ['claude-haiku-5-5'], lecteur: { jusqu_a_100k: 'claude-haiku-5-5', au_dela: 'claude-sonnet-5-5' }, sous_agents: ['claude-haiku-5-5', 'claude-opus-5-5'] }, opencodex_dir: path.join(racine, h, 'ocx') });
  const at = cfgHote('atelier'); fs.mkdirSync(path.join(at.etat, 'campagnes'), { recursive: true });
  fs.writeFileSync(path.join(at.etat, 'campagnes', 'demo.json'), JSON.stringify({ id: 'demo', projet: 'p', mode: 'auto', statut: 'en_cours', items: [{ type: 'issue_standalone', linear_id: 'DEV-1', projet: 'p', statut: 'en_cours' }, { type: 'issue_standalone', linear_id: 'DEV-2', projet: 'p', statut: 'close', close_le: new Date().toISOString() }] }));
  fs.writeFileSync(path.join(at.etat, 'chats.json'), JSON.stringify({ x1: { chat_id: 'x1', titre: '🟢 AUTO · p · demo · 50%', statut: 'actif', role: 'AUTO', dossier: '01 Campagnes', derniere_ligne: '▶ EN COURS · DEV-1 dev · Toi : rien' } }));
  const fa = path.join(racine, 'atelier.json'); fs.writeFileSync(fa, JSON.stringify(at));
  const po = { ...cfgHote('local'), atelier_simule: fa, tableau: { cache_s: 0 } }; fs.mkdirSync(po.etat, { recursive: true });
  fs.writeFileSync(path.join(po.etat, 'chats.json'), JSON.stringify({ l1: { chat_id: 'l1', titre: '❓ AIDE · workflow', statut: 'actif', role: 'AIDE', hote: 'local', dossier: '00 Accueil' } }));
  const fp = path.join(racine, 'poste.json'); fs.writeFileSync(fp, JSON.stringify(po));
  const s = await T.servir({ ...po, pilote: PILOTE_REEL }, { port: 0, fichierConfig: fp });
  try {
    const p = await json(base(s) + 'api/point'); assert.equal(p.corps.erreur, null, p.corps.erreur); assert.equal(p.corps.point.campagnes[0].campagne, 'demo'); assert.equal(p.corps.point.campagnes[0].closes, 1); assert.match(p.corps.point.rendu, /\*\*Campagnes\*\*/);
    const c = await json(base(s) + 'api/chats'); assert.equal(c.corps.erreur, null, c.corps.erreur); assert.equal(c.corps.atelier_injoignable, null);
    assert.deepEqual(c.corps.chats.map((x) => x.hote + ':' + x.chat_id), ['atelier:x1', 'local:l1']); assert.equal(c.corps.chats[0].ligne_etat, '▶ EN COURS · DEV-1 dev · Toi : rien');
  } finally { await s.fermer(); }
});

test('tableau : url sans serveur, servir idempotent sur un serveur déjà actif, démarrage détaché puis arrêt', async () => {
  const cfg = cfgTest({ tableau: { port: await portLibre(), cache_s: 60 } });
  const u0 = await T.commande(cfg, 'url'); assert.equal(u0.actif, false); assert.match(u0.url, /^http:\/\/127\.0\.0\.1:\d+\/$/); assert.equal((await T.commande(cfg, 'arret')).arrete, false);
  const s = await T.servir(cfg, { port: 0 });
  try { const d = await T.demarrer(cfg); assert.equal(d.deja_actif, true); assert.equal(d.port, s.port, 'retrouvé par tableau.json malgré un port de config différent'); assert.equal((await T.commande(cfg, 'url')).actif, true); } finally { await s.fermer(); }
  assert.equal((await T.commande(cfg, 'url')).actif, false);
  const fc = path.join(cfg.etat, 'poste.local.json'); fs.writeFileSync(fc, JSON.stringify(cfg));
  const d = await T.demarrer(cfg, { fichierConfig: fc });
  try { assert.equal(d.actif, true); assert.equal(d.deja_actif, false); assert.ok(d.pid > 0); assert.match(d.consigne, /navigateur intégré/); assert.equal((await json(base(d) + 'api/version')).corps.version, VERSION); }
  finally { const a = await T.arreter(cfg); assert.equal(a.arrete, true); assert.equal(await T.trouverServeur(cfg, 300), null); }
  await assert.rejects(T.commande(cfg, 'bidule'), (e) => e.titre === 'SOUS-COMMANDE INCONNUE');
});

const FAUX2 = `import fs from 'node:fs';
const [cmd, ...rest] = process.argv.slice(2);
const lu = () => { try { return fs.readFileSync(0, 'utf8'); } catch { return ''; } };
const hote = /atelier/.test(process.env.PILOTE_CONFIG || '') ? ' @atelier' : '';
const stdin = rest.some((x) => /-stdin$/.test(x)) ? lu() : '';
fs.appendFileSync(process.env.FAUX_JOURNAL, [cmd, ...rest].join(' ') + hote + (stdin ? ' <<' + stdin.replace(/\\n/g, '⏎') + '>>' : '') + '\\n');
if (process.env.FAUX_ECHEC === '1') { console.error('CADREUR REQUIS — DEV-1 : aucune conclusion de cadreur au journal'); process.exit(6); }
const plan = '# plan de livraison\\n- étape 1 : copier\\n';
const rep = { point: { genere_le: new Date().toISOString(), campagnes: [{ campagne: 'demo', mode: 'auto', statut: 'en_cours', closes: 1, total: 3, ligne_etat: '▶ EN COURS · Toi : rien', arrets: [] }], actions_paul: [], ressources: { hote: 'atelier' }, abonnement: { comptes: [{ id: 'abc123', compte: 'abc123', pct: 40, actif: true }] }, ligne_etat: '✅ TERMINÉ · point fait · Toi : rien', rendu: '**Campagnes**' },
  chats: { hote: 'local', chats: [] }, 'tableau-campagnes': { campagnes: [{ id: 'demo', projet: 'p', statut: 'en_cours', chat: null, hote_livraison: 'local', livraison_par_paul: false, livraison: { plan: '/etat/plans/demo.md', sha256: null } }, { id: 'livree-par-paul', projet: 'q', statut: 'en_cours', hote_livraison: 'local', livraison_par_paul: true, livraison: null }] },
  pause: { campagne: rest[0], statut: 'en_pause' }, reprendre: { campagne: rest[0], statut: 'en_cours' }, 'relancer-chat': { chat: rest[0], action: 'relance-acces' }, chat: { campagne: rest[0], chat: 'nouveau-chat' },
  lancer: { action: 'ouvrir', chat: 'x', titre: '🟣 CADRE · p · ' + rest.slice(1).join(' ') }, 'decision-globale': { inscrit: ['demo'] }, abonnement: { action: 'basculé', id: rest[1] }, menage: rest[0] === 'appliquer' ? { appliquees: 2 } : { lignes: 3 },
  'livraison-info': rest[0] === 'demo' ? { campagne: 'demo', projet: 'p', hote_livraison: 'local', livraison: { plan: '/etat/plans/demo.md' }, plan_texte: plan } : { campagne: rest[0], projet: 'q', livraison: null, plan_texte: plan }, 'livraison-go': { campagne: rest[0], go: { plan: rest[1] } } };
if (cmd in rep) console.log(JSON.stringify(rep[cmd])); else { console.error('COMMANDE INCONNUE — ' + cmd); process.exit(2); }
`;
function cfgV2(extra = {}) {
  const etat = fs.mkdtempSync(path.join(os.tmpdir(), 'tableau-v2-')); const faux = path.join(etat, 'faux-pilote.mjs'); fs.writeFileSync(faux, FAUX2);
  const atelier = path.join(etat, 'atelier.json'); fs.writeFileSync(atelier, JSON.stringify({ hote: 'atelier', etat: path.join(etat, 'atelier'), modeles: {} }));
  process.env.FAUX_JOURNAL = path.join(etat, 'journal.txt'); fs.writeFileSync(process.env.FAUX_JOURNAL, ''); delete process.env.FAUX_ECHEC;
  return { hote: 'local', etat, pilote: faux, modeles: { aide: 'gpt-6-luna' }, projets: { p: {}, q: {} }, livraison_par_paul: ['q'], atelier_simule: atelier, tableau: { cache_s: 60 }, ...extra };
}
const poster = (s, corps, { jeton = s.jeton, origine = 'http://127.0.0.1:' + s.port, headers = {} } = {}) => new Promise((ok, ko) => { const d = JSON.stringify(corps); const q = http.request({ host: '127.0.0.1', port: s.port, path: '/api/action', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d), ...(jeton ? { 'X-Jeton': jeton } : {}), ...(origine ? { Origin: origine } : {}), ...headers } }, (r) => { let b = ''; r.on('data', (x) => { b += x; }); r.on('end', () => ok({ code: r.statusCode, corps: JSON.parse(b) })); }); q.on('error', ko); q.end(d); });

test('tableau 3.4 : actions refusées sans jeton, avec un mauvais jeton, depuis une autre origine, ou inconnues', async () => {
  const cfg = cfgV2(); const s = await T.servir(cfg, { port: 0 });
  try {
    assert.match(s.url, /\?jeton=[0-9a-f]{24}$/); assert.equal(JSON.parse(fs.readFileSync(T.fichierEtat(cfg), 'utf8')).jeton, s.jeton);
    const v = await json(base(s) + 'api/version'); assert.deepEqual(v.corps.livraison_par_paul, ['q']); assert.deepEqual(v.corps.projets, ['p', 'q']); assert.ok(v.corps.actions.includes('livraison-go'));
    assert.equal((await poster(s, { action: 'pause', campagne: 'demo' }, { jeton: null })).corps.refus, 'JETON ABSENT');
    assert.equal((await poster(s, { action: 'pause', campagne: 'demo' }, { jeton: 'faux' })).corps.refus, 'JETON INVALIDE');
    assert.equal((await poster(s, { action: 'pause', campagne: 'demo' }, { origine: 'http://evil.example' })).corps.refus, 'ORIGINE REFUSÉE');
    assert.equal((await poster(s, { action: 'bidule' })).corps.refus, 'ACTION INCONNUE');
    assert.equal((await poster(s, { action: 'pause', campagne: 'demo; rm -rf' })).corps.refus, 'PARAMÈTRE INVALIDE');
    assert.equal((await poster(s, { action: 'relancer-chat', chat: 'pas un id' })).corps.refus, 'PARAMÈTRE INVALIDE');
    assert.equal((await poster(s, { action: 'lancer', commande: 'menage', fiche: 'x'.repeat(20) })).corps.refus, 'PARAMÈTRE INVALIDE', 'le ménage n’est pas un chat de travail');
    assert.equal((await poster(s, { action: 'lancer', commande: 'cadrage', args: 'sujet', fiche: Array(16).fill('ligne').join('\n') })).corps.message, 'fiche de lancement : 15 lignes au plus');
    assert.equal((await poster(s, { action: 'lancer', commande: 'cadrage', args: 'a; b', fiche: 'x'.repeat(20) })).corps.refus, 'PARAMÈTRE INVALIDE', 'argument avec métacaractère');
    assert.equal((await brut(s.port, '/api/version', { Host: 'localhost:' + s.port })).code, 200);
    assert.deepEqual(journal(), [], 'aucune commande du pilote jouée');
    const refus = T.lireJournal(cfg).map((l) => l.refus); assert.equal(refus.length, 6, 'les refus de validation sont journalisés, pas les refus de jeton'); assert.ok(refus.every((x) => ['PARAMÈTRE INVALIDE', 'ACTION INCONNUE'].includes(x)));
  } finally { await s.fermer(); }
});

test('tableau 3.4 : chaque action joue la commande du pilote attendue, sur le bon hôte, avec sa fiche ou son texte, et vide le cache', async () => {
  const cfg = cfgV2(); const s = await T.servir(cfg, { port: 0 });
  try {
    await json(base(s) + 'api/point'); assert.deepEqual(journal(), ['point']);
    const r1 = await poster(s, { action: 'pause', campagne: 'demo' }); assert.equal(r1.code, 200); assert.equal(r1.corps.resultat.statut, 'en_pause');
    await poster(s, { action: 'reprendre', campagne: 'demo' }); await poster(s, { action: 'relancer-chat', chat: '01a2-0000-1111-2222' }); await poster(s, { action: 'chat', campagne: 'demo' });
    const r2 = await poster(s, { action: 'lancer', commande: 'cadrage', args: 'espace client', projet: 'p', nouveau: true, fiche: 'Demande : cadrer l’espace client.\nContexte : rien.' }); assert.equal(r2.corps.resultat.action, 'ouvrir');
    await poster(s, { action: 'decision-globale', texte: 'Limite d’admission à 3.' }); await poster(s, { action: 'abonnement-compte', compte: 'abc123' }); await poster(s, { action: 'menage' }); await poster(s, { action: 'menage', appliquer: true });
    await json(base(s) + 'api/point');
    const j = journal();
    assert.deepEqual(j.slice(0, 5), ['point', 'pause demo', 'reprendre demo --motif Paul, via le tableau de bord', 'relancer-chat 01a2-0000-1111-2222 --motif relance demandée par Paul, via le tableau de bord @atelier', 'chat demo @atelier']);
    assert.equal(j[5], 'lancer cadrage espace client --depuis-role AIDE --depuis-modele gpt-6-luna --fiche-stdin --projet p --nouveau <<Demande : cadrer l’espace client.⏎Contexte : rien.>>');
    assert.match(j[6], /^decision-globale --texte-stdin @atelier <<Paul \(\d{4}-\d{2}-\d{2} \d{2}:\d{2}, via le tableau de bord\) : Limite d’admission à 3\.>>$/);
    assert.deepEqual(j.slice(7), ['abonnement compte abc123 @atelier', 'menage', 'menage appliquer surs', 'point'], 'le cache du point est vidé après une action');
    const jl = T.lireJournal(cfg); assert.equal(jl.length, 9); assert.ok(jl.every((l) => l.ok)); assert.equal(jl[0].action, 'menage'); assert.equal((await json(base(s) + 'api/journal')).corps.journal.length, 9);
    assert.match(jl.find((l) => l.action === 'lancer').params.fiche, /…$/, 'la fiche n’est pas journalisée en entier');
  } finally { await s.fermer(); }
});

test('tableau 3.4 : un refus du pilote est rendu tel quel et journalisé', async () => {
  const cfg = cfgV2(); const s = await T.servir(cfg, { port: 0 });
  try {
    process.env.FAUX_ECHEC = '1';
    const r = await poster(s, { action: 'pause', campagne: 'demo' }); assert.equal(r.code, 409); assert.equal(r.corps.ok, false); assert.equal(r.corps.refus, 'CADREUR REQUIS'); assert.match(r.corps.message, /aucune conclusion de cadreur/);
    const jl = T.lireJournal(cfg); assert.equal(jl[0].ok, false); assert.equal(jl[0].refus, 'CADREUR REQUIS');
  } finally { delete process.env.FAUX_ECHEC; await s.fermer(); }
});

test('tableau 3.4 : GO de livraison seulement sur l’empreinte du plan présenté, jamais pour un projet livré par Paul', async () => {
  const cfg = cfgV2(); const s = await T.servir(cfg, { port: 0 });
  try {
    const k = await json(base(s) + 'api/campagnes'); assert.equal(k.corps.campagnes.find((c) => c.id === 'livree-par-paul').livraison_par_paul, true);
    assert.equal((await poster(s, { action: 'livraison-go', campagne: 'livree-par-paul', empreinte: 'deadbeef', plan: 'x' })).corps.refus, 'LIVRAISON PAR PAUL');
    const info = await poster(s, { action: 'livraison-info', campagne: 'demo' }); assert.match(info.corps.resultat.plan_texte, /plan de livraison/);
    const emp = (await import('node:crypto')).createHash('sha256').update(info.corps.resultat.plan_texte).digest('hex');
    assert.equal((await poster(s, { action: 'livraison-go', campagne: 'demo', empreinte: 'zz' })).corps.refus, 'PARAMÈTRE INVALIDE');
    assert.equal((await poster(s, { action: 'livraison-go', campagne: 'demo', empreinte: '0123456789ab' })).corps.refus, 'EMPREINTE DIFFÉRENTE');
    const go = await poster(s, { action: 'livraison-go', campagne: 'demo', empreinte: emp.slice(0, 8) }); assert.equal(go.code, 200, JSON.stringify(go.corps)); assert.equal(go.corps.resultat.go.plan, '/etat/plans/demo.md');
    assert.ok(journal().includes('livraison-go demo /etat/plans/demo.md @atelier'), 'le GO est enregistré sur l’hôte d’exécution avec le plan présenté');
    assert.ok(!journal().some((l) => l.startsWith('livraison-go livree-par-paul')), 'aucune commande jouée pour le projet livré par Paul');
  } finally { await s.fermer(); }
});


