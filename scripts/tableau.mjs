#!/usr/bin/env node
// Tableau de bord du workflow $dev (3.3.0-test) : serveur HTTP local en lecture seule, lié à 127.0.0.1,
// ouvert dans le navigateur intégré du chat ❓ AIDE. Les données viennent uniquement de pilote.mjs
// (point, chats --deux-hotes), exécuté hors du processus pour ne jamais bloquer la page.
// Usage : node tableau.mjs --servir [--port <n>]   (ou pilote.mjs tableau servir|url|arret)
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { spawn, execFile } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { lireConfig, Refus, VERSION, RACINE } from './pilote.mjs';

const ASSETS = path.join(RACINE, 'assets', 'tableau');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const VIVANTS = ['actif', 'attente_go', 'bloque', 'a_creer'];
const refuser = (titre, message, code = 2) => { throw new Refus(titre, message, code); };

// Ports : Windows réserve des plages de 100 ports qui changent à chaque démarrage (Hyper-V, WSL) ; le serveur essaie le port voulu puis les ports de secours, et tableau.json garde le port effectif.
export const reglages = (cfg) => { const port = Number(cfg.tableau?.port || 8421); return { port, ports: [...new Set([port, ...(cfg.tableau?.ports_secours || [8521, 8621, 8721, 9421]).map(Number)])], rafraichissement_s: Number(cfg.tableau?.rafraichissement_s || 60), cache_s: Number(cfg.tableau?.cache_s ?? 60), pilote: cfg.pilote || path.join(RACINE, 'scripts', 'pilote.mjs') }; };
export const fichierEtat = (cfg) => path.join(cfg.etat, 'tableau.json');
export const adresse = (port) => 'http://127.0.0.1:' + port + '/';
const lireEtat = (cfg) => { try { return JSON.parse(fs.readFileSync(fichierEtat(cfg), 'utf8')); } catch { return null; } };

// Une commande du pilote, en JSON, hors du processus du serveur. Un refus du pilote (stderr, code ≠ 0) devient une erreur lisible.
export function pilote(cfg, args, { delai = 120000, fichierConfig = null } = {}) {
  const env = { ...process.env }; if (fichierConfig) env.PILOTE_CONFIG = fichierConfig;
  return new Promise((ok, ko) => execFile(process.execPath, [reglages(cfg).pilote, ...args], { encoding: 'utf8', windowsHide: true, timeout: delai, maxBuffer: 16 * 1024 * 1024, env }, (err, stdout, stderr) => {
    if (err && !String(stdout).trim()) return ko(new Error(String(stderr || err.message).trim().split('\n')[0].slice(0, 300)));
    try { ok(JSON.parse(stdout)); } catch { ko(new Error('réponse illisible du pilote : ' + String(stdout).trim().slice(0, 200))); }
  }));
}

// Mémoire d’une route : une valeur, sa date, la dernière erreur ; un seul appel en vol ; la dernière valeur survit à un échec.
export function memoire(fn, cacheMs) {
  const m = { valeur: null, le: 0, erreur: null, enCours: null, appels: 0 };
  return async () => {
    if (m.valeur && Date.now() - m.le < cacheMs) return m;
    if (m.enCours) return m.enCours;
    m.appels++;
    m.enCours = fn().then((v) => { m.valeur = v; m.le = Date.now(); m.erreur = null; }, (e) => { m.erreur = e.message; if (!m.valeur) m.le = Date.now(); }).then(() => { m.enCours = null; return m; });
    return m.enCours;
  };
}

export function chatsOuverts(reponse, cfg) {
  const liste = Array.isArray(reponse?.chats) ? reponse.chats : Object.values(reponse || {});
  return liste.filter((x) => x && x.titre && VIVANTS.includes(x.statut) && !String(x.chat_id || '').startsWith('a_creer'))
    .map((x) => ({ chat_id: x.chat_id, titre: x.titre, role: x.role || null, hote: x.hote || cfg.hote, dossier: x.dossier || null, statut: x.statut, modele: x.modele || null, ligne_etat: x.derniere_ligne || null, ligne_etat_le: x.derniere_ligne_le || null, derniere_activite: x.derniere_activite || x.cree_le || null }))
    .sort((a, b) => String(a.hote).localeCompare(String(b.hote)) || String(a.dossier || '').localeCompare(String(b.dossier || '')) || String(a.titre).localeCompare(String(b.titre)));
}

const repondre = (res, code, corps, type = 'application/json; charset=utf-8') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(typeof corps === 'string' || Buffer.isBuffer(corps) ? corps : JSON.stringify(corps, null, 2)); };
const iso = (t) => t ? new Date(t).toISOString() : null;

export function servir(cfg, { port = null, fichierConfig = null } = {}) {
  const R = reglages(cfg); const demarre_le = new Date().toISOString();
  const lirePoint = memoire(() => pilote(cfg, ['point'], { fichierConfig }), R.cache_s * 1000);
  const lireChats = memoire(() => pilote(cfg, ['chats', '--deux-hotes'], { fichierConfig }), R.cache_s * 1000);
  const serveur = http.createServer(async (req, res) => {
    if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(String(req.headers.host || ''))) return repondre(res, 403, { refus: 'HÔTE REFUSÉ', message: 'le tableau de bord ne répond qu’à 127.0.0.1' });
    if (!['GET', 'HEAD'].includes(req.method)) return repondre(res, 405, { refus: 'MÉTHODE REFUSÉE', message: 'v1 en lecture seule' });
    const p = new URL(req.url, 'http://127.0.0.1').pathname;
    try {
      if (p === '/api/version') return repondre(res, 200, { version: VERSION, hote: cfg.hote, port: serveur.address().port, rafraichissement_s: R.rafraichissement_s, cache_s: R.cache_s, demarre_le, lecture_seule: true });
      if (p === '/api/point') { const m = await lirePoint(); return repondre(res, 200, { releve_le: iso(m.le), erreur: m.erreur, point: m.valeur }); }
      if (p === '/api/chats') { const m = await lireChats(); return repondre(res, 200, { releve_le: iso(m.le), erreur: m.erreur, atelier_injoignable: m.valeur?.atelier_injoignable || null, chats: chatsOuverts(m.valeur, cfg) }); }
      const nom = p === '/' ? 'index.html' : p.slice(1); const f = path.join(ASSETS, nom);
      if (/^[a-z0-9][a-z0-9._-]*$/i.test(nom) && fs.existsSync(f)) return repondre(res, 200, fs.readFileSync(f), TYPES[path.extname(nom)] || 'application/octet-stream');
      repondre(res, 404, { refus: 'INCONNU', message: p });
    } catch (e) { repondre(res, 500, { refus: 'ERREUR', message: e.message }); }
  });
  const candidats = port !== null ? [Number(port)] : R.ports; const essais = [];
  const ecouter = (p) => new Promise((ok, ko) => { const surErreur = (e) => ko(e); serveur.once('error', surErreur); serveur.listen(p, '127.0.0.1', () => { serveur.off('error', surErreur); ok(serveur.address().port); }); });
  return (async () => {
    let reel = null;
    for (const p of candidats) { try { reel = await ecouter(p); break; } catch (e) { essais.push(p + ' : ' + e.code); if (!['EACCES', 'EADDRINUSE'].includes(e.code)) throw e; } }
    if (reel === null) { const e = new Error('aucun port disponible (' + essais.join(', ') + ')'); e.code = 'EADDRINUSE'; throw e; }
    const etat = { pid: process.pid, port: reel, url: adresse(reel), demarre_le, version: VERSION, ports_essayes: essais };
    try { fs.mkdirSync(cfg.etat, { recursive: true }); fs.writeFileSync(fichierEtat(cfg), JSON.stringify(etat, null, 2)); } catch {}
    return { ...etat, serveur, fermer: () => new Promise((r) => serveur.close(() => r())) };
  })();
}

// Le serveur répond-il sur ce port ? Rend son /api/version, ou null.
export async function etatServeur(port, delaiMs = 1500) {
  try { const r = await fetch(adresse(port) + 'api/version', { signal: AbortSignal.timeout(delaiMs) }); if (!r.ok) return null; const j = await r.json(); return j && j.version ? j : null; } catch { return null; }
}
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
// Retrouve le serveur : d’abord le port noté dans tableau.json, puis les ports candidats.
export async function trouverServeur(cfg, delaiMs = 1200) {
  const R = reglages(cfg); const note = lireEtat(cfg)?.port; const ports = [...new Set([...(note ? [Number(note)] : []), ...R.ports])];
  for (const p of ports) { const e = await etatServeur(p, delaiMs); if (e) return { ...e, port: p, url: adresse(p) }; }
  return null;
}

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
export const CONSIGNE_OUVERTURE = 'Ouvrir cette URL dans le navigateur intégré de l’application (onglet visible du chat AIDE), jamais dans Edge ni Chrome ; si l’outil de navigateur manque, rendre l’URL à cliquer.';

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
    servir(cfg, { port, fichierConfig: process.env.PILOTE_CONFIG || null }).then((s) => { console.log(new Date().toISOString() + ' tableau de bord ' + VERSION + ' sur ' + s.url + ' (pid ' + process.pid + ')'); const fin = () => s.fermer().then(() => process.exit(0)); process.on('SIGINT', fin); process.on('SIGTERM', fin); })
      .catch((e) => { console.error(['EADDRINUSE', 'EACCES'].includes(e.code) ? 'port indisponible : ' + e.message : e.stack || e.message); process.exitCode = 1; });
  } else if (argv[0] && !argv[0].startsWith('-')) {
    commande(lireConfig(), argv[0], { fichierConfig: process.env.PILOTE_CONFIG || null }).then((r) => console.log(JSON.stringify(r, null, 2)))
      .catch((e) => { if (e instanceof Refus) { console.error(e.titre + ' — ' + e.message); process.exitCode = e.code; } else { console.error(e.stack || e.message); process.exitCode = 1; } });
  } else { console.error('usage : node tableau.mjs servir|url|arret, ou node tableau.mjs --servir [--port <n>]'); process.exitCode = 2; }
}

