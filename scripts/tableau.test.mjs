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
const brut = (port, chemin, headers) => new Promise((ok, ko) => http.get({ host: '127.0.0.1', port, path: chemin, headers }, (r) => { let d = ''; r.on('data', (x) => { d += x; }); r.on('end', () => ok({ code: r.statusCode, corps: JSON.parse(d) })); }).on('error', ko));
const json = async (u, init) => { const r = await fetch(u, init); return { code: r.status, type: r.headers.get('content-type'), corps: r.status === 405 || r.status === 403 || r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() }; };

test('tableau : 127.0.0.1 seulement, lecture seule, fichiers de la page, hôte étranger refusé', async () => {
  const cfg = cfgTest(); const s = await T.servir(cfg, { port: 0 });
  try {
    assert.equal(s.serveur.address().address, '127.0.0.1'); assert.ok(s.port > 0); assert.equal(JSON.parse(fs.readFileSync(T.fichierEtat(cfg), 'utf8')).port, s.port);
    const v = await json(s.url + 'api/version'); assert.equal(v.code, 200); assert.equal(v.corps.version, VERSION); assert.equal(v.corps.lecture_seule, true); assert.equal(v.corps.rafraichissement_s, 60);
    assert.equal((await json(s.url, { method: 'POST' })).corps.refus, 'MÉTHODE REFUSÉE');
    assert.equal((await brut(s.port, '/api/point', { Host: 'evil.example' })).corps.refus, 'HÔTE REFUSÉ', 'protection contre le DNS rebinding');
    assert.equal((await brut(s.port, '/api/version', { Host: 'localhost:' + s.port })).code, 200);
    assert.equal((await json(s.url + 'inconnu.txt')).code, 404); assert.equal((await json(s.url + '../pilote.mjs')).code, 404);
    const page = await json(s.url); assert.equal(page.code, 200); assert.match(page.type, /text\/html/); assert.match(page.corps, /Tableau de bord/);
    assert.match((await json(s.url + 'style.css')).type, /text\/css/); assert.match((await json(s.url + 'app.js')).type, /javascript/);
  } finally { await s.fermer(); }
});

test('tableau : point et chats recopiés du pilote, cache et appel unique en vol, chats clos ou archivés exclus', async () => {
  const cfg = cfgTest(); const s = await T.servir(cfg, { port: 0 });
  try {
    const [a, b] = await Promise.all([json(s.url + 'api/point'), json(s.url + 'api/point')]);
    assert.equal(a.corps.point.campagnes[0].campagne, 'demo'); assert.equal(a.corps.erreur, null); assert.equal(a.corps.releve_le, b.corps.releve_le);
    await json(s.url + 'api/point'); assert.deepEqual(journal(), ['point'], 'un seul appel du pilote pour trois lectures');
    const c = await json(s.url + 'api/chats'); assert.equal(c.corps.atelier_injoignable, null);
    assert.deepEqual(c.corps.chats.map((x) => x.chat_id), ['b', 'a'], 'triés par hôte, sans archive ni a_creer');
    assert.equal(c.corps.chats[0].ligne_etat, '⏸ À TOI · GO · Toi : décider'); assert.equal(c.corps.chats[0].statut, 'attente_go'); assert.equal(c.corps.chats[1].ligne_etat, null, 'chat du poste non relevé');
    assert.deepEqual(journal(), ['point', 'chats --deux-hotes']);
  } finally { await s.fermer(); }
});

test('tableau : atelier injoignable, les derniers chiffres restent et l’erreur est affichée', async () => {
  const cfg = cfgTest({ tableau: { cache_s: 0 } }); const s = await T.servir(cfg, { port: 0 });
  try {
    const a = await json(s.url + 'api/point'); assert.equal(a.corps.erreur, null);
    process.env.FAUX_ECHEC = '1';
    const b = await json(s.url + 'api/point'); assert.match(b.corps.erreur, /ATELIER INJOIGNABLE/); assert.equal(b.corps.point.campagnes[0].campagne, 'demo'); assert.equal(b.corps.releve_le, a.corps.releve_le);
    const c = await json(s.url + 'api/chats'); assert.match(c.corps.erreur, /ATELIER INJOIGNABLE/); assert.deepEqual(c.corps.chats, []);
  } finally { delete process.env.FAUX_ECHEC; await s.fermer(); }
});

test('tableau : pilote réel avec atelier simulé, point et chats des deux hôtes', async () => {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'tableau-reel-')); const base = (h) => ({ hote: h, etat: path.join(racine, h), admission: { dev_max: 4, lourdes_max: 1 }, modeles: { cerveau: 'claude-opus-5-5', dev: ['claude-opus-5-5'], controle: ['claude-sonnet-5-5'], ouvrier: ['claude-haiku-5-5'], lecteur: { jusqu_a_100k: 'claude-haiku-5-5', au_dela: 'claude-sonnet-5-5' }, sous_agents: ['claude-haiku-5-5', 'claude-opus-5-5'] }, opencodex_dir: path.join(racine, h, 'ocx') });
  const at = base('atelier'); fs.mkdirSync(path.join(at.etat, 'campagnes'), { recursive: true });
  fs.writeFileSync(path.join(at.etat, 'campagnes', 'demo.json'), JSON.stringify({ id: 'demo', projet: 'p', mode: 'auto', statut: 'en_cours', items: [{ type: 'issue_standalone', linear_id: 'DEV-1', projet: 'p', statut: 'en_cours' }, { type: 'issue_standalone', linear_id: 'DEV-2', projet: 'p', statut: 'close', close_le: new Date().toISOString() }] }));
  fs.writeFileSync(path.join(at.etat, 'chats.json'), JSON.stringify({ x1: { chat_id: 'x1', titre: '🟢 AUTO · p · demo · 50%', statut: 'actif', role: 'AUTO', dossier: '01 Campagnes', derniere_ligne: '▶ EN COURS · DEV-1 dev · Toi : rien' } }));
  const fa = path.join(racine, 'atelier.json'); fs.writeFileSync(fa, JSON.stringify(at));
  const po = { ...base('local'), atelier_simule: fa, tableau: { cache_s: 0 } }; fs.mkdirSync(po.etat, { recursive: true });
  fs.writeFileSync(path.join(po.etat, 'chats.json'), JSON.stringify({ l1: { chat_id: 'l1', titre: '❓ AIDE · workflow', statut: 'actif', role: 'AIDE', hote: 'local', dossier: '00 Accueil' } }));
  const fp = path.join(racine, 'poste.json'); fs.writeFileSync(fp, JSON.stringify(po));
  const s = await T.servir({ ...po, pilote: PILOTE_REEL }, { port: 0, fichierConfig: fp });
  try {
    const p = await json(s.url + 'api/point'); assert.equal(p.corps.erreur, null, p.corps.erreur); assert.equal(p.corps.point.campagnes[0].campagne, 'demo'); assert.equal(p.corps.point.campagnes[0].closes, 1); assert.match(p.corps.point.rendu, /\*\*Campagnes\*\*/);
    const c = await json(s.url + 'api/chats'); assert.equal(c.corps.erreur, null, c.corps.erreur); assert.equal(c.corps.atelier_injoignable, null);
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
  try { assert.equal(d.actif, true); assert.equal(d.deja_actif, false); assert.ok(d.pid > 0); assert.match(d.consigne, /navigateur intégré/); assert.equal((await json(d.url + 'api/version')).corps.version, VERSION); }
  finally { const a = await T.arreter(cfg); assert.equal(a.arrete, true); assert.equal(await T.trouverServeur(cfg, 300), null); }
  await assert.rejects(T.commande(cfg, 'bidule'), (e) => e.titre === 'SOUS-COMMANDE INCONNUE');
});

