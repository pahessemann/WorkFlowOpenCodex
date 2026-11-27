#!/usr/bin/env node
// Tableau de bord du workflow $dev (3.4.0-test) : serveur HTTP local lié à 127.0.0.1, ouvert dans le navigateur intégré
// du chat ❓ AIDE. Lecture : pilote.mjs point et chats --deux-hotes. Actions (3.4) : POST /api/action, protégé par un jeton
// de session ; chaque action n’est qu’une commande existante du pilote, jouée sur le bon hôte, dont la réponse ou le refus
// est rendu tel quel. Le pilote est toujours exécuté hors du processus pour ne jamais bloquer la page.
// Usage : node tableau.mjs --servir [--port <n>]   (ou pilote.mjs tableau servir|url|arret)
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { lireConfig, Refus, VERSION, RACINE } from './pilote.mjs';

const ASSETS = path.join(RACINE, 'assets', 'tableau');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const VIVANTS = ['actif', 'attente_go', 'bloque', 'a_creer'];
const MOTIF = 'Paul, via le tableau de bord';
const refuser = (titre, message, code = 2) => { throw new Refus(titre, message, code); };

// Ports : Windows réserve des plages de 100 ports qui changent à chaque démarrage (Hyper-V, WSL) ; le serveur essaie le port voulu puis les ports de secours, et tableau.json garde le port effectif.
export const reglages = (cfg) => { const port = Number(cfg.tableau?.port || 8421); return { port, ports: [...new Set([port, ...(cfg.tableau?.ports_secours || [8521, 8621, 8721, 9421]).map(Number)])], rafraichissement_s: Number(cfg.tableau?.rafraichissement_s || 60), cache_s: Number(cfg.tableau?.cache_s ?? 60), pilote: cfg.pilote || path.join(RACINE, 'scripts', 'pilote.mjs') }; };
export const fichierEtat = (cfg) => path.join(cfg.etat, 'tableau.json');
export const fichierJournal = (cfg) => path.join(cfg.etat, 'tableau-actions.jsonl');
export const adresse = (port, jeton = null) => 'http://127.0.0.1:' + port + '/' + (jeton ? '?jeton=' + jeton : '');
const lireEtat = (cfg) => { try { return JSON.parse(fs.readFileSync(fichierEtat(cfg), 'utf8')); } catch { return null; } };
const surAtelier = (cfg) => cfg.hote === 'local' && !!(cfg.registre_distant || cfg.atelier_simule);

// Une commande du pilote, en JSON, hors du processus du serveur, sur le poste ou sur l’hôte d’exécution (SSH, ou atelier simulé en test).
// Un refus du pilote (stderr « TITRE — message », code ≠ 0) devient une erreur portant titre et message.
export function pilote(cfg, args, { delai = 120000, fichierConfig = null, entree = null, hote = 'local' } = {}) {
  const env = { ...process.env }; if (fichierConfig) env.PILOTE_CONFIG = fichierConfig;
  let exe = process.execPath, argv = [reglages(cfg).pilote, ...args];
  if (hote === 'atelier' && surAtelier(cfg)) {
    if (cfg.atelier_simule) env.PILOTE_CONFIG = cfg.atelier_simule;
    else { if (!cfg.ssh?.atelier || !cfg.pilote_atelier) return Promise.reject(Object.assign(new Error('ssh.atelier et pilote_atelier requis dans poste.local.json'), { titre: 'ATELIER INJOIGNABLE' })); const q = (x) => "'" + String(x).replace(/'/g, "'\\''") + "'"; exe = 'ssh'; argv = ['-o', 'BatchMode=yes', cfg.ssh.atelier, 'node ' + q(cfg.pilote_atelier) + ' ' + args.map(q).join(' ')]; }
  }
  return new Promise((ok, ko) => {
    const p = spawn(exe, argv, { windowsHide: true, env, stdio: ['pipe', 'pipe', 'pipe'] }); let out = '', err = ''; const t = setTimeout(() => { p.kill(); ko(Object.assign(new Error('délai dépassé (' + delai + ' ms) : ' + args[0]), { titre: 'DÉLAI DÉPASSÉ' })); }, delai);
    p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => { clearTimeout(t); ko(Object.assign(new Error(e.message), { titre: 'PILOTE INJOIGNABLE' })); });
    p.on('close', (code) => { clearTimeout(t);
      if (code !== 0 && !out.trim()) { const m = String(err || '').trim().split('\n')[0].slice(0, 300); const i = m.indexOf(' — '); return ko(Object.assign(new Error(i > 0 ? m.slice(i + 3) : m || 'échec sans message'), { titre: i > 0 ? m.slice(0, i) : 'ÉCHEC DU PILOTE', code })); }
      try { ok(JSON.parse(out)); } catch { ko(Object.assign(new Error('réponse illisible du pilote : ' + String(out).trim().slice(0, 200)), { titre: 'RÉPONSE ILLISIBLE' })); } });
    if (entree !== null) p.stdin.end(entree); else p.stdin.end();
  });
}

// Mémoire d’une route : une valeur, sa date, la dernière erreur ; un seul appel en vol ; la dernière valeur survit à un échec.
export function memoire(fn, cacheMs) {
  const m = { valeur: null, le: 0, erreur: null, enCours: null, appels: 0, vider: () => { m.le = 0; } };
  const lire = async () => {
    if (m.valeur && Date.now() - m.le < cacheMs) return m;
    if (m.enCours) return m.enCours;
    m.appels++;
    m.enCours = fn().then((v) => { m.valeur = v; m.le = Date.now(); m.erreur = null; }, (e) => { m.erreur = (e.titre ? e.titre + ' — ' : '') + e.message; if (!m.valeur) m.le = Date.now(); }).then(() => { m.enCours = null; return m; });
    return m.enCours;
  };
  lire.vider = m.vider; return lire;
}

export function chatsOuverts(reponse, cfg) {
  const liste = Array.isArray(reponse?.chats) ? reponse.chats : Object.values(reponse || {});
  return liste.filter((x) => x && x.titre && VIVANTS.includes(x.statut) && !String(x.chat_id || '').startsWith('a_creer'))
    .map((x) => ({ chat_id: x.chat_id, titre: x.titre, role: x.role || null, hote: x.hote || cfg.hote, dossier: x.dossier || null, statut: x.statut, modele: x.modele || null, ligne_etat: x.derniere_ligne || null, ligne_etat_le: x.derniere_ligne_le || null, derniere_activite: x.derniere_activite || x.cree_le || null }))
    .sort((a, b) => String(a.hote).localeCompare(String(b.hote)) || String(a.dossier || '').localeCompare(String(b.dossier || '')) || String(a.titre).localeCompare(String(b.titre)));
}

// ---------- actions (3.4) ----------
const RE = { campagne: /^[a-z0-9][a-z0-9._-]{0,80}$/i, chat: /^[0-9a-f][0-9a-f-]{7,40}$/i, mot: /^[^\s'"`$;&|<>\\]{1,80}$/, compte: /^[0-9a-f]{4,64}$/i, empreinte: /^[0-9a-f]{8,64}$/i };
const COMMANDES_LANCEUR = ['cadrage', 'issue', 'discuter', 'prototype'];
const invalide = (quoi) => refuser('PARAMÈTRE INVALIDE', quoi, 400);
const texteBorne = (s, min, max, quoi) => { const t = String(s ?? '').replace(/\r\n/g, '\n').trim(); if (t.length < min || t.length > max) invalide(quoi + ' : entre ' + min + ' et ' + max + ' caractères'); return t; };

// Catalogue des actions : chacune ne fait qu’assembler une commande du pilote. hote = où elle se joue.
export const ACTIONS = {
  pause: { hote: 'local', argv: (p) => ['pause', nom(p.campagne), ...(p.economie ? ['--economie'] : [])] },
  reprendre: { hote: 'local', argv: (p) => ['reprendre', nom(p.campagne), '--motif', MOTIF] },
  'relancer-chat': { hote: 'atelier', argv: (p) => { if (!RE.chat.test(String(p.chat || ''))) invalide('chat'); return ['relancer-chat', p.chat, '--motif', 'relance demandée par ' + MOTIF]; } },
  chat: { hote: 'atelier', argv: (p) => ['chat', nom(p.campagne)] },
  lancer: { hote: 'local', delai: 180000, argv: (p, cfg) => { if (!COMMANDES_LANCEUR.includes(p.commande)) invalide('commande : ' + COMMANDES_LANCEUR.join(', ')); const args = String(p.args || '').trim().split(/\s+/).filter(Boolean); if (args.length > 12 || args.some((a) => !RE.mot.test(a))) invalide('arguments'); if (p.projet && !cfg.projets?.[p.projet]) invalide('projet inconnu'); if (p.garder && !RE.chat.test(String(p.garder))) invalide('garder');
    return ['lancer', p.commande, ...args, '--depuis-role', 'AIDE', '--depuis-modele', cfg.modeles?.aide || 'gpt-6-luna', '--fiche-stdin', ...(p.projet ? ['--projet', p.projet] : []), ...(p.nouveau ? ['--nouveau'] : []), ...(p.garder ? ['--garder', p.garder] : [])]; }, entree: (p) => { const f = texteBorne(p.fiche, 10, 4000, 'fiche de lancement'); if (f.split('\n').length > 15) invalide('fiche de lancement : 15 lignes au plus'); return f; } },
  'livraison-info': { hote: 'local', argv: (p) => ['livraison-info', nom(p.campagne)] },
  'livraison-go': { hote: 'atelier', argv: (p) => { if (!RE.empreinte.test(String(p.empreinte || ''))) invalide('empreinte : au moins 8 caractères hexadécimaux du sha256 du plan'); return ['livraison-go', nom(p.campagne), String(p.plan || '')]; } },
  'decision-globale': { hote: 'atelier', argv: () => ['decision-globale', '--texte-stdin'], entree: (p) => 'Paul (' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ', via le tableau de bord) : ' + texteBorne(p.texte, 5, 2000, 'décision') },
  'abonnement-compte': { hote: 'atelier', argv: (p) => { if (!RE.compte.test(String(p.compte || ''))) invalide('compte'); return ['abonnement', 'compte', p.compte]; } },
  menage: { hote: 'local', delai: 180000, argv: (p) => p.appliquer ? ['menage', 'appliquer', 'surs'] : ['menage'] },
};
const nom = (c) => { if (!RE.campagne.test(String(c || ''))) invalide('campagne'); return c; };
const sha256 = (t) => createHash('sha256').update(t).digest('hex');

export async function jouerAction(cfg, { action, ...params }, { fichierConfig = null } = {}) {
  const spec = ACTIONS[action]; if (!spec) refuser('ACTION INCONNUE', String(action || '') + ' ; actions : ' + Object.keys(ACTIONS).join(', '), 400);
  const argv = spec.argv(params, cfg); const entree = spec.entree ? spec.entree(params) : null;
  if (action === 'livraison-go') { // la livraison par Paul (livraison_par_paul) n’a pas de bouton ; le pilote refuse de toute façon ; l’empreinte saisie doit être celle du plan présenté
    const info = await pilote(cfg, ['livraison-info', params.campagne], { fichierConfig });
    if ((cfg.livraison_par_paul || []).includes(info.projet)) refuser('LIVRAISON PAR PAUL', 'le projet ' + info.projet + ' est déployé par Paul depuis le déployeur', 403);
    if (!info.plan_texte) refuser('PLAN ABSENT', 'aucun plan de livraison présenté pour ' + params.campagne, 6);
    const emp = sha256(info.plan_texte); if (!emp.startsWith(String(params.empreinte).toLowerCase())) refuser('EMPREINTE DIFFÉRENTE', 'le plan présenté a l’empreinte ' + emp.slice(0, 12) + '… ; relis-le avant de donner le GO', 409);
    argv[2] = info.livraison?.plan || argv[2]; if (!argv[2]) refuser('PLAN ABSENT', 'chemin du plan inconnu', 6);
  }
  return pilote(cfg, argv, { fichierConfig, entree, hote: spec.hote, delai: spec.delai || 120000 });
}

// Campagnes vues par le tableau (projet, chat, livraison) : commande tableau-campagnes du pilote, sur l’hôte d’exécution.
async function campagnesTableau(cfg, fichierConfig) { const r = await pilote(cfg, ['tableau-campagnes'], { fichierConfig }); return (r.campagnes || []).map((c) => ({ ...c, livraison: c.livraison ? { ...c.livraison, empreinte: c.livraison.sha256 ? c.livraison.sha256.slice(0, 12) : null } : null })); }

function journaliser(cfg, ligne) { try { fs.mkdirSync(cfg.etat, { recursive: true }); fs.appendFileSync(fichierJournal(cfg), JSON.stringify({ le: new Date().toISOString(), ...ligne }) + '\n'); } catch {} }
export function lireJournal(cfg, n = 30) { try { return fs.readFileSync(fichierJournal(cfg), 'utf8').split('\n').filter(Boolean).slice(-n).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).reverse(); } catch { return []; } }

const repondre = (res, code, corps, type = 'application/json; charset=utf-8') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(typeof corps === 'string' || Buffer.isBuffer(corps) ? corps : JSON.stringify(corps, null, 2)); };
const iso = (t) => t ? new Date(t).toISOString() : null;
const lireCorps = (req, max = 65536) => new Promise((ok, ko) => { let d = ''; req.on('data', (x) => { d += x; if (d.length > max) { ko(Object.assign(new Error('corps trop long'), { titre: 'CORPS TROP LONG' })); req.destroy(); } }); req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch { ko(Object.assign(new Error('JSON attendu'), { titre: 'CORPS ILLISIBLE' })); } }); req.on('error', ko); });

export function servir(cfg, { port = null, fichierConfig = null } = {}) {
  const R = reglages(cfg); const demarre_le = new Date().toISOString(); const jeton = randomBytes(12).toString('hex');
  const lirePoint = memoire(() => pilote(cfg, ['point'], { fichierConfig }), R.cache_s * 1000);
  const lireChats = memoire(() => pilote(cfg, ['chats', '--deux-hotes'], { fichierConfig }), R.cache_s * 1000);
  const lireCampagnes = memoire(() => campagnesTableau(cfg, fichierConfig), R.cache_s * 1000);
  const serveur = http.createServer(async (req, res) => {
    if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(String(req.headers.host || ''))) return repondre(res, 403, { refus: 'HÔTE REFUSÉ', message: 'le tableau de bord ne répond qu’à 127.0.0.1' });
    const p = new URL(req.url, 'http://127.0.0.1').pathname; const portReel = serveur.address().port;
    try {
      if (req.method === 'POST') {
        if (p !== '/api/action') return repondre(res, 404, { refus: 'INCONNU', message: p });
        const origine = String(req.headers.origin || ''); if (origine && !new RegExp('^http://(127\\.0\\.0\\.1|localhost):' + portReel + '$').test(origine)) return repondre(res, 403, { refus: 'ORIGINE REFUSÉE', message: origine });
        const fourni = String(req.headers['x-jeton'] || ''); if (!fourni) return repondre(res, 403, { refus: 'JETON ABSENT', message: 'ouvrir le tableau depuis AIDE ($dev tableau) : l’URL porte le jeton de session' });
        if (fourni !== jeton) return repondre(res, 403, { refus: 'JETON INVALIDE', message: 'jeton d’une autre session du serveur : rouvrir le tableau depuis AIDE' });
        const corps = await lireCorps(req); const debut = Date.now();
        try { const resultat = await jouerAction(cfg, corps, { fichierConfig }); lirePoint.vider(); lireChats.vider(); lireCampagnes.vider(); journaliser(cfg, { action: corps.action, params: { ...corps, fiche: corps.fiche ? corps.fiche.split('\n')[0].slice(0, 80) + '…' : undefined }, ok: true, duree_ms: Date.now() - debut, resultat }); return repondre(res, 200, { ok: true, action: corps.action, resultat }); }
        catch (e) { const refus = e.titre || (e instanceof Refus ? e.titre : 'ERREUR'); journaliser(cfg, { action: corps.action, params: { ...corps, fiche: undefined }, ok: false, duree_ms: Date.now() - debut, refus, message: e.message }); return repondre(res, typeof e.code === 'number' && e.code >= 400 && e.code < 600 ? e.code : 409, { ok: false, action: corps.action, refus, message: e.message }); }
      }
      if (!['GET', 'HEAD'].includes(req.method)) return repondre(res, 405, { refus: 'MÉTHODE REFUSÉE', message: 'GET, HEAD ou POST /api/action' });
      if (p === '/api/version') return repondre(res, 200, { version: VERSION, hote: cfg.hote, port: portReel, rafraichissement_s: R.rafraichissement_s, cache_s: R.cache_s, demarre_le, actions: Object.keys(ACTIONS), commandes_lanceur: COMMANDES_LANCEUR, projets: Object.keys(cfg.projets || {}), livraison_par_paul: cfg.livraison_par_paul || [] });
      if (p === '/api/point') { const m = await lirePoint(); return repondre(res, 200, { releve_le: iso(m.le), erreur: m.erreur, point: m.valeur }); }
      if (p === '/api/chats') { const m = await lireChats(); return repondre(res, 200, { releve_le: iso(m.le), erreur: m.erreur, atelier_injoignable: m.valeur?.atelier_injoignable || null, chats: chatsOuverts(m.valeur, cfg) }); }
      if (p === '/api/campagnes') { const m = await lireCampagnes(); return repondre(res, 200, { releve_le: iso(m.le), erreur: m.erreur, campagnes: m.valeur || [] }); }
      if (p === '/api/journal') return repondre(res, 200, { journal: lireJournal(cfg) });
      const fichier = p === '/' ? 'index.html' : p.slice(1); const f = path.join(ASSETS, fichier);
      if (/^[a-z0-9][a-z0-9._-]*$/i.test(fichier) && fs.existsSync(f)) return repondre(res, 200, fs.readFileSync(f), TYPES[path.extname(fichier)] || 'application/octet-stream');
      repondre(res, 404, { refus: 'INCONNU', message: p });
    } catch (e) { repondre(res, e.titre === 'CORPS TROP LONG' ? 413 : e.titre === 'CORPS ILLISIBLE' ? 400 : 500, { refus: e.titre || 'ERREUR', message: e.message }); }
  });
  const candidats = port !== null ? [Number(port)] : R.ports; const essais = [];
  const ecouter = (pp) => new Promise((ok, ko) => { const surErreur = (e) => ko(e); serveur.once('error', surErreur); serveur.listen(pp, '127.0.0.1', () => { serveur.off('error', surErreur); ok(serveur.address().port); }); });
  return (async () => {
    let reel = null;
    for (const pp of candidats) { try { reel = await ecouter(pp); break; } catch (e) { essais.push(pp + ' : ' + e.code); if (!['EACCES', 'EADDRINUSE'].includes(e.code)) throw e; } }
    if (reel === null) { const e = new Error('aucun port disponible (' + essais.join(', ') + ')'); e.code = 'EADDRINUSE'; throw e; }
    const etat = { pid: process.pid, port: reel, url: adresse(reel, jeton), jeton, demarre_le, version: VERSION, ports_essayes: essais };
    try { fs.mkdirSync(cfg.etat, { recursive: true }); fs.writeFileSync(fichierEtat(cfg), JSON.stringify(etat, null, 2)); } catch {}
    return { ...etat, serveur, fermer: () => new Promise((r) => serveur.close(() => r())) };
  })();
}

// Le serveur répond-il sur ce port ? Rend son /api/version, ou null.
export async function etatServeur(port, delaiMs = 1500) {
  try { const r = await fetch(adresse(port) + 'api/version', { signal: AbortSignal.timeout(delaiMs) }); if (!r.ok) return null; const j = await r.json(); return j && j.version ? j : null; } catch { return null; }
}
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
// Retrouve le serveur : d’abord le port noté dans tableau.json (qui porte aussi le jeton de session), puis les ports candidats.
export async function trouverServeur(cfg, delaiMs = 1200) {
  const R = reglages(cfg); const note = lireEtat(cfg); const ports = [...new Set([...(note?.port ? [Number(note.port)] : []), ...R.ports])];
  for (const p of ports) { const e = await etatServeur(p, delaiMs); if (e) { const jeton = note && Number(note.port) === p && note.demarre_le === e.demarre_le ? note.jeton || null : null; return { ...e, port: p, url: adresse(p, jeton), jeton }; } }
  return null;
}

export const CONSIGNE_OUVERTURE = 'Ouvrir cette URL (elle porte le jeton de session des actions) dans le navigateur intégré du chat AIDE : open_in_codex (browser), sinon cua.createBrowserTab("iab"), sinon URL à cliquer ; jamais Edge ni Chrome.';
// Démarre le serveur détaché s’il ne tourne pas déjà ; idempotent : rend l’URL dans les deux cas.
export async function demarrer(cfg, { attenteMs = 8000, fichierConfig = null } = {}) {
  const deja = await trouverServeur(cfg);
  if (deja) return { url: deja.url, port: deja.port, actif: true, deja_actif: true, version: deja.version, demarre_le: deja.demarre_le, consigne: CONSIGNE_OUVERTURE };
  fs.mkdirSync(cfg.etat, { recursive: true }); const journal = fs.openSync(path.join(cfg.etat, 'tableau.log'), 'a');
  const env = { ...process.env }; if (fichierConfig) env.PILOTE_CONFIG = fichierConfig;
  try { fs.rmSync(fichierEtat(cfg), { force: true }); } catch {}
  const enfant = spawn(process.execPath, [fileURLToPath(import.meta.url), '--servir'], { detached: true, stdio: ['ignore', journal, journal], windowsHide: true, env }); enfant.unref(); fs.closeSync(journal);
  for (let t = 0; t < attenteMs; t += 200) { await attendre(200); const e = await trouverServeur(cfg, 600); if (e) return { url: e.url, port: e.port, actif: true, deja_actif: false, pid: enfant.pid, version: e.version, demarre_le: e.demarre_le, consigne: CONSIGNE_OUVERTURE }; }
  refuser('TABLEAU INACTIF', 'le serveur ne répond sur aucun port (' + reglages(cfg).ports.join(', ') + ') après ' + attenteMs + ' ms ; journal : ' + path.join(cfg.etat, 'tableau.log'), 6);
}

export async function arreter(cfg, { attenteMs = 5000 } = {}) {
  const e = await trouverServeur(cfg); const etat = lireEtat(cfg);
  if (!e) return { arrete: false, actif: false, motif: 'aucun serveur sur les ports ' + reglages(cfg).ports.join(', ') };
  if (!etat?.pid) refuser('TABLEAU SANS PID', 'serveur actif sur ' + e.url + ' mais ' + fichierEtat(cfg) + ' ne donne pas son pid', 6);
  try { process.kill(etat.pid); } catch (x) { refuser('TABLEAU NON ARRÊTÉ', x.message, 6); }
  for (let t = 0; t < attenteMs; t += 200) { await attendre(200); if (!(await etatServeur(e.port, 500))) { try { fs.rmSync(fichierEtat(cfg), { force: true }); } catch {} return { arrete: true, pid: etat.pid, port: e.port }; } }
  refuser('TABLEAU NON ARRÊTÉ', 'le serveur (pid ' + etat.pid + ') répond encore', 6);
}

export async function commande(cfg, sous = 'url', options = {}) {
  if (sous === 'servir') return demarrer(cfg, { fichierConfig: options.fichierConfig || process.env.PILOTE_CONFIG || null });
  if (sous === 'url') { const e = await trouverServeur(cfg); return { url: e ? e.url : adresse(reglages(cfg).port), port: e ? e.port : reglages(cfg).port, actif: !!e, version: e?.version || null, demarre_le: e?.demarre_le || null, consigne: e ? CONSIGNE_OUVERTURE : 'serveur inactif : node <pilote> tableau servir' }; }
  if (sous === 'arret') return arreter(cfg);
  refuser('SOUS-COMMANDE INCONNUE', 'tableau servir|url|arret (reçu : ' + sous + ')');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv.includes('--servir')) {
    const cfg = lireConfig(); const k = argv.indexOf('--port'); const port = k >= 0 ? Number(argv[k + 1]) : null;
    servir(cfg, { port, fichierConfig: process.env.PILOTE_CONFIG || null }).then((s) => { console.log(new Date().toISOString() + ' tableau de bord ' + VERSION + ' sur ' + adresse(s.port) + ' (pid ' + process.pid + ')'); const fin = () => s.fermer().then(() => process.exit(0)); process.on('SIGINT', fin); process.on('SIGTERM', fin); })
      .catch((e) => { console.error(['EADDRINUSE', 'EACCES'].includes(e.code) ? 'port indisponible : ' + e.message : e.stack || e.message); process.exitCode = 1; });
  } else if (argv[0] && !argv[0].startsWith('-')) {
    commande(lireConfig(), argv[0], { fichierConfig: process.env.PILOTE_CONFIG || null }).then((r) => console.log(JSON.stringify(r, null, 2)))
      .catch((e) => { if (e instanceof Refus) { console.error(e.titre + ' — ' + e.message); process.exitCode = e.code; } else { console.error(e.stack || e.message); process.exitCode = 1; } });
  } else { console.error('usage : node tableau.mjs servir|url|arret, ou node tableau.mjs --servir [--port <n>]'); process.exitCode = 2; }
}

