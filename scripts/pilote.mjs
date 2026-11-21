#!/usr/bin/env node
// pilote.mjs — orchestrateur du workflow $dev v2.2 (Paul).
// Écrit de zéro pour la v2.2. Aucune dépendance externe ; Node 20+.
// Configuration : poste.local.json à la racine du skill (ou PILOTE_CONFIG).
// État : dossier cfg.etat (campagnes/, comptes.json, refus.json, bilans/).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const ETATS_ISSUE = ['en_attente', 'preflight', 'en_cours', 'revue', 'recette', 'fusionnee', 'close', 'bloquee', 'en_pause'];
export const ETATS_CAMPAGNE = ['brouillon', 'en_cours', 'en_pause', 'close'];
export const CRITICITES = ['leger', 'standard', 'sensible'];
export const MAX_ESSAIS = 3;
export const VERSION = '2.9';
const PASTILLES = { AUTO: '🟢', SUP: '🟠', MS: '🔷', DEV: '🔵', CADRE: '🟣', PROTO: '🎨', TEST: '🧪', RELAIS: '⚙️', BILAN: '📘', AIDE: '❓', ARCHI: '🏛' };
const DOSSIERS = { AUTO: '01 Campagnes', SUP: '01 Campagnes', MS: '01 Campagnes', DEV: '02 Développement', CADRE: '03 Cadrage & prototypes', PROTO: '03 Cadrage & prototypes', TEST: '04 Relais & maintenance', RELAIS: '04 Relais & maintenance', BILAN: '04 Relais & maintenance', AIDE: '00 Accueil', ARCHI: '00 Accueil' };
export const TITRE_ARCHI = '🏛 ARCHI · workflow';
const SUFFIXES = ['⏸ GO', '⛔ BLOQUÉ', '✅'];

export class Refus extends Error { constructor(titre, message, code = 2) { super(message); this.titre = titre; this.code = code; } }
const refuser = (titre, message, code) => { throw new Refus(titre, message, code); };

// ---------- configuration ----------
export function lireConfig(fichier = process.env.PILOTE_CONFIG || path.join(RACINE, 'poste.local.json')) {
  if (!fs.existsSync(fichier)) refuser('CONFIGURATION ABSENTE', 'poste.local.json introuvable : ' + fichier);
  const c = JSON.parse(fs.readFileSync(fichier, 'utf8').replace(/^\uFEFF/, ''));
  for (const k of ['hote', 'modeles', 'etat']) if (c[k] === undefined) refuser('CONFIGURATION INCOMPLÈTE', 'clé manquante : ' + k);
  c.etat = c.etat.replace(/^~(?=$|[\\/])/, os.homedir());
  c.admission ||= { dev_max: 4, lourdes_max: 1 };
  for (const v of Object.values(c.projets || {})) if (v.chemin && !path.isAbsolute(v.chemin)) v.chemin = path.join(c.etat, v.chemin);
  if (c.appServerFactice && !path.isAbsolute(c.appServerFactice)) c.appServerFactice = path.join(c.etat, c.appServerFactice);
  return c;
}

// ---------- état sur disque ----------
const dossierCampagnes = (cfg) => path.join(cfg.etat, 'campagnes');
function ecrireJson(f, v) { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = f + '.' + process.pid + '.tmp'; fs.writeFileSync(t, JSON.stringify(v, null, 2) + '\n'); fs.renameSync(t, f); }
function lireJson(f, defaut) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return defaut; } }
function verrou(cfg, fn) {
  const v = path.join(cfg.etat, '.verrou'); fs.mkdirSync(cfg.etat, { recursive: true });
  for (let i = 0; i < 100; i++) {
    try { const fd = fs.openSync(v, 'wx'); fs.writeSync(fd, String(process.pid)); fs.closeSync(fd); break; }
    catch (e) { if (e.code !== 'EEXIST') throw e; const age = Date.now() - fs.statSync(v).mtimeMs; if (age > 60000) fs.rmSync(v, { force: true }); else spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},50)']); if (i === 99) refuser('VERROU', 'état occupé : ' + v); }
  }
  try { return fn(); } finally { fs.rmSync(v, { force: true }); }
}
export const fichierCampagne = (cfg, nom) => path.join(dossierCampagnes(cfg), nom + '.json');
export function lireCampagne(cfg, nom) { if (!nom || nom === true || String(nom).startsWith('-')) refuser('CAMPAGNE ABSENTE', 'nom de campagne attendu en premier argument (reçu : ' + (nom === undefined || nom === true ? 'rien' : nom) + ')'); const c = lireJson(fichierCampagne(cfg, nom)); if (!c) refuser('CAMPAGNE INCONNUE', nom); return c; } // v2.8.3 : message clair sans nom
// Seuls les fichiers de campagne comptent (id et items) : matrices et preuves rangées à côté sont ignorées (2.6.1).
export function listerCampagnes(cfg) { const d = dossierCampagnes(cfg); return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => { try { return lireJson(path.join(d, f)); } catch { return null; } }).filter((c) => c && typeof c.id === 'string' && Array.isArray(c.items)) : []; }
export function issues(c) { return c.items.flatMap((it) => it.type === 'milestone' ? it.issues.map((i) => ({ ...i, milestone: it.slug })) : [it]); }
function trouverIssue(c, id) { for (const it of c.items) { if (it.type === 'milestone') { const i = it.issues.find((x) => x.linear_id === id); if (i) return i; } else if (it.linear_id === id) return it; } if (c.transferts?.[id]) { const e = new Refus('ISSUE TRANSFÉRÉE', id + ' a été transférée de ' + c.id + ' vers ' + c.transferts[id] + ' (scission)'); e.de = c.id; e.vers = c.transferts[id]; throw e; } refuser('ISSUE INCONNUE', id + ' hors de la campagne ' + c.id); }
export function modifierCampagne(cfg, nom, fn, profondeur = 0) { try { return verrou(cfg, () => { const c = lireCampagne(cfg, nom); const r = fn(c); c.maj = new Date().toISOString(); ecrireJson(fichierCampagne(cfg, nom), c); return r; }); } catch (e) { if (e instanceof Refus && e.titre === 'ISSUE TRANSFÉRÉE' && e.vers && e.vers !== nom && profondeur < 3) return modifierCampagne(cfg, e.vers, fn, profondeur + 1); throw e; } }
// ---------- v2.7 : campagnes sœurs (scission), redirection des issues transférées, issues retenues ----------
export function redirigerCampagne(cfg, nom, id) { const c = lireJson(fichierCampagne(cfg, nom), null); const v = c?.transferts?.[id]; return v && v !== nom && fs.existsSync(fichierCampagne(cfg, v)) ? v : nom; }
export function statutsAvecSoeurs(cfg, c) { const m = {}; for (const n of c.soeurs || []) { const s = lireJson(fichierCampagne(cfg, n), null); if (s?.items) for (const i of issues(s)) m[i.linear_id] = i.statut; } for (const i of issues(c)) m[i.linear_id] = i.statut; return m; }
export function retenues(cfg, c) {
  const tout = [...issues(c)]; for (const n of c.soeurs || []) { const s = lireJson(fichierCampagne(cfg, n), null); if (s?.items) tout.push(...issues(s)); }
  const parDep = {}; for (const i of tout) if (i.statut !== 'close') for (const d of i.blocked_by || []) (parDep[d] ||= []).push(i.linear_id);
  const res = {}; for (const i of issues(c)) { const vus = new Set(); const pile = [i.linear_id]; while (pile.length) for (const x of parDep[pile.pop()] || []) if (!vus.has(x)) { vus.add(x); pile.push(x); } res[i.linear_id] = vus.size; }
  return res;
}
export function avancement(c) { const l = issues(c); const closes = l.filter((i) => i.statut === 'close').length; return { closes, total: l.length, pourcent: l.length ? Math.round(100 * closes / l.length) : 0 }; }

// ---------- modèles ----------
function idsModeles(cfg) {
  const m = cfg.modeles;
  return { O: m.cerveau, S: m.controle[0], Sol: m.controle[1], H: m.ouvrier[0], Luna: m.ouvrier[1], Terra: m.lecteur.fallback, Astra: m.second_regard, F: m.oeil || m.recours };
}
// Matrice compacte (modeles.md §2) : [primaire, fallback] par criticité, en rôles.
export const MATRICE = {
  dev: { leger: ['H', 'Luna'], standard: ['S', 'O'], sensible: ['O', 'S'] }, // v2.7 : Sonnet en standard, Opus en sensible et à l'escalade
  revue: { leger: ['H', 'Luna'], standard: ['S', 'Sol'], sensible: ['O', 'Astra'] },
  tests: { leger: ['H', 'Luna'], standard: ['S', 'Sol'], sensible: ['O', 'Astra'] },
  cadrage: { leger: ['S', 'Sol'], standard: ['O', 'S'], sensible: ['O', 'S'] },
  visuel: { leger: ['S', 'Terra'], standard: ['S', 'Terra'], sensible: ['O', 'Astra'] },
  'choix-visuel': { leger: ['F', 'O'], standard: ['F', 'O'], sensible: ['F', 'O'] },
  prototype: { leger: ['S', 'Sol'], standard: ['S', 'Sol'], sensible: ['O', 'S'] },
  ingestion: { leger: ['H', 'Luna'], standard: ['S', 'Sol'], sensible: ['O', 'S'] },
  finalisation: { leger: ['H', 'Luna'], standard: ['H', 'S'], sensible: ['S', 'O'] },
  pilotage: { leger: ['H', 'Luna'], standard: ['H', 'S'], sensible: ['O', 'S'] },
  automatisation: { leger: ['H', 'Luna'], standard: ['H', 'S'], sensible: ['O', 'S'] },
  digest: { leger: ['H', 'Luna'], standard: ['H', 'Luna'], sensible: ['H', 'Luna'] },
  'recette-milestone': { leger: ['S', 'Sol'], standard: ['S', 'Sol'], sensible: ['S', 'Sol'] },
  lecteur: { leger: ['H', 'Luna'], standard: ['H', 'Luna'], sensible: ['H', 'Luna'] },
};
// Substitutions en sous-agent quand la matrice désigne un modèle indisponible (§1 bis).
const SUBSTITUTS = { revue: 'O', tests: 'H', visuel: 'O', prototype: 'O', lecteur: 'O', cadrage: 'O', ingestion: 'O', finalisation: 'O', pilotage: 'O', automatisation: 'O', dev: 'O' };
const estOpenAI = (id) => /^gpt-/.test(id);
function refusActifs(cfg) { const r = lireJson(path.join(cfg.etat, 'refus.json'), {}); const now = Date.now(); return Object.keys(r).filter((m) => Date.parse(r[m].jusque) > now); }
export function catalogue(cfg, id) { return (cfg.modeles.catalogue || {})[id] || id; }
function controlerModele(cfg, id, sousAgent) {
  if ((cfg.modeles.reserve_paul || []).includes(id)) refuser('MODÈLE RÉSERVÉ À PAUL', id + ' n’est jamais attribué automatiquement');
  if (sousAgent && !(cfg.modeles.sous_agents || []).includes(id)) refuser('MODÈLE INDISPONIBLE', id + ' n’est pas disponible en sous-agent (modeles.sous_agents)');
  return id;
}
export function router(cfg, { tache, criticite, volumetrie = 'compact', sousAgent = false, entree = 0, trivial = false }) {
  if (tache === 'img2code') refuser('TÂCHE NON REPRISE', 'img2code reste dans l’archive (décision de Paul du 19/11/2026)');
  if (!MATRICE[tache]) refuser('TÂCHE INCONNUE', tache + ' (tâches : ' + Object.keys(MATRICE).join(', ') + ')');
  if (trivial) criticite = 'leger'; // proportionnalité (modeles.md §0)
  if (!CRITICITES.includes(criticite)) refuser('CRITICITÉ INCONNUE', String(criticite));
  if (!['compact', 'large'].includes(volumetrie)) refuser('VOLUMÉTRIE INCONNUE', String(volumetrie));
  if (tache === 'recette-milestone' && sousAgent) refuser('MODÈLE INDISPONIBLE', 'recette de Milestone : chat 🧪 TEST Sonnet lancé par pilote.mjs, jamais en sous-agent');
  const ids = idsModeles(cfg), refus = refusActifs(cfg), dispo = cfg.modeles.sous_agents || [];
  let [p, f] = MATRICE[tache][criticite];
  let primaire = ids[p], fallback = ids[f], substitution = null;
  if (sousAgent && !dispo.includes(primaire)) { const s = ids[SUBSTITUTS[tache] || 'O']; substitution = { de: primaire, vers: s }; primaire = s; }
  if (sousAgent && fallback && !dispo.includes(fallback)) fallback = dispo.includes(ids.O) && ids.O !== primaire ? ids.O : (dispo.includes(ids.Luna) && ids.Luna !== primaire ? ids.Luna : null);
  const garde = (id) => { if (!id) return null; if (entree > 100000 && id === ids.H) return null; if (entree > 272000 && estOpenAI(id)) return null; return id; };
  let choisi = garde(primaire), raison = 'matrice';
  if (!choisi && entree > 100000 && primaire === ids.H) { choisi = garde(sousAgent ? (dispo.includes(ids.Luna) && entree <= 272000 ? ids.Luna : ids.O) : (entree <= 272000 ? ids.Luna : ids.S)); raison = 'garde de volume'; }
  if (choisi && refus.includes(choisi)) { choisi = garde(fallback); raison = 'refus fournisseur : alternative'; }
  if (!choisi) refuser('MODÈLE INDISPONIBLE', 'aucun modèle admissible pour ' + tache + ' ' + criticite);
  controlerModele(cfg, choisi, sousAgent);
  const res = { tache, criticite, volumetrie, sous_agent: sousAgent, modele: choisi, catalogue: catalogue(cfg, choisi), fallback: fallback && controlerModeleSilencieux(cfg, fallback, sousAgent), raison };
  if (substitution) res.substitution = substitution;
  if (tache === 'revue' && sousAgent) res.consigne = 'sous-agent démarré à neuf : diff, fiche et critères de l’issue uniquement';
  if (volumetrie === 'large') {
    const direct = (tache === 'cadrage' && criticite === 'sensible') || tache === 'visuel';
    let lecteur = null;
    if (!direct) {
      lecteur = entree > 100000 ? cfg.modeles.lecteur.au_dela : cfg.modeles.lecteur.jusqu_a_100k;
      if (sousAgent && !dispo.includes(lecteur)) lecteur = ids.O;
      if (refus.includes(lecteur)) lecteur = entree < 272000 ? cfg.modeles.lecteur.fallback : ids.Luna;
    }
    res.lecteur = lecteur; res.executant = choisi; res.budget_resume_tokens = (cfg.contexte || {}).resume_large_max_tokens || 8000;
    if (direct) res.raison += ' ; accès direct au volume (exception §3)';
  }
  return res;
}
function controlerModeleSilencieux(cfg, id, sa) { try { return controlerModele(cfg, id, sa); } catch { return null; } }
export function escalade(cfg, { criticite, essai, nature = 'bug', sousAgent = false }) {
  const ids = idsModeles(cfg); essai = Number(essai);
  if (essai > MAX_ESSAIS) refuser('CIRCUIT-BREAKER', 'plus de ' + MAX_ESSAIS + ' essais : issue ⛔ BLOQUÉ, escalade à Paul (blocages.md)', 4);
  let id;
  if (criticite === 'leger') id = [null, ids.H, ids.S, ids.O][essai];
  else if (essai === 1) id = criticite === 'standard' ? ids.S : ids.O; // v2.7 : Opus dès le 2ᵉ essai en standard
  else if (essai === 2) id = nature === 'bug-subtil' ? ids.Astra : ids.O;
  else id = nature === 'architecture' && cfg.modeles.fable_autorise ? cfg.modeles.recours : ids.Astra;
  if (sousAgent && !(cfg.modeles.sous_agents || []).includes(id)) id = ids.O;
  controlerModele(cfg, id, sousAgent);
  return { criticite, essai, nature, modele: id, catalogue: catalogue(cfg, id), consigne: essai === 2 && id === ids.O ? 'nouvelle approche et contexte enrichi' : undefined };
}

// ---------- titres, badges, cartes ----------
export function titre(role, projet, objet, etat) {
  role = String(role).toUpperCase(); if (!PASTILLES[role]) refuser('RÔLE INCONNU', role);
  if (role === 'ARCHI') return { titre: TITRE_ARCHI, dossier: DOSSIERS.ARCHI }; // titre fixe, comme AIDE : ni projet ni suffixe d'état
  const parts = [PASTILLES[role] + ' ' + role, projet, objet].filter(Boolean); if (etat) parts.push(etat);
  return { titre: parts.join(' · '), dossier: DOSSIERS[role] + (role === 'DEV' ? ' / ' + projet : '') };
}
export function titreCampagne(c) {
  const a = avancement(c); const role = c.mode === 'supervise' ? 'SUP' : 'AUTO';
  let etat = a.pourcent + '%'; const l = issues(c);
  if (c.statut === 'close') etat += ' · ✅'; else if (c.livraison_echec) etat += ' · ⛔ BLOQUÉ'; else if (c.attente_go) etat += ' · ⏸ GO'; else if (l.length && l.filter((i) => i.statut !== 'close').every((i) => i.statut === 'bloquee')) etat += ' · ⛔ BLOQUÉ';
  return titre(role, c.projet, c.id, etat);
}
export function badge(role, id, projet, hote, modele, essai) { return '▸ ' + (PASTILLES[role] || '') + ' ' + role + (id ? ' #' + String(id).replace(/^[A-Z]+-/, '') : '') + ' · ' + projet + ' · ' + (hote === 'atelier' ? '☁ atelier' : '💻 local') + ' · ' + modele + (essai ? ' · essai ' + essai + '/' + MAX_ESSAIS : ''); }

// ---------- réglage d'exécution appliqué à chaque tour ----------
export function parametresTour(cfg) {
  const e = cfg.execution || {}; const p = {};
  if (e.approvalPolicy) p.approvalPolicy = e.approvalPolicy;
  if (e.sandbox === 'danger-full-access') p.sandboxPolicy = { type: 'dangerFullAccess' };
  else if (e.sandbox === 'read-only') p.sandboxPolicy = { type: 'readOnly', networkAccess: false };
  return p; // à fusionner dans CHAQUE turn/start (création et reprise)
}

// ---------- campagnes ----------
export function composer(cfg, { nom, projet, ids = [], depuis, mode = 'auto', hoteExecution, hoteLivraison }) {
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(nom || '')) refuser('NOM INVALIDE', 'kebab-case attendu');
  if (!['auto', 'supervise'].includes(mode)) refuser('MODE INCONNU', mode);
  return verrou(cfg, () => {
    const f = fichierCampagne(cfg, nom); const c = lireJson(f) || { id: nom, projet, mode, statut: 'brouillon', mandat: '', hote_execution: hoteExecution || 'atelier', hote_livraison: hoteLivraison || (mode === 'supervise' ? 'local' : 'atelier'), contrat_valide: false, items: [] };
    if (c.statut !== 'brouillon') refuser('CAMPAGNE NON BROUILLON', nom + ' est ' + c.statut);
    const items = depuis ? JSON.parse(fs.readFileSync(depuis, 'utf8')) : ids.map((id) => (/^MS-/.test(id) ? { type: 'milestone', linear_id: id, slug: id.toLowerCase(), issues: [] } : { type: 'issue_standalone', linear_id: id }));
    for (const it of items) {
      const norm = (i) => ({ statut: 'en_attente', criticite: 'standard', branche: 'codex/issue-' + i.linear_id, sha_valide: null, sha_reprise: null, branche_reprise: null, attempts: 0, modele_courant: null, blocked_by: [], ...i });
      const x = it.type === 'milestone' ? { statut: 'en_attente', branche_integration: 'codex/ms-' + it.slug, sha_depart: null, ...it, issues: (it.issues || []).map(norm) } : norm({ type: 'issue_standalone', ...it });
      for (const i of x.type === 'milestone' ? x.issues : [x]) { if (!ETATS_ISSUE.includes(i.statut)) refuser('STATUT INCONNU', i.statut); if (!CRITICITES.includes(i.criticite)) refuser('CRITICITÉ INCONNUE', i.criticite); }
      const k = c.items.findIndex((y) => y.linear_id === x.linear_id); if (k >= 0) c.items[k] = x; else c.items.push(x);
    }
    c.maj = new Date().toISOString(); ecrireJson(f, c); return { campagne: nom, statut: c.statut, items: c.items.length, issues: issues(c).length };
  });
}
export function validerContrat(cfg, nom) {
  const f = path.join(dossierCampagnes(cfg), nom + '.contrat.md');
  if (!fs.existsSync(f)) refuser('CONTRAT NON VALIDÉ', 'contrat absent : ' + f);
  return modifierCampagne(cfg, nom, (c) => { c.contrat_valide = true; c.contrat = f; return { campagne: nom, contrat_valide: true }; });
}
export function lancer(cfg, nom, mode) {
  return modifierCampagne(cfg, nom, (c) => {
    if (!c.contrat_valide) refuser('CONTRAT NON VALIDÉ', 'lancer refuse une campagne sans contrat validé (cadrage)');
    if (c.statut !== 'brouillon' && c.statut !== 'en_pause') refuser('CAMPAGNE DÉJÀ ' + c.statut.toUpperCase(), nom);
    if (mode) c.mode = mode; c.statut = 'en_cours'; c.lancee_le ||= new Date().toISOString();
    return { campagne: nom, statut: c.statut, mode: c.mode, ...titreCampagne(c) };
  });
}
export function changerStatutCampagne(cfg, nom, statut) { if (!ETATS_CAMPAGNE.includes(statut)) refuser('STATUT INCONNU', statut); return modifierCampagne(cfg, nom, (c) => { c.statut = statut; return { campagne: nom, statut }; }); }
export function verifierPreuveRecette(id, preuve) {
  if (!preuve || !fs.existsSync(preuve)) refuser('PREUVE DE RECETTE ABSENTE', 'clôture de ' + id + ' : fournir pilote.mjs statut <campagne> ' + id + ' close <matrice.json>, matrice de couverture de la fiche (voir references/test.md)', 5);
  const m = lireJson(preuve, null);
  if (!m || m.issue !== id || !Array.isArray(m.criteres) || !m.criteres.length) refuser('PREUVE DE RECETTE INVALIDE', preuve + ' : attendu { issue: "' + id + '", criteres: [ { critere, controle, resultat, preuve } ] }', 5);
  const fautes = m.criteres.filter((k) => !k.critere || !k.controle || !(k.resultat === 'ok' || (k.resultat === 'non_applicable' && String(k.justification || '').length >= 15)));
  if (fautes.length) refuser('RECETTE INCOMPLÈTE', fautes.length + ' critère(s) de ' + id + ' sans contrôle réussi ou sans justification : ' + fautes.map((k) => k.critere || '?').slice(0, 5).join(' | '), 5);
  return m.criteres.length;
}
export function statutIssue(cfg, nom, id, statut, preuve, { attend = null, quoi = null, sansFusion = null, irreversible = null } = {}) {
  nom = redirigerCampagne(cfg, nom, id);
  if (!ETATS_ISSUE.includes(statut)) refuser('STATUT INCONNU', statut + ' (liste fermée : ' + ETATS_ISSUE.join(', ') + ')');
  if (attend) verifierArret(statut, attend, quoi);
  if (attend === 'paul') verifierCadreur(cfg, nom, id, irreversible); // v2.9
  if (statut === 'close') { const c0 = lireCampagne(cfg, nom); const i0 = issues(c0).find((x) => x.linear_id === id); if (i0?.empile_sur?.length) { const st0 = statutsAvecSoeurs(cfg, c0); const att = i0.empile_sur.filter((d) => !['close', 'fusionnee'].includes(st0[d])); if (att.length) refuser('CLÔTURE PRÉMATURÉE', id + ' est empilée sur ' + att.join(', ') + ' : clôture après leur fusion ou clôture, puis pilote.mjs desempiler'); } if (i0) { const fu = verifierFusion(cfg, c0, i0, { sansFusion }); if (fu.motif && sansFusion) decision(cfg, nom, id, 'Clôture sans fusion (v2.8.4) : ' + fu.motif); } } // v2.8-2.8.4
  const nbCriteres = statut === 'close' ? verifierPreuveRecette(id, preuve) : 0;
  const res = modifierCampagne(cfg, nom, (c) => { const i = trouverIssue(c, id); const avant = i.statut; if (statut === 'close' && i.empile_sur?.length) { const st0 = statutsAvecSoeurs(cfg, c); const att = i.empile_sur.filter((d) => !['close', 'fusionnee'].includes(st0[d])); if (att.length) refuser('CLÔTURE PRÉMATURÉE', id + ' est empilée sur ' + att.join(', ') + ' : clôture après leur fusion ou clôture, puis pilote.mjs desempiler'); } i.statut = statut; if (i.poste === 'retour') { delete i.poste; delete i.poste_tache; delete i.poste_resultat; delete i.poste_retour; } if (statut === 'close') { i.close_le = new Date().toISOString(); i.preuve_recette = path.resolve(preuve); i.criteres_couverts = nbCriteres; } else if (statut !== 'fusionnee') { delete i.close_le; delete i.preuve_recette; }
    if (attend) i.arret = { attend, quoi: net(quoi).slice(0, 240), le: new Date().toISOString(), ...(attend === 'paul' && irreversible && irreversible !== true ? { irreversible: net(irreversible).slice(0, 160) } : {}) }; else if (avant !== statut) delete i.arret; // un changement de statut sans --attend lève l'arrêt (v2.6)
    return { campagne: nom, issue: id, statut, avant, ...(i.arret ? { arret: i.arret } : {}), ...avancement(c) }; });
  if (['recette', 'fusionnee'].includes(res.avant) && ['en_cours', 'bloquee', 'en_attente', 'preflight'].includes(statut)) { const d = desempilerEnfants(cfg, nom, id, 'la dépendance ' + id + ' repasse en ' + statut); if (d.length) res.desempilees = d; } // v2.8
  return res;
}
export function essai(cfg, nom, id, resultat) {
  return modifierCampagne(cfg, nom, (c) => {
    const i = trouverIssue(c, id);
    if (resultat === 'succes') return { issue: id, attempts: i.attempts };
    if (resultat !== 'echec') refuser('RÉSULTAT INCONNU', resultat);
    i.attempts = (i.attempts || 0) + 1;
    if (i.attempts >= MAX_ESSAIS) { i.statut = 'bloquee'; return { issue: id, attempts: i.attempts, statut: 'bloquee', message: 'CIRCUIT-BREAKER : ⛔ BLOQUÉ, escalade à Paul' }; }
    return { issue: id, attempts: i.attempts, prochain_essai: i.attempts + 1 };
  });
}
export function reprise(cfg, nom, id, sha, branche) { return modifierCampagne(cfg, nom, (c) => { const i = trouverIssue(c, id); i.sha_reprise = sha; i.branche_reprise = branche; return { issue: id, sha_reprise: sha, branche_reprise: branche }; }); }
// Limites d'admission en clair : message de reprise, digest et contexte (v2.4.3).
export function limitesTexte(cfg) { const a = cfg.admission || {}; return 'Limites d\'admission actuelles sur cet hôte (poste.local.json) : ' + (a.dev_max || 4) + ' développements actifs et ' + (a.lourdes_max || 1) + ' charges lourdes par campagne' + (a.lourdes_max_hote ? ', ' + a.lourdes_max_hote + ' sur l\'hôte' : '') + '. Elles priment sur les chiffres de ta consigne initiale et sur toute décision antérieure du journal ; une place libre sous ces limites s\'utilise sans attendre. Admission différée tant que l\'attente CPU dépasse ' + (a.garde_cpu_pct ?? 40) + ' % sur 60 s (pilote.mjs le refuse lui-même).'; }
// Ligne GLOBAL inscrite par 🏛 ARCHI dans le journal de chaque campagne en cours, après un GO de Paul (archi.md).
export function decisionGlobale(cfg, texte) { if (!String(texte || '').trim()) refuser('TEXTE ABSENT', 'usage : pilote.mjs decision-globale <texte> | --texte-stdin'); const toutes = listerCampagnes(cfg); const enCours = toutes.filter((c) => c.statut === 'en_cours').map((c) => c.id); const ignorees = toutes.filter((c) => c.statut !== 'en_cours').map((c) => c.id);
  for (const n of enCours) decision(cfg, n, 'GLOBAL', texte); return { inscrit: enCours, ignorees, resume: 'inscrit dans : ' + (enCours.join(', ') || 'aucune') + ' ; ignorées (pas en cours) : ' + (ignorees.join(', ') || 'aucune') }; }
export function decision(cfg, nom, id, texte) { if (!id || id === true || !net(texte)) refuser('DÉCISION VIDE', 'usage : decision <campagne> <ID|GLOBAL> <texte> (reçu : ' + (id === undefined || id === true ? 'aucun identifiant' : id + ' sans texte') + ')'); nom = redirigerCampagne(cfg, nom, id); // v2.8.5 : plus de ligne « undefined » au journal
 lireCampagne(cfg, nom); const f = path.join(dossierCampagnes(cfg), nom + '.decisions.md'); fs.appendFileSync(f, '- ' + new Date().toISOString() + ' · ' + id + ' · ' + texte.replace(/\s+/g, ' ') + '\n'); return { journal: f }; }
export function contexte(cfg, nom) {
  const c = lireCampagne(cfg, nom); const l = issues(c); const par = {};
  const voieC = !!c.voie_recette?.chat; const retC = retenues(cfg, c); const trierRet = (x) => [...x].sort((a, b) => (retC[b.linear_id] || 0) - (retC[a.linear_id] || 0)); const stC = statutsAvecSoeurs(cfg, c); const critC = chaineCritique(cfg, c); // v2.7-2.8
  for (const i of l) (par[i.statut] ||= []).push(i.linear_id + (i.sha_reprise ? '@reprise:' + i.sha_reprise.slice(0, 8) : '') + (i.attempts ? ' essais:' + i.attempts : ''));
  return { campagne: c.id, projet: c.projet, mode: c.mode, statut: c.statut, signalements: signalementsLivraison(cfg, c), hote_execution: c.hote_execution, ...avancement(c), par_statut: par, a_qualifier: l.filter((i) => i.statut === 'bloquee' && !i.arret && !i.poste_exclu).map((i) => i.linear_id), admission: { dev_max: cfg.admission?.dev_max || 4, ouvertes_max: ouvertesMax(cfg), en_attente_exterieure: l.filter((i) => ACTIFS_ISSUE.includes(i.statut) && attendDehors(i)).map((i) => i.linear_id + ' (' + i.arret.attend + ')'), lourdes_max: cfg.admission?.lourdes_max || 1, ...(cfg.admission?.lourdes_max_hote ? { lourdes_max_hote: cfg.admission.lourdes_max_hote } : {}), regle: limitesTexte(cfg) }, a_relancer: trierRet(l.filter((i) => ACTIFS_ISSUE.includes(i.statut) && !auPoste(i) && !(voieC && i.statut === 'recette'))).map((i) => i.linear_id), voie_recette: voieC ? c.voie_recette.chat : null, chaine_critique: critC, admissibles: l.filter((i) => i.statut === 'en_attente' && !i.poste_exclu).map((i) => [i, admissibilite(cfg, c, i, stC)]).filter(([, a]) => a.ok).map(([i, a]) => i.linear_id + (a.empile ? ' (empilée sur ' + a.empile.sur.join(', ') + ')' : '')), a_rebaser: l.filter((i) => i.statut !== 'close' && i.empile_sur?.length && i.empile_sur.every((d) => ['close', 'fusionnee'].includes(stC[d]))).map((i) => i.linear_id), exclues_poste: l.filter((i) => i.poste_exclu && i.statut !== 'close').map((i) => i.linear_id + ' : ' + i.poste_exclu), poste_a_debloquer: l.filter((i) => aDebloquerPoste(cfg, i)).map((i) => i.linear_id + ' : ' + i.poste_env_echecs + ' échecs d’environnement (' + (i.poste_env_cause || 'voir le retour') + ')'), au_poste: l.filter(auPoste).map((i) => i.linear_id + ' (' + i.poste + ')'), retours_poste: l.filter((i) => i.poste === 'retour').map((i) => ({ issue: i.linear_id, resultat: i.poste_resultat, retour: i.poste_retour })), ligne_etat: ligneEtat(cfg, nom).ligne, a_recetter: voieC ? [] : trierRet(l.filter((i) => i.statut === 'fusionnee')).map((i) => i.linear_id), retient: Object.fromEntries(Object.entries(retC).filter(([, n]) => n > 0)), consigne: limitesTexte(cfg) + ' Aucun agent concurrent : relancer seulement les issues listées dans a_relancer, depuis leur fiche. Les issues de a_relancer sont déjà admises et gardent leur place : relance chacune tout de suite (sous-agent dev, revue ou recette selon son statut), sans attendre de place libre ; des places toutes occupées n’empêchent que les nouvelles admissions. Une passe qui ne relance rien alors que a_relancer n’est pas vide est une erreur. Ensuite, chaque issue de a_recetter reçoit sa recette propre (critères de sa fiche, charge lourde), puis passe à close si elle réussit. Une issue de au_poste attend le poste Windows : ne la relance pas. Chaque retour de retours_poste : lis retour.md et les preuves, clos l’issue si la matrice est complète, sinon note la cause (pilote.mjs decision) et redépose-la (pilote.mjs poste deposer) ; tout changement de statut solde le retour. Une issue de exclues_poste attend Paul (motif indiqué) : ne la redépose pas au poste et ne l’admets pas. Une issue de poste_a_debloquer attend une action de Paul sur le poste : ne la redépose pas (pilote.mjs le refuse). Quand tu arrêtes une issue (bloquee, ou revue/recette qui attend autre chose que ton travail), dis qui la débloque : pilote.mjs statut <campagne> <ID> <statut> --attend paul|agents|poste|env --quoi "<cause courte ; pour paul : l’action exacte et la réponse proposée>", ou pilote.mjs arret <campagne> <ID> --attend … --quoi … sans changer le statut ; qualifie aussi chaque issue de a_qualifier. $dev point en dépend (point.md). Avant de passer une issue en bloquee (hors action irréversible), cherche une solution ou une décision avec un cadreur : node ' + RACINE + '/scripts/pilote.mjs lancer cadrage deblocage-<ID> --depuis-role AUTO --projet <projet> --nouveau --fiche-stdin (fiche de 15 lignes : blocage, essais, options ; le cadreur conclut par pilote.mjs decision <campagne> <ID> "Conclusion du cadreur : … ; réservé à Paul : oui|non") ; mandat de Paul : le cadreur décide par défaut (« à confirmer »), publie au besoin une issue corrective (pilote.mjs campagne ajouter) et écrit sa conclusion au journal ; l’issue reste en_attente (pilote.mjs arret … --attend agents --quoi "cadrage de déblocage") et ne passe bloquee --attend paul que si le cadreur conclut à un motif réservé à Paul, avec sa réponse proposée. v2.9 : --attend paul est refusé sans cette conclusion (CADREUR REQUIS) ; motif réservé à Paul d’emblée (action irréversible ou root, secret à fournir, hors mandat) : --reserve "<motif>". Ne demande jamais une décision à Paul dans ton texte : seule la ligne d’état lui parle. Une issue qui attend Paul, le poste ou l’environnement ne compte plus dans tes places : continue d’admettre tant que dev_max et ouvertes_max le permettent. Si la campagne ne bouge plus pendant 2 h, le réveil lance lui-même les cadreurs. a_relancer et a_recetter sont triés : les premières issues débloquent le plus d’issues (retient), traite-les d’abord. Admission empilée (v2.8) : une issue dont les dépendances sont en recette (revue favorable) est admissible (liste admissibles) ; pilote.mjs ouvrir la fait partir de la branche de sa dépendance (champ empilement) ; sa PR vise cette branche et ne fusionne qu’après la clôture de la dépendance. Issues de a_rebaser : dépendance fusionnée, rebase leur branche sur la cible, rétablis la PR vers la cible, puis pilote.mjs desempiler <campagne> <ID>. Traite d’abord chaine_critique. Charges lourdes : pilote.mjs lourde <campagne> --issue <ID> -- <commande> (la file sert d’abord les issues qui en débloquent le plus).' + (voieC ? ' Voie de recette dédiée (v2.7) : quand le code d’une issue est fait et sa revue favorable, passe-la en recette (pilote.mjs statut <campagne> <ID> recette) sans jouer la recette toi-même ; les issues en recette ou fusionnées appartiennent à la voie (chat 🧪 TEST), qui les clôt ou te les renvoie en en_cours avec la cause au journal ; elles ne comptent pas dans tes places.' : '') };
}
export function digest(cfg, nom) {
  const c = lireCampagne(cfg, nom); const l = issues(c); const depuis = Date.now() - 86400000;
  const j = path.join(dossierCampagnes(cfg), nom + '.decisions.md');
  const dec = fs.existsSync(j) ? fs.readFileSync(j, 'utf8').split('\n').filter((x) => x && Date.parse(x.slice(2, 26)) > depuis) : [];
  return { campagne: nom, ...avancement(c), closes_24h: l.filter((i) => i.close_le && Date.parse(i.close_le) > depuis).map((i) => i.linear_id), bloquees: l.filter((i) => i.statut === 'bloquee').map((i) => i.linear_id), ligne_etat: ligneEtat(cfg, nom).ligne, signalements: [...signalementsLivraison(cfg, c), ...signalementsPoste(cfg, c), ...ligneMenage(cfg), ...l.flatMap((i) => i.signalements || []), ...[...new Set(l.map((i) => i.projet || c.projet))].filter((p) => carteSquelette(cfg, p)).map((p) => 'carte ' + p + ' encore à l\'état de squelette (utilisable)')], decisions_24h: dec, chats_archives_24h: chatsArchives24h(cfg), modele: router(cfg, { tache: 'digest', criticite: 'leger', sousAgent: true }).modele, lignes_max: 15 };
}

// ---------- préflight, comptes ----------
function git(cwd, ...a) { const r = spawnSync('git', ['-C', cwd, ...a], { encoding: 'utf8', windowsHide: true }); return { code: r.status ?? 1, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }; }
function lireEnv(f) { const o = {}; if (!fs.existsSync(f)) return o; for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) o[m[1]] = m[2]; } return o; }
// ---------- fiche d'issue : mentions de modèle, nature du livrable ----------
const ALIAS_MODELES = [[/\bfable\s*5[.,]2\b|claude-fable-5-2/i, 'claude-fable-5-2'], [/\bfable\s*5[.,]1\b|claude-fable-5-1/i, 'claude-fable-5-1'], [/\bfable\b(?!\s*5)/i, 'claude-fable'],
  [/\bopus\b|claude-opus/i, 'claude-opus-5-5'], [/\bsonnet\b|claude-sonnet/i, 'claude-sonnet-5-5'], [/\bhaiku\b|claude-haiku/i, 'claude-haiku-5-5'],
  [/gpt-6\.2-astra|\bastra\b/i, 'gpt-6.2-astra'], [/gpt-6\.2-sol\b/i, 'gpt-6.2-sol'], [/gpt-6-luna|\bluna\b/i, 'gpt-6-luna'], [/gpt-6\.1-terra|\bterra\b/i, 'gpt-6.1-terra'], [/\bgpt-\d[\w.-]*/i, 'gpt']];
export function mentionsModele(cfg, texte) {
  const vus = new Set(); const res = [];
  for (const [re, id] of ALIAS_MODELES) { if (re.test(texte || '') && !vus.has(id)) { vus.add(id); res.push({ modele: id, reserve_paul: (cfg.modeles.reserve_paul || []).includes(id) }); } }
  return res.filter((m) => !(m.modele === 'claude-fable' && (vus.has('claude-fable-5-1') || vus.has('claude-fable-5-2'))));
}
export const signalementModele = (id, m) => id + ' : la fiche nomme ' + m.modele + ', mention ignorée (une issue ne nomme jamais de modèle ; le routeur choisit)' + (m.reserve_paul ? ' — réservé à Paul : à lancer à la main si Paul le souhaite' : '');
export function natureFiche(texte) {
  const t = texte || '';
  const sansCode = /recette d[ée]veloppeur[\s\S]{0,120}sans objet/i.test(t) && /aucun code|aucune r[ée]alisation applicative|sans modification de d[ée]p[ôo]t/i.test(t);
  return sansCode ? 'livrable' : 'code';
}
function dossierLivrables(projet, id) {
  const pj = path.join(projet.chemin, 'PROJECT.md'); const m = fs.existsSync(pj) && fs.readFileSync(pj, 'utf8').match(/^[>*\s-]*\**Livrables\**\s*:\s*`?([^`\n]+)`?/mi);
  return m ? path.resolve(projet.chemin, m[1].trim().replace('<ID>', id)) : path.join(projet.chemin, 'livrables', id);
}
// ---------- lecture de la fiche Linear par sous-agent (toujours, sans réglage) ----------
export function lireFiche(cfg, id, { maxAgeMin = 10 } = {}) {
  const f = path.join(cfg.etat, 'fiches', id + '.md');
  if (fs.existsSync(f) && (Date.now() - fs.statSync(f).mtimeMs) < maxAgeMin * 60000) return { texte: fs.readFileSync(f, 'utf8'), source: 'cache' };
  if (!cfg.codexExecutable) return { texte: fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '', source: fs.existsSync(f) ? 'cache ancien' : null };
  const sortie = f + '.' + process.pid + '.tmp'; fs.mkdirSync(path.dirname(f), { recursive: true });
  const consigne = 'Avec l outil Linear, lis l issue ' + id + ' et recopie mot pour mot son titre (première ligne, préfixée par « # ») puis sa description complète, sans rien ajouter ni commenter. Si tu n as pas d outil Linear ou si l issue est introuvable, réponds seulement : FICHE INDISPONIBLE';
  const modele = catalogue(cfg, cfg.modeles.ouvrier?.[1] || 'gpt-6-luna');
  const r = spawnSync(cfg.codexExecutable, ['exec', '--ephemeral', '--skip-git-repo-check', '-s', 'read-only', '-m', modele, '-C', os.tmpdir(), '-o', sortie], { input: consigne, encoding: 'utf8', windowsHide: true, timeout: 3 * 60000 });
  const texte = fs.existsSync(sortie) ? fs.readFileSync(sortie, 'utf8').trim() : ''; fs.rmSync(sortie, { force: true });
  if (r.status === 0 && texte && !/^FICHE INDISPONIBLE/.test(texte)) { fs.writeFileSync(f, texte + '\n'); return { texte, source: 'linear' }; }
  return { texte: fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '', source: fs.existsSync(f) ? 'cache ancien' : null };
}
// ---------- complétion de la carte en arrière-plan ----------
export const carteSquelette = (cfg, nomProjet) => { const f = path.join(cfg.etat, 'carte', nomProjet + '.md'); return fs.existsSync(f) && /^Statut : squelette/m.test(fs.readFileSync(f, 'utf8')); };
export function lancerAgentCarte(cfg, nomProjet) {
  if (!cfg.codexExecutable) return null;
  const conf = process.env.PILOTE_CONFIG || path.join(RACINE, 'poste.local.json');
  const enfant = spawn(process.execPath, [path.join(RACINE, 'scripts', 'carte-agent.mjs'), conf, nomProjet], { detached: true, stdio: 'ignore', windowsHide: true });
  enfant.unref(); return enfant.pid;
}

// ---------- carte de dépôt : générée sur place si absente ----------
export function genererCarte(cfg, nomProjet, projet) {
  const f = path.join(cfg.etat, 'carte', nomProjet + '.md'); fs.mkdirSync(path.dirname(f), { recursive: true });
  const fichiers = git(projet.chemin, 'ls-files').out.split('\n').filter(Boolean); const parDossier = {};
  for (const x of fichiers) { const d = x.includes('/') ? x.split('/')[0] + '/' : '(racine)'; parDossier[d] = (parDossier[d] || 0) + 1; }
  const lire = (n) => { const p = path.join(projet.chemin, n); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; };
  let scripts = []; try { scripts = Object.keys(JSON.parse(lire('package.json') || '{}').scripts || {}); } catch {}
  const gates = lire('PROJECT.md').split('\n').filter((l) => /`(final|conditionnelle):/.test(l)).map((l) => l.replace(/^>\s*/, '').trim()).slice(0, 20);
  const corps = ['# Carte de dépôt — ' + nomProjet, '', 'Statut : squelette (générée par pilote.mjs ouvrir le ' + new Date().toISOString().slice(0, 10) + ' ; un sous-agent Haiku la complète en arrière-plan)', '',
    'Dépôt : ' + projet.chemin + ' · branche principale ' + (projet.branche_principale || 'main') + ' · ' + fichiers.length + ' fichiers suivis', '', '## Dossiers', '',
    ...Object.entries(parDossier).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([d, n]) => '- ' + d + ' (' + n + ')'), '', '## Scripts package.json', '', scripts.length ? scripts.map((s) => '- ' + s).join('\n') : 'aucun', '', '## Gates (PROJECT.md)', '', gates.length ? gates.join('\n') : 'aucune déclarée', ''].join('\n');
  fs.writeFileSync(f, corps); return f;
}

export function ouvrir(cfg, nom, id, { compte, fiche, livrable, aBlanc } = {}) { nom = redirigerCampagne(cfg, nom, id);
  const c = lireCampagne(cfg, nom); const i = trouverIssue(c, id); const nomProjet = i.projet || c.projet; const projet = (cfg.projets || {})[nomProjet]; // dépôt propre à l'issue (campagne multi-dépôts)
  const bloque = (raison) => { if (!aBlanc) statutIssue(cfg, nom, id, 'bloquee'); refuser('PRÉFLIGHT TECHNIQUE BLOQUÉ', id + ' : ' + raison); };
  const reparations = []; const signalements = [];
  for (const d of [cfg.etat, path.join(cfg.etat, 'campagnes'), path.join(cfg.etat, 'carte')]) if (!fs.existsSync(d)) { fs.mkdirSync(d, { recursive: true }); reparations.push('dossier créé : ' + d); }
  if (!projet?.chemin || !fs.existsSync(projet.chemin)) bloque('dépôt ' + nomProjet + ' introuvable (' + (projet?.chemin || 'aucun chemin') + ') : Paul doit cloner le dépôt sur cet hôte ou corriger projets.' + nomProjet + '.chemin dans poste.local.json');
  if (!fs.existsSync(path.join(cfg.etat, 'carte', nomProjet + '.md'))) { reparations.push('carte générée : ' + genererCarte(cfg, nomProjet, projet)); const pid = aBlanc ? null : lancerAgentCarte(cfg, nomProjet); if (pid) reparations.push('complétion de la carte lancée en arrière-plan (sous-agent Haiku, pid ' + pid + ')'); }
  else if (carteSquelette(cfg, nomProjet)) signalements.push('carte ' + nomProjet + ' encore à l\'état de squelette (utilisable)');
  let texteFiche = fiche ? (fs.existsSync(fiche) ? fs.readFileSync(fiche, 'utf8') : fiche) : '';
  if (!fiche) { const lu = lireFiche(cfg, id); texteFiche = lu.texte; if (!lu.source) signalements.push(id + ' : fiche Linear non analysée (lecture par sous-agent impossible) ; démarrage poursuivi'); }
  for (const m of mentionsModele(cfg, texteFiche)) signalements.push(signalementModele(id, m));
  const nature = livrable ? 'livrable' : (i.nature || natureFiche(texteFiche));
  const routage = nature === 'livrable' && /visuel|direction artistique|maquette|planche|identit[ée] visuelle/i.test(texteFiche + ' ' + (i.titre || '')) ? router(cfg, { tache: 'choix-visuel', criticite: i.criticite }) : null;
  if (signalements.length && !aBlanc) modifierCampagne(cfg, nom, (cc) => { const ii = trouverIssue(cc, id); ii.signalements = [...new Set([...(ii.signalements || []), ...signalements])]; });
  if (nature === 'livrable') {
    const dossier = dossierLivrables(projet, id);
    if (!aBlanc) { fs.mkdirSync(dossier, { recursive: true }); modifierCampagne(cfg, nom, (cc) => { const ii = trouverIssue(cc, id); ii.statut = 'preflight'; ii.admise_le ||= new Date().toISOString(); ii.nature = 'livrable'; ii.livrables = dossier; }); }
    return { issue: id, nature, a_blanc: !!aBlanc, livrables: dossier, worktree: null, consigne: 'démarrage allégé : aucun worktree applicatif, aucune branche, aucun compte ; livrables (planche, note, maquette statique) dans ' + dossier, routage, reparations, signalements, statut: aBlanc ? i.statut : 'preflight' };
  }
  if (aBlanc) return { issue: id, nature, a_blanc: true, routage, reparations, signalements, statut: i.statut };
  if (i.poste_exclu) refuser('ADMISSION DIFFÉRÉE', id + ' attend Paul : ' + i.poste_exclu, 5);
  gardeCpu(cfg, i);
  const l = issues(c), actifs = actifsAdmission(l, id, !!c.voie_recette?.chat);
  if (actifs.length >= (cfg.admission.dev_max || 4)) refuser('ADMISSION DIFFÉRÉE', 'limite de ' + cfg.admission.dev_max + ' développements actifs atteinte', 5);
  const ouvertes = ouvertesAdmission(l, id, !!c.voie_recette?.chat); if (ouvertes.length >= ouvertesMax(cfg)) refuser('ADMISSION DIFFÉRÉE', 'limite de ' + ouvertesMax(cfg) + ' issues ouvertes atteinte (dont ' + (ouvertes.length - actifs.length) + ' en attente de Paul, du poste ou de l’environnement)', 5); // v2.9
  const adm = admissibilite(cfg, c, i); if (!adm.ok) refuser('ADMISSION DIFFÉRÉE', adm.raison, 5); // v2.7-2.8 : sœurs et admission empilée
  const base = adm.empile?.branche ? 'origin/' + adm.empile.branche : i.sha_valide || l.find((x) => x.linear_id === id)?.sha_depart || c.items.find((it) => it.type === 'milestone' && it.issues.some((x) => x.linear_id === id))?.sha_depart || 'origin/' + (projet.branche_principale || 'main');
  const wt = path.join(cfg.worktrees || path.join(cfg.etat, 'worktrees'), nomProjet, id);
  if (compte && !compteLibre(cfg, nomProjet, projet, compte)) refuser('COMPTE INDISPONIBLE', 'réserve ' + compte + '_<n> vide ou entièrement prise pour ' + nomProjet + ' sur cet hôte (' + path.join(projet.chemin, '.env.local') + ') : Paul doit fournir des comptes ' + compte + '_<n>_USERNAME / _PASSWORD ; issue non admise');
  exclure(projet.chemin, [...(projet.hors_git || []), '.env.local']);
  if (fs.existsSync(wt)) { if (git(wt, 'status', '--porcelain').out) bloque('worktree existant non propre : ' + wt); }
  else { git(projet.chemin, 'fetch', '-q', 'origin'); const r = git(projet.chemin, 'worktree', 'add', '-q', '-B', i.branche, wt, base); if (r.code) bloque(/denied|permission|authenticat|403|could not read/i.test(r.err) ? 'accès Git refusé au dépôt ' + nomProjet + ' : Paul doit donner à ce compte le droit de lecture/écriture sur son origin (' + r.err.split('\n')[0] + ')' : 'worktree : ' + r.err); }
  const p = git(wt, 'push', '-q', '-u', 'origin', i.branche + ':' + i.branche); if (p.code) bloque((/denied|permission|authenticat|403/i.test(p.err) ? 'accès en écriture refusé sur origin de ' + nomProjet + ' : Paul doit accorder le droit de pousser à ce compte — ' : 'branche distante : ') + p.err.split('\n')[0]);
  for (const f of projet.hors_git || []) { const s = path.join(projet.chemin, f); if (fs.existsSync(s)) { fs.copyFileSync(s, path.join(wt, f)); if (!fs.readFileSync(s).equals(fs.readFileSync(path.join(wt, f)))) bloque('copie hors Git différente : ' + f); } }
  let reserve = null;
  if (compte) reserve = reserverCompte(cfg, nomProjet, projet, id, compte, wt);
  modifierCampagne(cfg, nom, (cc) => { const ii = trouverIssue(cc, id); ii.statut = 'preflight'; ii.admise_le ||= new Date().toISOString(); ii.worktree = wt; ii.base = base; if (reserve) ii.compte = reserve; if (adm.empile) { ii.empile_sur = adm.empile.sur; ii.empile_base = adm.empile.base_sur; ii.empile_profondeur = adm.empile.profondeur; } else { delete ii.empile_sur; delete ii.empile_base; delete ii.empile_profondeur; } });
  return { issue: id, nature, worktree: wt, branche: i.branche, base, empilement: adm.empile ? { ...adm.empile, consigne: adm.empile.branche ? 'issue empilée : pars de origin/' + adm.empile.branche + ', PR vers ' + adm.empile.branche + ' ; ne fusionne pas avant la clôture de ' + adm.empile.sur.join(', ') + ' ; à sa fusion, rebase sur la cible puis pilote.mjs desempiler' : 'dépendance d’un autre dépôt en recette (' + adm.empile.sur.join(', ') + ') : développe contre son contrat ; fusion après sa clôture' } : null, compte: reserve, reparations, signalements, reprise: i.sha_reprise ? { sha: i.sha_reprise, branche: i.branche_reprise, consigne: 'examiner le WIP avant de coder' } : null, statut: 'preflight' };
}
function numerosCompte(projet, compte) { const env = lireEnv(path.join(projet.chemin, '.env.local')); return Object.keys(env).map((k) => k.match(new RegExp('^' + compte + '_(\\d+)_USERNAME$'))?.[1]).filter(Boolean).filter((n) => env[compte + '_' + n + '_USERNAME'].replace(/["']/g, '').trim()); }
function compteLibre(cfg, projetNom, projet, compte) { const reg = lireJson(path.join(cfg.etat, 'comptes.json'), {}); const pris = reg[projetNom + ':' + compte] || {}; return numerosCompte(projet, compte).some((n) => !pris[n]); }
// Fichiers hors Git (AGENTS.override.md, .env.local) exclus dans le dépôt commun à tous les worktrees.
function exclure(depot, fichiers) { const d = git(depot, 'rev-parse', '--git-common-dir').out; if (!d) return; const f = path.resolve(depot, d, 'info', 'exclude'); fs.mkdirSync(path.dirname(f), { recursive: true }); const deja = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split(/\r?\n/) : []; const manquants = fichiers.map((x) => '/' + x).filter((x) => !deja.includes(x)); if (manquants.length) fs.appendFileSync(f, (deja.length && deja.at(-1) !== '' ? '\n' : '') + manquants.join('\n') + '\n'); }
function reserverCompte(cfg, projetNom, projet, id, compte, wt) {
  return verrou(cfg, () => {
    const env = lireEnv(path.join(projet.chemin, '.env.local'));
    const nums = Object.keys(env).map((k) => k.match(new RegExp('^' + compte + '_(\\d+)_USERNAME$'))?.[1]).filter(Boolean).filter((n) => env[compte + '_' + n + '_USERNAME'].replace(/["']/g, '').trim());
    const reg = lireJson(path.join(cfg.etat, 'comptes.json'), {}); const k = projetNom + ':' + compte; reg[k] ||= {};
    const libre = nums.find((n) => !reg[k][n]);
    if (!libre) { statutIssueSansVerrou(cfg, id); refuser('COMPTE INDISPONIBLE', 'aucun ' + compte + ' libre pour ' + projetNom + ' sur cet hôte : issue non admise'); }
    reg[k][libre] = { issue: id, depuis: new Date().toISOString() }; ecrireJson(path.join(cfg.etat, 'comptes.json'), reg);
    const lignes = [compte + '_USERNAME=' + env[compte + '_' + libre + '_USERNAME'], compte + '_PASSWORD=' + (env[compte + '_' + libre + '_PASSWORD'] || '')];
    const cible = path.join(wt, '.env.local'); const avant = fs.existsSync(cible) ? fs.readFileSync(cible, 'utf8').split(/\r?\n/).filter((x) => x && !x.startsWith(compte + '_USERNAME=') && !x.startsWith(compte + '_PASSWORD=')) : [];
    fs.writeFileSync(cible, [...avant, ...lignes].join('\n') + '\n', { mode: 0o600 });
    return { compte, numero: Number(libre) };
  });
}
function statutIssueSansVerrou() { /* l'issue reste en_attente : non admise */ }
export function rendre(cfg, nom, id) {
  const c = lireCampagne(cfg, nom); const i = trouverIssue(c, id); if (!i.compte) return { issue: id, compte: null };
  return verrou(cfg, () => { const reg = lireJson(path.join(cfg.etat, 'comptes.json'), {}); const k = c.projet + ':' + i.compte.compte; const n = String(i.compte.numero); const histo = reg._relais ||= []; if (reg[k]?.[n]?.issue === id) { delete reg[k][n]; histo.push({ compte: k + '_' + n, issue: id, rendu_le: new Date().toISOString() }); } ecrireJson(path.join(cfg.etat, 'comptes.json'), reg); const cc = lireCampagne(cfg, nom); delete trouverIssue(cc, id).compte; ecrireJson(fichierCampagne(cfg, nom), cc); return { issue: id, compte_rendu: k + '_' + n }; });
}
export function refus(cfg, modele, message, minutes = 60) {
  const m = String(message).match(/retry[- ]after[^0-9]*(\d+)/i); const duree = m ? Number(m[1]) * 1000 : minutes * 60000;
  const f = path.join(cfg.etat, 'refus.json'); const r = lireJson(f, {}); r[modele] = { jusque: new Date(Date.now() + duree).toISOString(), message: String(message).slice(0, 200) }; ecrireJson(f, r); return { modele, jusque: r[modele].jusque };
}
export function deployer(cfg, projet, cible) {
  if (!cfg.deploiement_serveurs) refuser('DÉPLOIEMENT REFUSÉ SUR CET HÔTE', 'hôte ' + cfg.hote + ' : déploiement et administration de serveurs réservés au poste local (projet de déploiement)', 3);
  return { projet, cible, consigne: 'déploiement serveur depuis le poste : action irréversible, ⏸ GO de Paul puis procédure de déploiement' };
}


// ---------- $dev livrer : livraison sur le poste (option b), plan figé au GO, répétition à blanc, arrêt à la première erreur ----------
const sha256 = (t) => createHash('sha256').update(t).digest('hex');
export const sha256Fichier = (f) => sha256(fs.readFileSync(f));
export function extrairePlan(texte) {
  const m = String(texte || '').match(/```json\s+livraison\s*\n([\s\S]*?)\n```/);
  if (!m) refuser('PLAN INVALIDE', 'plan-livraison.md doit contenir un bloc ```json livraison', 6);
  let p; try { p = JSON.parse(m[1]); } catch (e) { refuser('PLAN INVALIDE', 'bloc json livraison illisible : ' + e.message, 6); }
  const cibles = p.cibles || {}; const fautes = [];
  if (!Object.keys(cibles).length) fautes.push('aucune cible');
  for (const [n, c] of Object.entries(cibles)) if (!c.ssh) fautes.push('cible ' + n + ' sans alias ssh');
  if (!p.paquet?.chemin || !p.paquet?.sha256) fautes.push('paquet sans chemin ou sans sha256');
  if (!p.retour_arriere?.procedure) fautes.push('procédure de retour arrière absente');
  if (!Array.isArray(p.etapes) || !p.etapes.length) fautes.push('aucune étape');
  for (const e of p.etapes || []) { if (!cibles[e.cible]) fautes.push('étape ' + e.id + ' : cible inconnue ' + e.cible); if (!e.commande) fautes.push('étape ' + e.id + ' sans commande'); if (!e.retour) fautes.push('étape ' + e.id + ' sans commande de retour arrière'); }
  for (const v of p.verification || []) if (!cibles[v.cible] || !v.commande) fautes.push('vérification invalide : ' + JSON.stringify(v).slice(0, 80));
  if (fautes.length) refuser('PLAN INVALIDE', fautes.join(' ; '), 6);
  return p;
}
export function goLivraison(cfg, nom, plan) {
  if (plan && !path.isAbsolute(plan)) plan = path.join(cfg.etat, plan);
  if (!fs.existsSync(plan)) refuser('PLAN ABSENT', plan, 6);
  const texte = fs.readFileSync(plan, 'utf8'); extrairePlan(texte);
  return modifierCampagne(cfg, nom, (c) => { if (c.hote_livraison !== 'local') refuser('LIVRAISON NON LOCALE', nom + ' ne livre pas depuis le poste', 6);
    c.livraison = { plan: path.resolve(plan), sha256: sha256(texte), go_le: new Date().toISOString(), utilise: false }; c.attente_go = false; delete c.livraison_echec;
    return { campagne: nom, go: c.livraison }; });
}
function viaAtelier(cfg, args, entree) {
  const q = (x) => "'" + String(x).replace(/'/g, "'\\''") + "'";
  const r = spawnSync('ssh', ['-o', 'BatchMode=yes', cfg.ssh.atelier, 'node ' + q(cfg.pilote_atelier) + ' ' + args.map(q).join(' ')], { input: entree, encoding: 'utf8', windowsHide: true, timeout: 120000 });
  if (r.status !== 0) refuser('ATELIER INJOIGNABLE', (r.stderr || r.stdout || '').trim().slice(0, 300), 6);
  return JSON.parse(r.stdout);
}
export function infoLivraison(cfg, nom) {
  if (cfg.registre_distant) return viaAtelier(cfg, ['livraison-info', nom]);
  const c = lireCampagne(cfg, nom); const plan = c.livraison?.plan;
  return { campagne: nom, projet: c.projet, chat: c.chat || null, hote_livraison: c.hote_livraison, livraison: c.livraison || null, plan_texte: plan && fs.existsSync(plan) ? fs.readFileSync(plan, 'utf8') : null };
}
export function marquerLivraison(cfg, nom, champs) {
  if (cfg.registre_distant) return viaAtelier(cfg, ['livraison-marquer', nom, '--json-stdin'], JSON.stringify(champs));
  return modifierCampagne(cfg, nom, (c) => { c.livraison = { ...(c.livraison || {}), ...(champs.livraison || {}) }; if ('livraison_echec' in champs) { if (champs.livraison_echec) c.livraison_echec = champs.livraison_echec; else delete c.livraison_echec; } return { campagne: nom, livraison: c.livraison, livraison_echec: c.livraison_echec || null }; });
}
export async function posterSup(cfg, nom, texte) {
  if (cfg.registre_distant) return viaAtelier(cfg, ['poster', nom, '--texte-stdin'], texte);
  const c = lireCampagne(cfg, nom); if (!c.chat) return { campagne: nom, poste: false, raison: 'campagne sans chat' };
  const { connecter } = await import('./appserver.mjs'); const s = await connecter(cfg);
  try { const lu = await s.call('thread/read', { threadId: c.chat, includeTurns: true }).catch(() => null); const t = (lu?.thread?.turns || []).at(-1);
    if (!lu?.thread || lu.thread.status?.type === 'notLoaded') { const e = cfg.execution || {}; await s.call('thread/resume', { threadId: c.chat, model: c.chat_modele, approvalPolicy: e.approvalPolicy || 'never', sandbox: e.sandbox || 'workspace-write' }).catch(() => null); } // v2.8.2 : chat recréé ou non chargé
    const entree = '📦 Message de pilote.mjs (livraison, information) — note-le au journal, n\'exécute rien sur les serveurs :\n' + texte;
    const r = t?.status === 'inProgress' ? await s.call('turn/steer', { threadId: c.chat, expectedTurnId: t.id, input: [{ type: 'text', text: entree }] }).catch(() => null) : null;
    if (!r) await s.call('turn/start', { threadId: c.chat, model: c.chat_modele, effort: 'low', ...parametresTour(cfg), input: [{ type: 'text', text: entree }] });
    return { campagne: nom, poste: true, chat: c.chat }; } finally { s.fermer(); }
}
function lancerSsh(cfg, alias, commande, delaiS = 60) {
  const base = Array.isArray(cfg.ssh_commande) ? cfg.ssh_commande : [cfg.ssh_commande || 'ssh'];
  const r = spawnSync(base[0], [...base.slice(1), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', alias, commande], { encoding: 'utf8', windowsHide: true, timeout: delaiS * 1000 });
  return { code: r.status ?? 124, sortie: ((r.stdout || '') + (r.stderr || '')).trim() };
}
export function maintenirEveille(cfg) {
  if (!cfg.maintien_eveille || process.platform !== 'win32') return { actif: false, relacher: () => {} };
  const ps = "Add-Type -Namespace P -Name E -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint f);'; [P.E]::SetThreadExecutionState(0x80000041) | Out-Null; while (Get-Process -Id " + process.pid + " -EA SilentlyContinue) { Start-Sleep 20 }";
  const e = spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', ps], { detached: true, stdio: 'ignore', windowsHide: true }); e.unref();
  return { actif: true, pid: e.pid, relacher: () => { try { process.kill(e.pid); } catch {} } };
}
export async function executerLivraison(cfg, nom, { aBlanc = false, journal = null, echo = false } = {}) {
  if (!cfg.deploiement_serveurs) refuser('LIVRAISON REFUSÉE SUR CET HÔTE', 'hôte ' + cfg.hote + ' : $dev livrer s\'exécute uniquement depuis le poste', 6);
  const info = infoLivraison(cfg, nom);
  if (info.hote_livraison !== 'local') refuser('LIVRAISON NON LOCALE', nom + ' ne livre pas depuis le poste', 6);
  if (!info.livraison?.sha256) refuser('GO ABSENT', nom + ' : aucun GO de livraison enregistré (node <pilote> livraison-go ' + nom + ' <plan-livraison.md>, sur instruction de Paul)', 6);
  if (info.livraison.utilise && !aBlanc) refuser('GO DÉJÀ UTILISÉ', 'ce GO a servi le ' + info.livraison.utilise + ' ; un nouveau GO de Paul est requis', 6);
  if (!info.plan_texte || sha256(info.plan_texte) !== info.livraison.sha256) refuser('PLAN MODIFIÉ DEPUIS LE GO', 'empreinte du plan ' + (info.plan_texte ? sha256(info.plan_texte).slice(0, 12) : 'absente') + ' ≠ empreinte validée ' + info.livraison.sha256.slice(0, 12) + ' : livraison refusée, nouveau GO requis', 6);
  const plan = extrairePlan(info.plan_texte);
  const racine = (cfg.projets?.[info.projet] || {}).chemin || cfg.etat;
  const dossier = journal || path.join(racine, 'livrables', 'livraison', new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16));
  fs.mkdirSync(dossier, { recursive: true }); fs.writeFileSync(path.join(dossier, 'plan-livraison.md'), info.plan_texte);
  const fj = path.join(dossier, 'journal.log'); const log = (m) => { fs.appendFileSync(fj, new Date().toISOString() + ' ' + m + '\n'); if (echo) process.stderr.write(new Date().toLocaleTimeString('fr-FR') + ' ' + String(m).split('\n')[0].slice(0, 180) + '\n'); }; // v2.8.2 : progression visible dans la fenêtre
  const eveil = maintenirEveille(cfg);
  const fin = async (codeSortie, message, echec) => { log(message.split('\n')[0]); await posterSup(cfg, nom, message).catch((e) => log('message SUP impossible : ' + e.message)); marquerLivraison(cfg, nom, echec ? { livraison_echec: { le: new Date().toISOString(), message: message.slice(0, 500) } } : { livraison: aBlanc ? { derniere_repetition: new Date().toISOString() } : { livree_le: new Date().toISOString() }, livraison_echec: null }); eveil.relacher(); log('maintien éveillé relâché'); return { campagne: nom, a_blanc: aBlanc, code: codeSortie, journal: dossier, message }; };
  try {
    log('début ' + (aBlanc ? 'répétition à blanc' : 'livraison réelle') + ' · plan ' + info.livraison.sha256.slice(0, 12) + ' · maintien éveillé ' + (eveil.actif ? 'actif' : 'inactif'));
    await posterSup(cfg, nom, '▸ Livraison ' + nom + (aBlanc ? ' (répétition à blanc)' : '') + ' démarrée sur le poste. Journal : ' + dossier).catch((e) => log('message SUP impossible : ' + e.message));
    // 1. répétition à blanc : tous les contrôles, aucun effet
    const ctrl = []; const versions = {};
    for (const [n, c] of Object.entries(plan.cibles)) {
      const a = lancerSsh(cfg, c.ssh, 'true', 20); ctrl.push({ controle: 'accès SSH ' + n, ok: a.code === 0, detail: a.sortie.slice(0, 160) });
      if (a.code !== 0) continue;
      const d = lancerSsh(cfg, c.ssh, 'df -Pk ' + (c.chemin_disque || '/') + ' | tail -1', 30); const libre = Number((d.sortie.split(/\s+/)[3]) || 0) / 1048576;
      ctrl.push({ controle: 'disque ' + n, ok: d.code === 0 && libre >= (c.disque_min_gio || 1), detail: libre.toFixed(1) + ' Gio libres (minimum ' + (c.disque_min_gio || 1) + ')' });
      if (c.version) { const v = lancerSsh(cfg, c.ssh, c.version, 30); versions[n] = v.sortie.slice(0, 200); ctrl.push({ controle: 'version en place ' + n, ok: v.code === 0, detail: versions[n] }); }
    }
    const verifierFichier = (chemin, attendu) => { if (cfg.registre_distant) { const r = lancerSsh(cfg, cfg.ssh.atelier, 'sha256sum ' + JSON.stringify(chemin), 60); return { ok: r.code === 0 && (!attendu || r.sortie.startsWith(attendu)), detail: r.sortie.slice(0, 100) }; } if (!fs.existsSync(chemin)) return { ok: false, detail: 'absent' }; const h = sha256(fs.readFileSync(chemin)); return { ok: !attendu || h === attendu, detail: h.slice(0, 16) }; };
    ctrl.push({ controle: 'paquet présent et intègre', ...verifierFichier(plan.paquet.chemin, plan.paquet.sha256) });
    ctrl.push({ controle: 'procédure de retour arrière présente', ...verifierFichier(plan.retour_arriere.procedure, null) });
    ctrl.push({ controle: 'retour arrière déclaré pour chaque étape', ok: plan.etapes.every((e) => e.retour), detail: plan.etapes.length + ' étapes' });
    fs.writeFileSync(path.join(dossier, 'repetition-a-blanc.json'), JSON.stringify({ controles: ctrl, versions }, null, 2));
    for (const x of ctrl) log((x.ok ? 'OK ' : 'ÉCHEC ') + x.controle + ' — ' + x.detail);
    const ko = ctrl.filter((x) => !x.ok);
    if (ko.length) return await fin(7, '⛔ Répétition à blanc en échec : la livraison ne démarre pas.\n' + ko.map((x) => '- ' + x.controle + ' : ' + x.detail).join('\n') + '\nJournal : ' + dossier, true);
    if (aBlanc) return await fin(0, '✅ Répétition à blanc réussie (' + ctrl.length + ' contrôles). Versions en place : ' + JSON.stringify(versions) + '\nJournal : ' + dossier, false);
    // 2. livraison réelle : le GO est consommé, étapes du plan seulement, arrêt à la première erreur
    marquerLivraison(cfg, nom, { livraison: { utilise: new Date().toISOString() } });
    for (const e of plan.etapes) {
      log('étape ' + e.id + ' · ' + (e.titre || '') + ' · cible ' + e.cible + ' · ' + e.commande);
      const r = lancerSsh(cfg, plan.cibles[e.cible].ssh, e.commande, e.delai_s || 900);
      fs.appendFileSync(path.join(dossier, 'sorties.log'), '### étape ' + e.id + ' (code ' + r.code + ')\n' + r.sortie + '\n');
      if (r.code !== 0) return await fin(8, '⛔ Livraison arrêtée à l\'étape ' + e.id + ' (' + (e.titre || '') + ') sur ' + e.cible + ', code ' + r.code + '. Aucune correction ni nouvel essai.\nDernières lignes : ' + r.sortie.split('\n').slice(-5).join(' | ').slice(0, 400) + '\nRetour arrière correspondant (NON exécuté, à lancer par Paul s\'il le décide) : ' + e.retour + '\nProcédure : ' + plan.retour_arriere.procedure + '\nJournal : ' + dossier, true);
      log('étape ' + e.id + ' réussie');
    }
    // 3. vérification après livraison
    const verif = (plan.verification || []).map((v) => { const r = lancerSsh(cfg, plan.cibles[v.cible].ssh, v.commande, 60); return { titre: v.titre || v.commande, cible: v.cible, ok: r.code === 0 && (!v.attendu || new RegExp(v.attendu).test(r.sortie)), sortie: r.sortie.slice(0, 160) }; });
    const vApres = {}; for (const [n, c] of Object.entries(plan.cibles)) if (c.version) vApres[n] = lancerSsh(cfg, c.ssh, c.version, 30).sortie.slice(0, 200);
    fs.writeFileSync(path.join(dossier, 'verification.json'), JSON.stringify({ verification: verif, versions_avant: versions, versions_apres: vApres }, null, 2));
    const vko = verif.filter((x) => !x.ok);
    return await fin(vko.length ? 9 : 0, (vko.length ? '⛔ Livraison exécutée, mais la vérification signale ' + vko.length + ' écart(s) ; aucune correction tentée.' : '✅ Livraison ' + nom + ' terminée.') + '\nSanté : ' + verif.map((x) => (x.ok ? 'ok ' : 'ÉCART ') + x.cible + ' · ' + x.titre).join(' ; ') + '\nVersions en place : ' + JSON.stringify(vApres) + '\nJournal : ' + dossier, vko.length > 0);
  } catch (e) { eveil.relacher(); throw e; }
}
export async function livrer(cfg, nom, { aBlanc = false } = {}) {
  if (!cfg.deploiement_serveurs) refuser('LIVRAISON REFUSÉE SUR CET HÔTE', 'hôte ' + cfg.hote + ' : $dev livrer s\'exécute uniquement depuis le poste', 6);
  // v2.8.2 : l'exécuteur déterministe tourne directement, au premier plan, sans session codex exec (son outil de commande l'avait coupé au bout d'environ 10 s le 21/11).
  if (cfg.chat_local?.option !== 'b') refuser('LIVRAISON LOCALE INDISPONIBLE', 'chat_local.option doit valoir "b" dans poste.local.json (livraison autorisée depuis le poste)', 6);
  const info = infoLivraison(cfg, nom);
  if (!info.livraison?.sha256) refuser('GO ABSENT', nom + ' : aucun GO de livraison enregistré', 6);
  if (!info.plan_texte || sha256(info.plan_texte) !== info.livraison.sha256) refuser('PLAN MODIFIÉ DEPUIS LE GO', 'empreinte différente de celle validée au GO', 6);
  if (info.livraison.utilise && !aBlanc) refuser('GO DÉJÀ UTILISÉ', 'nouveau GO de Paul requis', 6);
  const racine = (cfg.projets?.[info.projet] || {}).chemin || cfg.etat;
  const dossier = path.join(racine, 'livrables', 'livraison', new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16) + (aBlanc ? '-a-blanc' : ''));
  const r = await executerLivraison(cfg, nom, { aBlanc, journal: dossier, echo: true });
  return { ...r, plan_sha256: info.livraison.sha256.slice(0, 12) };
}

// ---------- v2.3 : registre des chats, lanceur, ménage ----------
export const STATUTS_CHAT = ['actif', 'attente_go', 'bloque', 'clos', 'archive', 'a_creer'];
const sectionDe = (dossier) => String(dossier || '').split(' / ')[0];
const NOMS_COURTS = { 'claude-opus-5-5': 'Opus 5.5', 'claude-sonnet-5-5': 'Sonnet 5.5', 'claude-haiku-5-5': 'Haiku 5.5', 'claude-fable-5-1': 'Fable 5.1', 'claude-fable-5-2': 'Fable 5.2', 'gpt-6-luna': 'Luna', 'gpt-6.2-sol': 'Sol', 'gpt-6.2-astra': 'Astra', 'gpt-6.1-terra': 'Terra' };
export const nomCourt = (m) => NOMS_COURTS[String(m || '').replace(/^[a-z]+\//, '')] || m;
const normaliserObjet = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9#]+/g, ' ').trim();
const jetons = (t) => new Set(normaliserObjet(t).split(' ').filter((x) => x.length > 2));
const proximite = (a, b) => { const A = jetons(a), B = jetons(b); if (!A.size || !B.size) return 0; let n = 0; for (const x of A) if (B.has(x)) n++; return n / (A.size + B.size - n); };
export function lireRegistreChats(cfg) { return lireJson(path.join(cfg.etat, 'chats.json'), {}); }
export function inscrireChat(cfg, e) {
  if (!e.chat_id) refuser('CHAT ABSENT', 'chat_id requis');
  if (e.statut && !STATUTS_CHAT.includes(e.statut)) refuser('STATUT INCONNU', e.statut + ' (liste fermée : ' + STATUTS_CHAT.join(', ') + ')');
  return verrou(cfg, () => { const f = path.join(cfg.etat, 'chats.json'); const reg = lireJson(f, {}); const ancien = reg[e.chat_id] || {}; const maintenant = new Date().toISOString();
    reg[e.chat_id] = { statut: 'actif', taille_contexte: 0, relances: 0, cree_le: maintenant, ...ancien, ...e, derniere_activite: e.derniere_activite || ancien.derniere_activite || maintenant, historique: [...(ancien.historique || []), ...(e.action ? [{ le: maintenant, action: e.action }] : [])] };
    delete reg[e.chat_id].action; ecrireJson(f, reg); return reg[e.chat_id]; });
}
async function rangerChat(cfg, s, chat, dossier) {
  const nom = sectionDe(dossier); if (!nom) return null;
  const l = await s.call('threadSection/list', {}).catch(() => null); let sec = (l?.data || []).find((x) => x.name === nom);
  if (!sec && l) sec = (await s.call('threadSection/create', { name: nom }).catch(() => null))?.section || null;
  if (!sec?.id) return { range: false, dossier: nom };
  await s.call('thread/section/move', { threadId: chat, sectionId: sec.id }).catch(() => null); return { range: true, dossier: nom };
}
// ----- lanceur -----
export const LANCEUR = { cadrage: { role: 'CADRE', tache: 'cadrage' }, prototype: { role: 'PROTO', tache: 'prototype' }, issue: { role: 'DEV', tache: 'dev' }, iteration: { role: 'DEV', tache: 'dev' },
  milestone: { role: 'MS', tache: 'pilotage' }, test: { role: 'TEST', tache: 'recette-milestone' }, cloture: { role: 'BILAN', tache: 'finalisation' }, nettoyeur: { role: 'RELAIS', tache: 'automatisation', criticite: 'leger' },
  'cadrage-court': { inline: true, tache: 'cadrage' }, finaliser: { inline: true, tache: 'finalisation' }, projet: { inline: true, tache: 'cadrage' }, menage: { inline: true, tache: 'pilotage', criticite: 'leger' },
  archi: { role: 'ARCHI', fixe: true }, evolution: { role: 'ARCHI', fixe: true }, poste: { direct: true },
  digest: { direct: true }, etat: { direct: true }, point: { direct: true }, modele: { direct: true }, aide: { direct: true }, livrer: { direct: true }, pause: { direct: true }, reprendre: { direct: true }, campagne: { direct: true } };
function registresFusionnes(cfg) {
  const local = Object.fromEntries(Object.entries(lireRegistreChats(cfg)).map(([k, v]) => [k, { ...v, chat_id: k, hote: v.hote || cfg.hote }]));
  if (!cfg.registre_distant) return local;
  try { const d = viaAtelier(cfg, ['chats']); return { ...Object.fromEntries(Object.entries(d).map(([k, v]) => [k, { ...v, chat_id: k, hote: v.hote || 'atelier' }])), ...local }; } catch { return local; }
}
export async function lancerCommande(cfg, { commande, args = [], depuisModele = null, depuisRole = null, fiche = '', projet = null, criticite = null, garder = null, nouveau = false }) {
  const spec = LANCEUR[commande]; if (!spec) refuser('COMMANDE INCONNUE', '$dev ' + commande);
  if (spec.fixe) return lancerArchi(cfg, { commande, args, fiche });
  const ligneCommande = '$dev ' + [commande, ...args].join(' ');
  if (spec.direct) return { action: 'executer_ici', commande: ligneCommande, consigne: 'commande déterministe : node <pilote> ' + [commande, ...args].join(' ') + (commande === 'point' ? ' --texte, puis recopier la sortie telle quelle (lecture seule)' : '') + ', aucun modèle requis' };
  const r = router(cfg, { tache: spec.tache, criticite: spec.criticite || criticite || 'standard' });
  const ici = depuisModele && String(depuisModele).replace(/^[a-z]+\//, '') === r.modele && !['ARCHI', 'AUTO', 'SUP'].includes(String(depuisRole || '').toUpperCase()); // ARCHI et les orchestrateurs délèguent toujours (v2.6.3)
  if (ici) return { action: 'executer_ici', commande: ligneCommande, modele: r.modele, consigne: 'le modèle du chat courant est celui du routeur : exécuter ici' };
  const resume = String(fiche || '').split('\n').filter((l) => l.trim()).slice(0, 15).join('\n');
  if (spec.inline) {
    const consigne = 'Fiche de lancement (seul contexte transmis) :\n' + resume + '\n\nExécute ' + ligneCommande + ' selon le skill ' + path.join(RACINE, 'SKILL.md') + ' (pilote : ' + (cfg.pilote || path.join(RACINE, 'scripts', 'pilote.mjs')) + '). Réponds en 5 lignes au maximum : fait, preuve, suite.';
    if (!cfg.codexExecutable) return { action: 'sous_agent', modele: r.modele, catalogue: r.catalogue, execute: false, consigne };
    const sortie = path.join(os.tmpdir(), 'lanceur-' + process.pid + '.md'); const e = cfg.execution || {};
    const x = spawnSync(cfg.codexExecutable, ['exec', '--ephemeral', '--skip-git-repo-check', '-s', e.sandbox || 'workspace-write', '-c', 'approval_policy="' + (e.approvalPolicy || 'never') + '"', '-m', r.catalogue, '-C', cfg.etat, '-o', sortie], { input: consigne, encoding: 'utf8', windowsHide: true, timeout: 30 * 60000 });
    const res = fs.existsSync(sortie) ? fs.readFileSync(sortie, 'utf8').trim().split('\n').slice(0, 5).join('\n') : ''; fs.rmSync(sortie, { force: true });
    return { action: 'sous_agent', modele: r.modele, execute: true, code: x.status, resultat: res || 'aucune réponse du sous-agent (code ' + x.status + ')' };
  }
  const objet = args.join(' ').trim() || commande;
  projet ||= Object.keys(cfg.projets || {}).find((p) => normaliserObjet(objet + ' ' + resume).includes(normaliserObjet(p))) || 'general';
  const t = titre(spec.role, projet, objet); const reg = registresFusionnes(cfg);
  const vivants = Object.values(reg).filter((x) => x.role === spec.role && ['actif', 'attente_go', 'bloque', 'a_creer'].includes(x.statut || 'actif'));
  const ouvrirExistant = (x) => ({ action: 'ouvrir', chat: x.chat_id, hote: x.hote, titre: x.titre, modele: x.modele, ligne: '→ déjà ouvert : ' + x.titre + ' (' + nomCourt(x.modele) + ', ' + sectionDe(x.dossier) + ')' });
  if (garder) { const x = reg[garder]; if (!x) refuser('CHAT INCONNU', garder); return ouvrirExistant(x); }
  const meme = vivants.find((x) => normaliserObjet(x.objet) === normaliserObjet(objet) && (x.projet || projet) === projet);
  if (meme) return ouvrirExistant(meme);
  const proches = nouveau ? [] : vivants.filter((x) => proximite(x.objet, objet) >= 0.5);
  const qf = path.join(cfg.etat, 'lanceur-questions.json'); const dejaPosees = lireJson(qf, {});
  if (proches.length && !dejaPosees[spec.role + ':' + normaliserObjet(objet)]) {
    dejaPosees[spec.role + ':' + normaliserObjet(objet)] = new Date().toISOString(); ecrireJson(qf, dejaPosees);
    return { action: 'question', candidats: proches.map((x) => ({ chat: x.chat_id, titre: x.titre })), question: 'Sujet proche d’un chat existant : lequel garder ? Relancer avec --garder <chat> pour le reprendre, ou --nouveau pour en créer un.' };
  }
  const consigne = 'Fiche de lancement (rédigée par le chat lanceur, seul contexte transmis) :\n' + resume + '\n\nCommande à exécuter : ' + ligneCommande + ' (lis ' + path.join(RACINE, 'SKILL.md').replace(/\\/g, '/') + ' et la référence de la commande).';
  try {
    const c = await ouvrirChatTravail(cfg, { role: spec.role, projet, objet, modele: r.modele, consigne });
    return { action: 'cree', chat: c.chat, hote: c.delegue_a || cfg.hote, titre: c.titre, dossier: sectionDe(c.dossier), modele: r.modele, range: c.range ?? null, ligne: '→ ouvert : ' + c.titre + ' (' + nomCourt(r.modele) + ', ' + sectionDe(c.dossier) + ')' };
  } catch (e) {
    if (!(e instanceof Refus) || !['APP-SERVER INDISPONIBLE', 'CHAT NON CRÉÉ'].includes(e.titre)) throw e;
    const id = 'a_creer-' + Date.now(); const premier = '▣ ' + t.titre + '\nModèle     : ' + r.modele + '\n\n' + consigne;
    inscrireChat(cfg, { chat_id: id, titre: t.titre, role: spec.role, objet, projet, dossier: t.dossier, modele: r.catalogue, hote: cfg.hote, statut: 'a_creer', lien: { type: 'sujet', id: objet }, action: 'à créer à la main (' + e.titre + ')' });
    return { action: 'a_creer', registre: id, bloc: { dossier: sectionDe(t.dossier), titre: t.titre, modele: r.catalogue, premier_message: premier }, raison: e.message };
  }
}
// ----- ménage -----
// ----- 🏛 ARCHI : chat unique de l'architecte du workflow, sur le poste, modèle fixe hors routeur (archi.md) -----
export const modeleArchi = (cfg) => cfg.modeles.archi || cfg.modeles.cerveau || 'claude-opus-5-5';
const estTitreArchi = (t) => /^🏛\uFE0F?\sARCHI\s·\sworkflow/u.test(String(t || ''));
export function premierMessageArchi(cfg, modele) {
  return ['▣ 🏛 ARCHI — workflow', 'Rôle    : architecte du workflow $dev v' + VERSION + ' : conçoit, outille et vérifie ; n’exécute ni campagne, ni issue, ni livraison',
    'Modèle  : ' + modele + '  ·  Hôte : 💻 local  ·  Dossier : 00 Accueil', 'Lit     : ' + path.join(RACINE, 'references', 'archi.md') + ' et ' + path.join(RACINE, 'references', 'decisions-workflow.md') + ', puis les seuls fichiers concernés',
    'Badge   : ▸ 🏛 ARCHI · workflow · 💻 local · <modèle>', 'Reprise : si ce chat est recréé, repartir de la fiche de reprise dans ' + path.join(cfg.etat, 'reprises'), REGLE_LIGNE_ETAT].join('\n');
}
function lancerArchi(cfg, { commande, args = [], fiche = '' }) {
  const ligne = '$dev ' + [commande, ...args].join(' ');
  if (commande === 'evolution' && !args.join(' ').trim()) refuser('SUJET ABSENT', 'usage : $dev evolution <sujet>');
  const resume = String(fiche || '').split('\n').filter((l) => l.trim()).slice(0, 15).join('\n');
  const message = commande === 'evolution' ? (resume ? 'Fiche de lancement (seul contexte transmis) :\n' + resume + '\n\n' : '') + ligne : null;
  const vivants = Object.values(registresFusionnes(cfg)).filter((x) => x.role === 'ARCHI' && ['actif', 'attente_go', 'bloque', 'a_creer'].includes(x.statut || 'actif'))
    .sort((a, b) => (a.statut === 'a_creer') - (b.statut === 'a_creer') || String(b.derniere_activite || '').localeCompare(String(a.derniere_activite || '')));
  if (vivants.length) {
    const x = vivants[0]; const signalements = vivants.length > 1 ? [vivants.length + ' chats ARCHI vivants au registre : le plus récent est gardé, les autres sont à signaler à $dev menage'] : [];
    if (x.statut === 'a_creer') return { action: 'ouvrir', chat: x.chat_id, statut: 'a_creer', titre: TITRE_ARCHI, signalements, ligne: '→ ' + TITRE_ARCHI + ' est déjà à créer à la main (bloc rendu au premier appel) : aucun doublon créé', ...(message ? { poster: message } : {}) };
    return { action: 'ouvrir', chat: x.chat_id, hote: x.hote || 'local', titre: TITRE_ARCHI, modele: x.modele, signalements, ...(message ? { poster: message, ensuite: 'poster le message dans ce chat (outil de l’application), puis l’ouvrir' } : { ensuite: 'ouvrir le chat, sans rien poster' }),
      ligne: '→ ouvert : ' + TITRE_ARCHI + ' (' + nomCourt(x.modele) + ', 00 Accueil)' };
  }
  if (cfg.hote !== 'local') refuser('CHAT ARCHI SUR LE POSTE', TITRE_ARCHI + ' vit sur le poste : lancer ' + ligne + ' depuis le poste (❓ AIDE), jamais depuis ' + cfg.hote);
  const modele = modeleArchi(cfg); const id = 'a_creer-archi-' + Date.now();
  inscrireChat(cfg, { chat_id: id, titre: TITRE_ARCHI, role: 'ARCHI', objet: 'workflow', projet: 'workflow', dossier: DOSSIERS.ARCHI, modele, hote: 'local', statut: 'a_creer', lien: { type: 'sujet', id: 'workflow' }, action: 'à créer à la main (le poste n’a pas d’app-server)' });
  return { action: 'a_creer', registre: id, bloc: { dossier: DOSSIERS.ARCHI, titre: TITRE_ARCHI, modele, catalogue: catalogue(cfg, modele), premier_message: premierMessageArchi(cfg, modele) + (message ? '\n\n' + message : '') },
    ensuite: 'créer le chat avec ce bloc, le ranger dans 00 Accueil, puis : node <pilote> archi enregistrer <chat_id>' };
}
export function enregistrerArchi(cfg, id, modele) {
  if (!id) refuser('CHAT ABSENT', 'usage : pilote.mjs archi enregistrer <chat_id> [--modele <modèle>]');
  const reg = lireRegistreChats(cfg);
  for (const [k, v] of Object.entries(reg)) if (k !== id && v.role === 'ARCHI' && v.statut === 'a_creer') inscrireChat(cfg, { chat_id: k, statut: 'clos', action: 'remplacé par le chat ' + id });
  return inscrireChat(cfg, { chat_id: id, role: 'ARCHI', titre: TITRE_ARCHI, objet: 'workflow', projet: 'workflow', dossier: DOSSIERS.ARCHI, modele: modele || reg[id]?.modele || modeleArchi(cfg), hote: 'local', lien: { type: 'sujet', id: 'workflow' }, statut: 'actif', action: 'chat ARCHI enregistré' });
}
// ----- ménage -----
const PASTILLE_ROLE = /^(🟢|🟠|🔷|🔵|🟣|🎨|🧪|⚙️|📘|❓|🏛\uFE0F?)\s(AUTO|SUP|MS|DEV|CADRE|PROTO|TEST|RELAIS|BILAN|AIDE|ARCHI)\s·\s(.+)$/u;
function taillesSessions(racine, ids = null) {
  const voulus = ids ? new Set(ids) : null; const chemins = {}; const pile = [racine];
  while (pile.length) { const d = pile.pop(); let l = []; try { l = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const x of l) { const p = path.join(d, x.name); if (x.isDirectory()) pile.push(p); else { const m = x.name.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/); if (m && (!voulus || voulus.has(m[1]))) chemins[m[1]] = p; } } }
  const res = {};
  for (const [id, p] of Object.entries(chemins)) { try { const t = fs.statSync(p).size; const n = Math.min(t, 4 * 1048576); const fd = fs.openSync(p, 'r'); const b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, t - n); fs.closeSync(fd);
    const m = [...b.toString('utf8').matchAll(/"last_token_usage":\{"input_tokens":(\d+)/g)].at(-1); if (m) res[id] = Number(m[1]); } catch {} }
  return res; // contexte réel du dernier tour ; absent = inconnu (jamais estimé par la taille du fichier)
}
export function donneesMenage(cfg, ids = null) {
  const camp = listerCampagnes(cfg).map((c) => ({ id: c.id, statut: c.statut, chat: c.chat || null, voie: c.voie_recette?.chat || null, issues: issues(c).map((i) => ({ id: i.linear_id, statut: i.statut })) }));
  return { chats: lireRegistreChats(cfg), campagnes: camp, tailles: taillesSessions(path.join(os.homedir(), '.codex', 'sessions'), ids), aide: lireJson(path.join(cfg.etat, 'aide.json'), {}).chat_id || null };
}
export function analyserMenage(cfg, { chats = [], maintenant = new Date(), linear = {} } = {}) {
  if (cfg.registre_distant && !chats.some((c) => c.hote === 'atelier')) { try { chats = [...chats, ...viaAtelier(cfg, ['chats-app'])]; } catch {} }
  const conf = { seuil: cfg.chats?.seuil_contexte ?? 300000, dormant: cfg.chats?.dormant_jours ?? 14, archive: cfg.chats?.archive_apres_heures != null ? cfg.chats.archive_apres_heures / 24 : (cfg.chats?.archive_apres_jours ?? 1 / 24) }; // v2.6.2 : en heures (1 h)
  const ids = chats.map((c) => c.id); const loc = donneesMenage(cfg, ids); let dist = { chats: {}, campagnes: [], tailles: {}, aide: null };
  if (cfg.registre_distant) { try { dist = viaAtelier(cfg, ['menage-donnees', '--ids', ids.join(',') || '-']); } catch {} }
  const reg = { ...Object.fromEntries(Object.entries(dist.chats).map(([k, v]) => [k, { ...v, hote: v.hote || 'atelier' }])), ...Object.fromEntries(Object.entries(loc.chats).map(([k, v]) => [k, { ...v, hote: v.hote || cfg.hote }])) };
  const campagnes = [...dist.campagnes, ...loc.campagnes]; const tailles = { ...dist.tailles, ...loc.tailles };
  const aides = new Set([loc.aide, dist.aide].filter(Boolean));
  const issuesCloses = new Set(campagnes.flatMap((c) => c.issues.filter((i) => i.statut === 'close').map((i) => i.id)));
  for (const [id, etatL] of Object.entries(linear)) if (/merg|termin|done|cancel|annul|prod|sandbox/i.test(etatL)) issuesCloses.add(id);
  const campEnCours = new Set(campagnes.filter((c) => c.statut === 'en_cours').flatMap((c) => [c.chat, c.voie]).filter(Boolean));
  const jours = (d) => d ? (maintenant - Date.parse(d)) / 86400000 : 0;
  const lignes = []; const rappels = []; const proteges = [];
  const vivants = chats.filter((c) => !(c.archive ?? c.archived));
  const parCle = {};
  for (const c of vivants) {
    const t = c.titre ?? c.title ?? ''; const r = reg[c.id]; const m = t.match(PASTILLE_ROLE); const role = r?.role || m?.[2] || null;
    const archi = role === 'ARCHI' || estTitreArchi(t); // jamais archivé, clos ni recréé par le ménage ; peut être signalé trop lourd
    const protege = archi || t.startsWith('❓ AIDE') || aides.has(c.id) || campEnCours.has(c.id) || r?.orchestrateur && campEnCours.has(c.id);
    if (protege) proteges.push(c.id);
    const maj = c.maj || c.updatedAt || r?.derniere_activite; const age = jours(maj);
    if (/⏸ GO/.test(t) && age > 1) rappels.push('⏸ GO en souffrance depuis ' + Math.round(age * 24) + ' h : ' + t);
    if (/⛔/.test(t) && age > 2) rappels.push('⛔ bloqué depuis ' + Math.round(age) + ' j : ' + t);
    const ajout = (categorie, action, sure, ops) => lignes.push({ n: lignes.length + 1, chat: c.id, hote: c.hote || r?.hote || 'local', titre: t, categorie, action, sure, ops });
    const lien = r?.lien || (r?.issue ? { type: 'issue', id: r.issue } : r?.campagne ? { type: 'campagne', id: r.campagne } : null);
    const objetClos = lien && ((lien.type === 'issue' && issuesCloses.has(lien.id)) || (lien.type === 'campagne' && campagnes.some((x) => x.id === lien.id && x.statut === 'close')) || r?.statut === 'clos');
    const estClos = /✅\s*$/.test(t);
    if (!r) { const inf = m ? { role: m[2], objet: m[3].replace(/\s·\s(⏸ GO|⛔ BLOQUÉ|✅|\d+%).*$/u, '') } : null;
      if (inf && (!protege || archi)) ajout('hors_registre', 'rattacher au registre (' + inf.role + ' · ' + inf.objet + ')', true, [{ type: 'rattacher', role: inf.role, objet: inf.objet, titre: t, dossier: (c.dossier || DOSSIERS[inf.role] || '') }]);
      else if (!inf && !protege) ajout('hors_registre', 'rôle inconnu : proposer l’archivage', false, [{ type: 'archiver' }]); }
    if (role && !protege) { const cle = role + '|' + normaliserObjet(r?.objet || m?.[3] || t); (parCle[cle] ||= []).push({ c, maj }); }
    const taille = tailles[c.id] || r?.taille_contexte || 0;
    if (protege) { if (archi && taille > conf.seuil) ajout('trop_lourd', 'contexte estimé ' + Math.round(taille / 1000) + 'k tokens : ARCHI écrit sa fiche de reprise, puis Paul le recrée à la main (jamais archivé par le ménage)', false, []); continue; }
    if (objetClos && !estClos) ajout('a_cloturer', 'poster le bilan, puis passer en ✅', true, [{ type: 'cloturer', titre: t.replace(/\s·\s(⏸ GO|⛔ BLOQUÉ)$/u, '') + ' · ✅' }]);
    else if (estClos && age > conf.archive) ajout('a_archiver', '✅ depuis ' + (age >= 1 ? Math.round(age) + ' j' : Math.round(age * 24) + ' h') + ' : déplacer dans 99 Archives', true, [{ type: 'archiver' }]);
    else if (!estClos && age > conf.dormant) ajout('dormant', 'sans activité depuis ' + Math.round(age) + ' j : reprendre, mettre en pause ou archiver ?', false, [{ type: 'dormant' }]);
    if (role && (!m || (DOSSIERS[role] && c.dossier && sectionDe(DOSSIERS[role]) !== c.dossier))) {
      const ops = []; if (!m && r) ops.push({ type: 'renommer', titre: titre(role, r.projet || 'general', r.objet || t).titre }); if (DOSSIERS[role] && c.dossier !== sectionDe(DOSSIERS[role])) ops.push({ type: 'ranger', dossier: sectionDe(DOSSIERS[role]) });
      if (ops.length) ajout('mal_nomme', ops.map((o) => o.type === 'renommer' ? 'renommer en « ' + o.titre + ' »' : 'ranger dans ' + o.dossier).join(', '), true, ops); }
    if (r?.ligne_absente && !estClos) ajout('sans_ligne', 'dernier message sans ligne d’état : le lui rappeler', false, []);
    if (taille > conf.seuil) ajout('trop_lourd', 'contexte estimé ' + Math.round(taille / 1000) + 'k tokens : fiche de reprise, recréer, archiver l’ancien', false, [{ type: 'recreer' }]);
  }
  for (const l of Object.values(parCle)) if (l.length > 1) { l.sort((a, b) => String(b.maj).localeCompare(String(a.maj))); for (const x of l.slice(1)) lignes.push({ n: lignes.length + 1, chat: x.c.id, hote: x.c.hote || 'local', titre: x.c.titre ?? x.c.title, categorie: 'doublon', action: 'doublon de « ' + (l[0].c.titre ?? l[0].c.title) + ' » : garder le plus récent, archiver celui-ci', sure: false, ops: [{ type: 'archiver' }] }); }
  const date = maintenant.toISOString().slice(0, 10); const dossier = path.join(cfg.etat, 'menage'); fs.mkdirSync(dossier, { recursive: true });
  const totaux = {}; for (const l of lignes) totaux[l.categorie] = (totaux[l.categorie] || 0) + 1;
  const analyse = { date: maintenant.toISOString(), lignes, rappels, proteges, totaux };
  ecrireJson(path.join(dossier, 'derniere.json'), analyse); ecrireJson(path.join(dossier, date + '.json'), analyse);
  const texte = [...rappels, ...lignes.map((l) => l.n + '. ' + l.titre + ' — ' + l.categorie + ' — ' + l.action + ' — ' + (l.sure ? 'sûre' : 'à décider'))];
  let rapport = texte;
  if (texte.length > 39) { fs.writeFileSync(path.join(dossier, date + '.md'), '# Ménage du ' + date + '\n\n' + texte.map((x) => '- ' + x).join('\n') + '\n'); rapport = [...rappels.slice(0, 10), ...Object.entries(totaux).map(([k, v]) => k + ' : ' + v + ' chat(s)'), 'Détail : ' + path.join(dossier, date + '.md')]; }
  rapport.push('Totaux : ' + (Object.entries(totaux).map(([k, v]) => k + ' ' + v).join(', ') || 'rien à faire') + ' · appliquer : $dev menage appliquer surs | <numéros> | tout');
  const attente = lignes.filter((l) => !l.sure).length; ecrireJson(path.join(dossier, 'attente.json'), { n: attente, le: maintenant.toISOString() });
  if (cfg.registre_distant) { try { viaAtelier(cfg, ['menage-attente', String(attente)]); } catch {} }
  return { rapport: rapport.slice(0, 40), lignes: lignes.length, totaux, proteges_ids: proteges.join(','), en_attente_decision: attente, fichier: path.join(dossier, date + '.json') };
}
async function executerOpsChats(cfg, ops) {
  const { connecter } = await import('./appserver.mjs'); const s = await connecter(cfg); const res = [];
  try { for (const o of ops) { try {
    if (o.type === 'renommer') await s.call('thread/name/set', { threadId: o.chat, name: o.titre });
    else if (o.type === 'ranger') await rangerChat(cfg, s, o.chat, o.dossier);
    else if (o.type === 'archiver') { await rangerChat(cfg, s, o.chat, '99 Archives'); await s.call('thread/archive', { threadId: o.chat }); }
    else if (o.type === 'cloturer') { const reg = lireRegistreChats(cfg)[o.chat] || {}; await s.call('turn/start', { threadId: o.chat, model: reg.modele, effort: 'low', ...parametresTour(cfg), input: [{ type: 'text', text: 'Ménage : l’objet de ce chat est clos. Écris son bilan en 5 lignes au plus (résultat, preuves, suite), sans autre action.' }] }).catch(() => null); await s.call('thread/name/set', { threadId: o.chat, name: o.titre }); }
    else if (o.type === 'recreer') { const reg = lireRegistreChats(cfg)[o.chat] || {}; await s.call('turn/start', { threadId: o.chat, model: reg.modele, effort: 'low', ...parametresTour(cfg), input: [{ type: 'text', text: 'Ménage : ce chat est trop lourd. Écris une fiche de reprise de 15 lignes au plus dans ' + path.join(cfg.etat, 'reprises', o.chat + '.md') + ', puis arrête-toi ; il sera recréé à partir de cette fiche.' }] }).catch(() => null); }
    res.push({ ...o, fait: true });
  } catch (e) { res.push({ ...o, fait: false, erreur: e.message }); } } } finally { s.fermer(); }
  for (const o of res.filter((x) => x.fait)) { const st = { archiver: 'archive', cloturer: 'clos' }[o.type]; inscrireChat(cfg, { chat_id: o.chat, ...(st ? { statut: st } : {}), ...(o.type === 'renommer' || o.type === 'cloturer' ? { titre: o.titre } : {}), action: 'ménage : ' + o.type }); }
  return res;
}
export async function appliquerMenage(cfg, selection = 'surs', { chats = null, maintenant = new Date(), linear = {} } = {}) {
  let analyse = lireJson(path.join(cfg.etat, 'menage', 'derniere.json'), null);
  if (chats || !analyse) { analyserMenage(cfg, { chats: chats || [], maintenant, linear }); analyse = lireJson(path.join(cfg.etat, 'menage', 'derniere.json'), null); }
  const nums = /^[\d,\s]+$/.test(selection) ? new Set(selection.split(/[,\s]+/).filter(Boolean).map(Number)) : null;
  const choisies = analyse.lignes.filter((l) => selection === 'surs' ? l.sure : selection === 'tout' ? l.categorie !== 'dormant' : nums?.has(l.n));
  const proteges = new Set(analyse.proteges);
  const ops = choisies.flatMap((l) => l.ops.filter((o) => o.type !== 'dormant' && !(proteges.has(l.chat) && ['archiver', 'cloturer', 'recreer'].includes(o.type))).map((o) => ({ ...o, chat: l.chat, hote: l.hote, n: l.n, categorie: l.categorie })));
  const rattacher = ops.filter((o) => o.type === 'rattacher'); const autres = ops.filter((o) => o.type !== 'rattacher');
  for (const o of rattacher) { const cible = o.hote === 'atelier' && cfg.registre_distant ? 'distant' : 'local';
    const e = { chat_id: o.chat, titre: o.titre, role: o.role, objet: o.objet, dossier: o.dossier, hote: o.hote, lien: { type: 'sujet', id: o.objet }, statut: /✅\s*$/.test(o.titre) ? 'clos' : 'actif', action: 'ménage : rattaché au registre' };
    if (cible === 'distant') viaAtelier(cfg, ['chat-inscrire', '--json-stdin'], JSON.stringify(e)); else inscrireChat(cfg, e); }
  const surAtelier = autres.filter((o) => o.hote === 'atelier' || (o.hote === cfg.hote && (cfg.appServerSocket || cfg.appServerFactice)));
  const outil = autres.filter((o) => !surAtelier.includes(o));
  let faits = [];
  if (surAtelier.length) faits = cfg.registre_distant && !cfg.appServerSocket ? viaAtelier(cfg, ['menage-executer', '--json-stdin'], JSON.stringify(surAtelier)) : await executerOpsChats(cfg, surAtelier);
  for (const o of outil) inscrireChat(cfg, { chat_id: o.chat, ...(o.type === 'archiver' ? { statut: 'archive' } : o.type === 'cloturer' ? { statut: 'clos', titre: o.titre } : {}), action: 'ménage : ' + o.type + ' (outil de l’application)' });
  const compte = (l) => Object.entries(l.reduce((a, o) => (a[o.categorie] = (a[o.categorie] || 0) + 1, a), {})).map(([k, v]) => k + ':' + v).join(', ') || 'aucune';
  const enAttente = analyse.lignes.filter((l) => !choisies.includes(l));
  return { selection, applique_texte: compte(ops), en_attente_texte: compte(enAttente.map((l) => ({ categorie: l.categorie }))), faits_par_pilote: faits, operations_outil: outil.map((o) => ({ chat: o.chat, type: o.type, titre: o.titre, dossier: o.type === 'archiver' ? '99 Archives' : o.dossier })), proteges_ids: analyse.proteges.join(',') };
}

export const ligneMenage = (cfg) => { const a = lireJson(path.join(cfg.etat, 'menage', 'attente.json'), {}); return a.n > 0 ? ['Ménage : ' + a.n + ' actions en attente de décision'] : []; };
// ---------- chats de travail sur le poste (livraisons) et tâches planifiées déclarées ----------
export const MESSAGE_CHAT_LOCAL = 'aucun chat interactif n’est créé sur le poste ; une livraison passe uniquement par $dev livrer <campagne> (exécuteur déterministe au premier plan, plan figé au GO, répétition à blanc d’abord)';
export function chatLocalDisponible(cfg) { return !!cfg.chat_local?.actif; }
export function signalementsLivraison(cfg, c) { if (c.hote_livraison !== 'local') return []; if (c.livraison_echec) return ['⛔ livraison de ' + c.id + ' arrêtée : ' + String(c.livraison_echec.message || '').split('\n')[0]]; return ['livraison de ' + c.id + ' : préparer plan-livraison.md sur atelier, ⏸ GO de Paul (livraison-go), puis $dev livrer ' + c.id + ' depuis le poste ; ' + MESSAGE_CHAT_LOCAL]; }
const fichierTache = (cfg, nom) => path.join(cfg.etat, 'taches', nom + '.json');
export function noterTacheReussie(cfg, nom, detail = {}) { ecrireJson(fichierTache(cfg, nom), { derniere_reussite: new Date().toISOString(), ...detail }); }
export function etatTaches(cfg) {
  return (cfg.taches_planifiees || []).map((t) => {
    const r = { nom: t.nom, frequence: t.frequence, role: t.role, protegee: t.protegee !== false, derniere_reussite: lireJson(fichierTache(cfg, t.nom), {}).derniere_reussite || null };
    if (process.platform === 'win32') {
      const q = spawnSync('powershell.exe', ['-NoProfile', '-Command', "$i = Get-ScheduledTask -TaskName '" + t.nom.replace(/'/g, "''") + "' -EA SilentlyContinue | Get-ScheduledTaskInfo; if ($i) { @{ derniere_execution = $i.LastRunTime.ToString('o'); resultat = $i.LastTaskResult; prochaine = $i.NextRunTime.ToString('o') } | ConvertTo-Json -Compress } else { '{\"absente\":true}' }"], { encoding: 'utf8', windowsHide: true, timeout: 20000 });
      try { const x = JSON.parse(q.stdout.trim() || '{}'); Object.assign(r, x.absente ? { planificateur: 'ABSENTE du planificateur' } : { derniere_execution: x.derniere_execution?.startsWith('1999') ? null : x.derniere_execution, resultat_planificateur: x.resultat === 267011 ? 'jamais exécutée' : x.resultat === 0 ? 'succès' : 'code ' + x.resultat, prochaine_execution: x.prochaine }); } catch { r.planificateur = 'illisible'; }
    }
    return r;
  });
}
export const tachesProtegees = (cfg) => (cfg.taches_planifiees || []).filter((t) => t.protegee !== false).map((t) => t.nom);

// ---------- chats de travail : créés et relancés uniquement par pilote.mjs (app-server, réglage d'accès de l'hôte) ----------
export const MARQUE_RESTREINT = '⛔ ACCÈS RESTREINT — relance demandée à pilote.mjs';
const fichierChats = (cfg) => path.join(cfg.etat, 'chats.json');
export function regleAcces(cfg, id) {
  const e = cfg.execution || {};
  return 'Accès attendu sur cet hôte : ' + (e.sandbox || 'workspace-write') + ', approbations ' + (e.approvalPolicy || 'never') + '. Si une commande échoue parce que le bac à sable bloque une écriture ou le réseau, ou si tu constates un accès plus restreint que celui-ci : ne demande JAMAIS d\'élévation. Exécute node ' + (cfg.pilote || path.join(RACINE, 'scripts', 'pilote.mjs')) + ' acces-restreint ' + id + ' (ignore son échec éventuel), puis termine aussitôt ton tour par une réponse dont la première ligne est exactement « ' + MARQUE_RESTREINT + ' ». pilote.mjs te relancera avec le bon réglage.';
}
export async function ouvrirChatTravail(cfg, { role, projet, objet, modele, cwd, consigne, campagne = null, issue = null, effort = 'medium', hote = null, livraison = false }) {
  if (hote === 'local' || livraison) refuser('CHAT LOCAL INDISPONIBLE', (livraison ? 'chat de livraison' : 'chat local') + ' demandé pour ' + projet + ' : ' + MESSAGE_CHAT_LOCAL, 6);
  role = String(role).toUpperCase(); if (!['DEV', 'TEST', 'CADRE', 'PROTO', 'MS', 'RELAIS', 'BILAN'].includes(role)) refuser('RÔLE INCONNU', role + ' (chats de travail : DEV, TEST, CADRE, PROTO, MS ; campagnes : pilote.mjs chat)');
  if (!modele) refuser('MODÈLE ABSENT', 'passer --modele <id issu du routeur>');
  if (!cfg.appServerSocket && !cfg.appServerFactice) {
    if (!cfg.ssh?.atelier || !cfg.pilote_atelier) refuser('APP-SERVER INDISPONIBLE', 'aucun app-server joignable sur cet hôte : Paul doit renseigner appServerSocket, ou ssh.atelier et pilote_atelier dans poste.local.json');
    const args = ['chat-travail', role, projet, objet, '--modele', modele, '--effort', effort, '--consigne-stdin'];
    if (cwd) args.push('--cwd', cwd); if (campagne) args.push('--campagne', campagne); if (issue) args.push('--issue', issue);
    const q = (x) => "'" + String(x).replace(/'/g, "'\\''") + "'";
    const r = spawnSync('ssh', [cfg.ssh.atelier, 'node ' + q(cfg.pilote_atelier) + ' ' + args.map(q).join(' ')], { input: consigne || '', encoding: 'utf8', windowsHide: true, timeout: 120000 });
    if (r.status !== 0) refuser('CHAT NON CRÉÉ', 'délégation à atelier : ' + (r.stderr || r.stdout || '').trim().slice(0, 300));
    return { ...JSON.parse(r.stdout), delegue_a: cfg.ssh.atelier };
  }
  const id = catalogue(cfg, modele); const t = titre(role, projet, objet);
  const { connecter } = await import('./appserver.mjs'); const s = await connecter(cfg);
  try {
    const e = cfg.execution || {};
    const th = await s.call('thread/start', { model: id, cwd: cwd || (cfg.projets?.[projet] || {}).chemin || cfg.etat, approvalPolicy: e.approvalPolicy || 'never', sandbox: e.sandbox || 'workspace-write' });
    const chat = th.thread.id;
    await s.call('thread/name/set', { threadId: chat, name: t.titre });
    const carte = ['▣ ' + t.titre, 'Chat       : ' + chat, 'Hôte       : ' + (cfg.hote === 'atelier' ? '☁ atelier' : '💻 local'), 'Modèle     : ' + modele].join('\n');
    const texte = carte + '\n\n' + regleAcces(cfg, chat) + '\n\n' + (consigne || '') + '\n\n' + REGLE_LIGNE_ETAT;
    const tour = await s.call('turn/start', { threadId: chat, model: id, effort, ...parametresTour(cfg), input: [{ type: 'text', text: texte }] });
    inscrireChat(cfg, { chat_id: chat, role, titre: t.titre, dossier: t.dossier, projet, objet, modele: id, effort, cwd: cwd || null, hote: cfg.hote, lien: issue ? { type: 'issue', id: issue } : campagne ? { type: 'campagne', id: campagne } : { type: 'sujet', id: objet }, campagne, issue, statut: 'actif', action: 'créé par pilote.mjs' });
    const rg = await rangerChat(cfg, s, chat, t.dossier);
    return { chat, titre: t.titre, dossier: t.dossier, modele: id, tour: tour.turn?.id, parametres: parametresTour(cfg), regle_acces: true, range: !!rg?.range, ranger: rg?.range ? null : 'déplacer le chat dans le dossier « ' + sectionDe(t.dossier) + ' »' };
  } finally { s.fermer(); }
}
export function accesRestreint(cfg, chat) {
  const marque = path.join(os.tmpdir(), 'pilote-relance', chat); let ou = null;
  try { verrou(cfg, () => { const reg = lireJson(fichierChats(cfg), {}); reg[chat] = { ...(reg[chat] || {}), relance_demandee: new Date().toISOString() }; ecrireJson(fichierChats(cfg), reg); }); ou = fichierChats(cfg); }
  catch { try { fs.mkdirSync(path.dirname(marque), { recursive: true }); fs.writeFileSync(marque, new Date().toISOString()); ou = marque; } catch {} }
  return { chat, signale: !!ou, ou, consigne: 'termine ton tour par « ' + MARQUE_RESTREINT + ' » ; pilote.mjs te relancera' };
}
export async function relancerChat(cfg, chat, { s = null, motif = 'accès restreint' } = {}) {
  const reg = lireJson(fichierChats(cfg), {}); const info = reg[chat] || {};
  if ((info.relances || 0) >= MAX_ESSAIS) refuser('CIRCUIT-BREAKER', chat + ' : ' + MAX_ESSAIS + ' relances pour accès restreint ; Paul doit vérifier le réglage d\'exécution de l\'hôte', 4);
  const { connecter } = await import('./appserver.mjs'); const propre = !s; s ||= await connecter(cfg);
  try {
    let lu = await s.call('thread/read', { threadId: chat, includeTurns: true });
    if (lu.thread?.status?.type === 'notLoaded') { const e = cfg.execution || {}; await s.call('thread/resume', { threadId: chat, model: info.modele, approvalPolicy: e.approvalPolicy || 'never', sandbox: e.sandbox || 'workspace-write' }); }
    const dernier = (lu.thread?.turns || []).at(-1);
    if (dernier?.status === 'inProgress') await s.call('turn/interrupt', { threadId: chat, turnId: dernier.id }).catch(() => {});
    const tour = await s.call('turn/start', { threadId: chat, model: info.modele || lu.thread?.model, effort: info.effort || 'medium', ...parametresTour(cfg), input: [{ type: 'text', text: 'Relance par pilote.mjs (' + motif + ') : le réglage d\'accès de l\'hôte est maintenant appliqué (' + JSON.stringify(parametresTour(cfg)) + '). Refais l\'action qui a échoué et poursuis ta mission, sans demander d\'élévation. ' + regleAcces(cfg, chat) }] });
    verrou(cfg, () => { const r2 = lireJson(fichierChats(cfg), {}); r2[chat] = { ...(r2[chat] || {}), relances: (r2[chat]?.relances || 0) + 1, derniere_relance: new Date().toISOString() }; delete r2[chat].relance_demandee; ecrireJson(fichierChats(cfg), r2); });
    fs.rmSync(path.join(os.tmpdir(), 'pilote-relance', chat), { force: true });
    return { chat, action: 'relance-acces', tour: tour.turn?.id, parametres: parametresTour(cfg) };
  } finally { if (propre) s.fermer(); }
}
const signaleRestreint = (cfg, chat, lu, info) => !!info.relance_demandee || fs.existsSync(path.join(os.tmpdir(), 'pilote-relance', chat)) || String(((lu?.thread?.turns || []).at(-1)?.items || []).filter((i) => i.type === 'agentMessage').at(-1)?.text || '').trimStart().startsWith(MARQUE_RESTREINT) || String(((lu?.thread?.turns || []).at(-1)?.items || []).filter((i) => i.type === 'agentMessage').at(-1)?.text || '').includes(MARQUE_RESTREINT);
export async function reveilChatsTravail(cfg, s) {
  const res = []; const reg = lireJson(fichierChats(cfg), {});
  for (const [chat, info] of Object.entries(reg)) {
    if (info.clos) continue;
    const lu = await s.call('thread/read', { threadId: chat, includeTurns: true }).catch(() => null);
    const etatChat = lu?.thread?.status?.type || 'inconnu';
    if (etatChat !== 'active') await suivreLigne(cfg, s, chat, info, lu).catch(() => null);
    if (etatChat === 'active' || !signaleRestreint(cfg, chat, lu, info)) { res.push({ chat, role: info.role, action: 'aucune', etat: etatChat }); continue; }
    try { res.push({ ...(await relancerChat(cfg, chat, { s })), role: info.role }); } catch (e) { res.push({ chat, role: info.role, action: 'refus', erreur: e.titre || e.message }); }
  }
  return res;
}
// ---------- livrables hors Git : protégés jusqu'à la clôture, rapatriés sur le poste ----------
export function livrablesProteges(cfg) { return listerCampagnes(cfg).flatMap((c) => issues(c).filter((i) => i.livrables && i.statut !== 'close').map((i) => i.livrables)); }
export function livrablesARapatrier(cfg) { return listerCampagnes(cfg).flatMap((c) => issues(c).filter((i) => i.livrables && i.livrables_joints && !i.livrables_sauvegardes).map((i) => ({ campagne: c.id, issue: i.linear_id, projet: i.projet || c.projet, dossier: i.livrables }))); }
export function marquerLivrables(cfg, nom, id, champ) { if (!['livrables_joints', 'livrables_sauvegardes'].includes(champ)) refuser('CHAMP INCONNU', champ); return modifierCampagne(cfg, nom, (c) => { const i = trouverIssue(c, id); i[champ] = new Date().toISOString(); return { campagne: nom, issue: id, [champ]: i[champ] }; }); }
export function rapatrierLivrables(cfg) {
  if (!cfg.ssh?.atelier || !cfg.pilote_atelier) refuser('RAPATRIEMENT IMPOSSIBLE', 'à lancer depuis le poste (ssh.atelier et pilote_atelier requis)');
  const base = cfg.sauvegarde_livrables || 'D:\\backup-livrables';
  const l = spawnSync('ssh', [cfg.ssh.atelier, 'node ' + cfg.pilote_atelier + ' livrables a-rapatrier'], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
  if (l.status !== 0) refuser('RAPATRIEMENT IMPOSSIBLE', (l.stderr || '').trim().slice(0, 300));
  const res = [];
  for (const x of JSON.parse(l.stdout).a_rapatrier || []) {
    const dest = path.join(base, x.projet, x.issue); fs.mkdirSync(dest, { recursive: true });
    const r = spawnSync('scp', ['-q', '-r', cfg.ssh.atelier + ':' + x.dossier + '/.', dest], { encoding: 'utf8', windowsHide: true, timeout: 600000 });
    if (r.status !== 0) { res.push({ ...x, sauvegarde: null, erreur: (r.stderr || '').trim().slice(0, 200) }); continue; }
    spawnSync('ssh', [cfg.ssh.atelier, 'node ' + cfg.pilote_atelier + ' livrables marquer ' + x.campagne + ' ' + x.issue + ' livrables_sauvegardes'], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
    res.push({ ...x, sauvegarde: dest });
  }
  if (!res.some((x) => x.erreur)) noterTacheReussie(cfg, 'pilote-livrables-rapatrier', { rapatries: res.length });
  return { rapatries: res };
}

// Recréation d'un chat de campagne trop lourd, uniquement à un point stable (aucune issue en préflight, en cours, en revue ni en recette).
export async function recreerChatCampagne(cfg, c, s) {
  const fiche = path.join(cfg.etat, 'reprises', c.id + '.md');
  if (c.recreer_chat === true || !fs.existsSync(fiche)) {
    if (c.recreer_chat === 'fiche_demandee') return { campagne: c.id, action: 'attente-fiche-reprise' };
    fs.mkdirSync(path.dirname(fiche), { recursive: true });
    await s.call('turn/start', { threadId: c.chat, model: c.chat_modele, effort: 'medium', ...parametresTour(cfg), input: [{ type: 'text', text: 'Point stable atteint : ce chat va être recréé (contexte trop lourd). Écris maintenant la fiche de reprise de la campagne, 40 lignes au plus, dans ' + fiche + ' : état par issue, décisions prises, points en attente de Paul, prochaines étapes. N’admets aucune nouvelle issue ; termine ton tour une fois la fiche écrite.' }] });
    modifierCampagne(cfg, c.id, (cc) => { cc.recreer_chat = 'fiche_demandee'; });
    return { campagne: c.id, action: 'fiche-reprise-demandee', fiche };
  }
  const ancien = c.chat; await rangerChat(cfg, s, ancien, '99 Archives'); await s.call('thread/archive', { threadId: ancien }).catch(() => null);
  inscrireChat(cfg, { chat_id: ancien, statut: 'archive', action: 'recréé à un point stable (fiche ' + fiche + ')' });
  modifierCampagne(cfg, c.id, (cc) => { cc.chat = null; cc.recreer_chat = false; cc.fiche_reprise = fiche; cc.ancien_chat = ancien; });
  const n = await ouvrirChat(cfg, c.id);
  return { campagne: c.id, action: 'chat-recree', ancien, nouveau: n.chat, fiche };
}
// ---------- chats d'orchestration (app-server de l'hôte) ----------
function consigneOrchestrateur(cfg, c, modele) {
  const a = avancement(c); const t = titreCampagne(c);
  const carte = ['▣ ' + t.titre, 'Mandat     : ' + (c.mandat || 'voir le contrat'), 'Campagne   : ' + c.id + ' (' + (c.mode === 'supervise' ? 'SUP' : 'AUTO') + ')  ·  ' + c.items.length + ' éléments, ' + a.total + ' issues', 'Hôte       : ☁ ' + c.hote_execution + (c.hote_livraison === 'local' ? '  ·  livraison : 💻 poste local' : ''), 'Modèle     : ' + modele + ' (pilotage · standard · compact)', 'Essais     : 3 par issue'].join('\n');
  return carte + '\n\nTu es l\'orchestrateur de cette campagne (workflow $dev v2.2). Lis dans l\'ordre : ' + RACINE + '/SKILL.md, references/campagne.md, puis ' + c.contrat + ' et la carte ' + path.join(cfg.etat, 'carte') + ' du dépôt concerné. ' + (c.fiche_reprise ? 'Fiche de reprise de l\'ancien chat, à lire avant tout : ' + c.fiche_reprise + '. ' : '') + 'Ensuite : node ' + RACINE + '/scripts/pilote.mjs contexte ' + c.id + '.\n' +
    'Admets les issues éligibles (dépendances fusionnées dans la branche de Milestone ou closes, au plus ' + cfg.admission.dev_max + ' développements dont ' + cfg.admission.lourdes_max + ' charge lourde) et confie chacune à un sous-agent dev, avec le modèle de pilote.mjs modele dev <criticite> <volumetrie> ' + c.id + ' --sous-agent (champ catalogue). Revue : sous-agent démarré à neuf (pilote.mjs modele revue ... --sous-agent). Tests : sous-agent Haiku. CHARGE LOURDE : toute suite complète, build complet, Docker, runtime de recette ou migration SQL se lance UNIQUEMENT par node ' + RACINE + '/scripts/pilote.mjs lourde ' + c.id + ' -- <commande> (au plus ' + cfg.admission.lourdes_max + ' en parallèle pour cette campagne' + (cfg.admission.lourdes_max_hote ? ', ' + cfg.admission.lourdes_max_hote + ' sur l\'hôte' : '') + ' ; au-delà, la commande attend son tour). Les sous-agents reçoivent cette consigne mot pour mot. Statuts uniquement via pilote.mjs statut ; échecs via pilote.mjs essai. CLÔTURE : pilote.mjs statut <campagne> <ID> close <matrice.json> ; la matrice de couverture est dressée par un sous-agent démarré à neuf à partir de la fiche Linear (une ligne par critère, scénario de recette et décision, chacune jouée réellement ; voir references/test.md). Une issue sans matrice complète n\'est pas close. Une issue avec sha_reprise repart du SHA validé et examine son WIP.\n' +
    'Termine chaque message final par la ligne d’état rendue par node ' + RACINE + '/scripts/pilote.mjs ligne-etat ' + c.id + ' (champ ligne), telle quelle, seule en dernière ligne. Une recette qu’atelier ne peut pas faire (Windows) part au poste par pilote.mjs poste deposer ' + c.id + ' <ID> --fiche <f>. Chaque rapport de sous-agent commence par son badge (pilote.mjs badge <rôle> <ID|-> <projet> <atelier|local> <modèle> [essai]). Décisions prises seul : pilote.mjs decision <campagne> <ID|GLOBAL> <texte>. Un choix qui reste dans le mandat (règle de recette, règle d\'admission, conformité à une règle écrite du projet, outil de test) n\'est PAS un motif d\'arrêt : prends l\'option la plus prudente conforme aux règles, note-la avec pilote.mjs decision et continue. Ne termine jamais un tour sur une question tant que du travail reste admissible. Tu ne t\'arrêtes que pour les 3 motifs (irréversible, hors mandat, circuit-breaker)' + (c.mode === 'supervise' ? ', plus un arrêt unique ⏸ GO juste avant toute actualisation de serveur, à exécuter depuis le poste' : '') + '. Réponds en français, format compact.\n' + regleAcces(cfg, c.chat || '<id de ce chat>');
}
export async function ouvrirChat(cfg, nom) {
  const c = lireCampagne(cfg, nom);
  if (c.statut !== 'en_cours') refuser('CAMPAGNE NON LANCÉE', nom + ' doit être en_cours');
  if (c.chat) refuser('CHAT DÉJÀ OUVERT', c.chat);
  const r = router(cfg, { tache: 'pilotage', criticite: 'standard' });
  const { connecter } = await import('./appserver.mjs'); const s = await connecter(cfg);
  try {
    const cwd = (cfg.projets[c.projet] || {}).chemin || cfg.etat;
    const t = await s.call('thread/start', { model: r.catalogue, cwd, approvalPolicy: (cfg.execution || {}).approvalPolicy || 'never', sandbox: (cfg.execution || {}).sandbox || 'workspace-write' });
    const thread = t.thread.id; const titreChat = titreCampagne(c).titre;
    await s.call('thread/name/set', { threadId: thread, name: titreChat });
    const tour = await s.call('turn/start', { threadId: thread, model: r.catalogue, effort: 'medium', ...parametresTour(cfg), input: [{ type: 'text', text: consigneOrchestrateur(cfg, { ...c, chat: thread }, r.modele) }] });
    modifierCampagne(cfg, nom, (cc) => { cc.chat = thread; cc.chat_modele = r.catalogue; cc.dernier_reveil = new Date().toISOString(); });
    inscrireChat(cfg, { chat_id: thread, role: c.mode === 'supervise' ? 'SUP' : 'AUTO', titre: titreChat, objet: nom, projet: c.projet, dossier: '01 Campagnes', campagne: nom, lien: { type: 'campagne', id: nom }, modele: r.catalogue, effort: 'medium', hote: cfg.hote, orchestrateur: true, statut: 'actif', action: 'chat de campagne créé par pilote.mjs' });
    await rangerChat(cfg, s, thread, '01 Campagnes');
    return { campagne: nom, chat: thread, titre: titreChat, tour: tour.turn?.id, modele: r.catalogue };
  } finally { s.fermer(); }
}
export async function reveil(cfg, { maintenant = new Date(), intervalleMin = 10 } = {}) {
  const res = []; const { connecter } = await import('./appserver.mjs'); let s = null;
  try {
    const campsR = listerCampagnes(cfg).filter((x) => x.statut === 'en_cours' && x.chat); const taillesR = taillesSessions(path.join(os.homedir(), '.codex', 'sessions'), campsR.map((x) => x.chat)); const seuilO = cfg.chats?.seuil_orchestrateur ?? 150000;
    for (let c of campsR) {
      if ((taillesR[c.chat] || 0) > seuilO && !c.recreer_chat) { modifierCampagne(cfg, c.id, (cc) => { cc.recreer_chat = true; }); c = lireCampagne(cfg, c.id); res.push({ campagne: c.id, action: 'recréation demandée au point stable (v2.7)', contexte_tokens: taillesR[c.chat] }); }
      const l = issues(c); const restant = l.filter((i) => !['close', 'bloquee'].includes(i.statut));
      s ||= await connecter(cfg);
      const lu = await s.call('thread/read', { threadId: c.chat, includeTurns: false }).catch((e) => ({ erreur: e.message }));
      let etatChat = lu?.thread?.status?.type || lu?.erreur || 'inconnu';
      if (etatChat === 'notLoaded') { const rep = await s.call('thread/resume', { threadId: c.chat, model: c.chat_modele, approvalPolicy: (cfg.execution || {}).approvalPolicy || 'never', sandbox: (cfg.execution || {}).sandbox || 'workspace-write' }).catch((e) => ({ erreur: e.message })); etatChat = rep?.erreur ? 'reprise impossible : ' + rep.erreur : 'idle'; if (!rep?.erreur) modifierCampagne(cfg, c.id, (cc) => { delete cc.dernier_reveil; }); }
      if (c.recreer_chat && etatChat === 'idle' && !issues(c).some((i) => ['preflight', 'en_cours', 'revue', 'recette'].includes(i.statut))) { res.push(await recreerChatCampagne(cfg, c, s)); continue; }
      const titreVoulu = titreCampagne(c).titre;
      if (lu?.thread && lu.thread.name !== titreVoulu) await s.call('thread/name/set', { threadId: c.chat, name: titreVoulu }).catch(() => {});
      const heure = Number(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }).format(maintenant));
      const jour = maintenant.toISOString().slice(0, 10);
      const digestDu = heure >= 8 && c.dernier_digest !== jour;
      const recent = c.dernier_reveil && (maintenant - Date.parse(c.dernier_reveil)) < intervalleMin * 60000;
      let dr = null; // v2.6.5 : relance sur changement, sinon une fois par heure
      if (etatChat === 'idle' && restant.length && !digestDu) { dr = decisionReprise(cfg, c, { maintenant, intervalleMin }); if (dr.memoriser) modifierCampagne(cfg, c.id, (cc) => { cc.empreinte_repos = dr.empreinte; cc.repos_le = maintenant.toISOString(); }); }
      if (etatChat === 'idle' && restant.length) { try { const ca = await cadreursAuto(cfg, lireCampagne(cfg, c.id), { maintenant }); if (ca) res.push(ca); } catch (e) { res.push({ campagne: c.id, action: 'cadreurs', erreur: e.message }); } } // v2.9
      if (etatChat !== 'idle' || (!restant.length && !digestDu) || (!digestDu && !dr?.relancer)) { res.push({ campagne: c.id, chat: etatChat, action: 'aucune', restant: restant.length, ...(dr ? { raison: dr.raison } : {}) }); continue; }
      const texte = digestDu ? 'Digest quotidien : produis le digest des dernières 24 h (node ' + RACINE + '/scripts/pilote.mjs digest ' + c.id + ', 15 lignes maximum, rubrique « À confirmer » comprise), puis reprends la campagne. ' + limitesTexte(cfg) + ' Termine ton tour par la ligne rendue par node ' + RACINE + '/scripts/pilote.mjs ligne-etat ' + c.id + ' (champ ligne).' : 'Reprise automatique : node ' + RACINE + '/scripts/pilote.mjs contexte ' + c.id + ', puis admets les issues éligibles et poursuis. Rappel : charges lourdes uniquement via pilote.mjs lourde ' + c.id + ' -- <commande>. Aucun agent concurrent : relance seulement les issues listées dans a_relancer. Les issues de a_relancer sont déjà admises et gardent leur place : relance chacune tout de suite (sous-agent dev, revue ou recette selon son statut), sans attendre de place libre ; des places toutes occupées n’empêchent que les nouvelles admissions. Une passe qui ne relance rien alors que a_relancer n’est pas vide est une erreur. Les issues de a_recetter reçoivent chacune leur recette propre, puis passent à close. Un choix dans le mandat n\'est pas un motif d\'arrêt : prends l\'option la plus prudente conforme aux règles, note-la avec pilote.mjs decision et continue ; ne termine jamais un tour sur une question tant que du travail reste admissible. ' + limitesTexte(cfg) + ' Une recette qu’atelier ne peut pas faire part au poste Windows : node ' + RACINE + '/scripts/pilote.mjs poste deposer ' + c.id + ' <ID> --fiche <f> (l’issue sort du quota) ; les retours arrivent dans retours_poste. Avant de passer une issue en bloquee (hors action irréversible), cherche une solution ou une décision avec un cadreur : node ' + RACINE + '/scripts/pilote.mjs lancer cadrage deblocage-<ID> --depuis-role AUTO --projet <projet> --nouveau --fiche-stdin (fiche de 15 lignes : blocage, essais, options ; le cadreur conclut par pilote.mjs decision <campagne> <ID> "Conclusion du cadreur : … ; réservé à Paul : oui|non") ; mandat de Paul : le cadreur décide par défaut (« à confirmer »), publie au besoin une issue corrective (pilote.mjs campagne ajouter) et écrit sa conclusion au journal ; l’issue reste en_attente (pilote.mjs arret … --attend agents --quoi "cadrage de déblocage") et ne passe bloquee --attend paul que si le cadreur conclut à un motif réservé à Paul, avec sa réponse proposée. v2.9 : --attend paul est refusé sans cette conclusion (CADREUR REQUIS) ; motif réservé à Paul d’emblée (action irréversible ou root, secret à fournir, hors mandat) : --reserve "<motif>". Ne demande jamais une décision à Paul dans ton texte : seule la ligne d’état lui parle. Une issue qui attend Paul, le poste ou l’environnement ne compte plus dans tes places : continue d’admettre tant que dev_max et ouvertes_max le permettent. Si la campagne ne bouge plus pendant 2 h, le réveil lance lui-même les cadreurs. Termine ton tour par la ligne rendue par node ' + RACINE + '/scripts/pilote.mjs ligne-etat ' + c.id + ' (champ ligne), seule en dernière ligne.';
      const t = await s.call('turn/start', { threadId: c.chat, model: c.chat_modele, effort: 'medium', ...parametresTour(cfg), input: [{ type: 'text', text: texte }] });
      modifierCampagne(cfg, c.id, (cc) => { cc.dernier_reveil = maintenant.toISOString(); if (digestDu) cc.dernier_digest = jour; cc.empreinte_repos = null; delete cc.repos_le; });
      res.push({ campagne: c.id, action: digestDu ? 'digest' : 'reprise', tour: t.turn?.id, restant: restant.length, ...(dr ? { raison: dr.raison } : {}) });
    }
    for (const c of listerCampagnes(cfg).filter((x) => x.statut === 'en_cours' && x.voie_recette?.chat)) { try { s ||= await connecter(cfg); res.push(await reveilVoieRecette(cfg, c, s, { maintenant, intervalleMin })); } catch (e) { res.push({ campagne: c.id, voie: 'recette', action: 'erreur', erreur: e.message }); } } // v2.7
    s ||= await connecter(cfg);
    res.push(...(await reveilChatsTravail(cfg, s)).filter((x) => x.action !== 'aucune'));
    try { res.push(...(await archiverTermines(cfg, s, maintenant))); } catch (e) { res.push({ action: 'archivage impossible', erreur: e.message }); } // v2.6.2
  } finally { s?.fermer(); }
  return res;
}


// ---------- v2.6.2 : archivage automatique des chats terminés (réveil, chats.archive_apres_heures) ----------
const RE_ID_ISSUE = /^[A-Z][A-Z0-9]*-\d+$/;
export function chatsAArchiver(cfg, maintenant = new Date()) {
  const reg = lireJson(fichierChats(cfg), {}); const h = cfg.chats?.archive_apres_heures ?? 1;
  const camps = listerCampagnes(cfg); const etatIssue = {}; for (const c of camps) for (const i of issues(c)) etatIssue[i.linear_id] = i.statut;
  const aide = lireJson(path.join(cfg.etat, 'aide.json'), {}).chat_id; const out = [];
  const depuisH = (d) => d ? (maintenant - Date.parse(d)) / 3600000 : 0;
  for (const [id, x] of Object.entries(reg)) {
    const t = String(x.titre || '');
    if (['archive', 'a_creer'].includes(x.statut) || ['AIDE', 'ARCHI'].includes(x.role) || id === aide || t.startsWith('❓ AIDE') || estTitreArchi(t)) continue; // jamais AIDE ni ARCHI
    if ((x.hote || cfg.hote) !== cfg.hote) continue; // seul l'hôte du chat l'archive
    const c = camps.find((k) => k.chat === id || k.voie_recette?.chat === id) || (x.orchestrateur || x.voie_recette ? camps.find((k) => k.id === x.campagne) : null);
    if (c || ['AUTO', 'SUP'].includes(x.role)) { // chat de campagne : campagne close et bilan terminé
      if (!c || c.statut !== 'close') continue;
      const bilan = Object.values(reg).some((b) => b.role === 'BILAN' && [b.campagne, b.lien?.id, b.objet].includes(c.id) && ['clos', 'archive'].includes(b.statut));
      if (bilan && depuisH(x.derniere_ligne_le || x.derniere_activite || c.maj) >= h) out.push({ chat: id, titre: t, motif: 'campagne ' + c.id + ' close, bilan fait' });
      continue;
    }
    if (!(x.statut === 'clos' || /✅\s*$/.test(t))) continue; // seuls les chats terminés (ligne ✅ TERMINÉ)
    const issue = x.lien?.type === 'issue' ? x.lien.id : x.issue || (RE_ID_ISSUE.test(x.objet || '') ? x.objet : null);
    if (issue && etatIssue[issue] && etatIssue[issue] !== 'close') continue; // chat d'une issue non close : gardé
    const age = depuisH(x.derniere_ligne_le || x.derniere_activite || x.cree_le);
    if (age >= h) out.push({ chat: id, titre: t, motif: 'terminé depuis ' + Math.floor(age) + ' h' });
  }
  return out;
}
export async function archiverTermines(cfg, s, maintenant = new Date()) {
  const res = [];
  for (const x of chatsAArchiver(cfg, maintenant)) {
    const lu = await s.call('thread/read', { threadId: x.chat, includeTurns: false }).catch(() => null);
    if (lu?.thread?.status?.type === 'active') continue; // en plein tour : au prochain réveil
    try { await rangerChat(cfg, s, x.chat, '99 Archives'); await s.call('thread/archive', { threadId: x.chat });
      inscrireChat(cfg, { chat_id: x.chat, statut: 'archive', archive_le: maintenant.toISOString(), action: 'archivé par le réveil : ' + x.motif }); res.push({ chat: x.chat, titre: x.titre, action: 'archive', motif: x.motif }); }
    catch (e) { res.push({ chat: x.chat, titre: x.titre, action: 'archivage impossible', erreur: e.message }); }
  }
  return res;
}
export function chatsArchives24h(cfg, maintenant = Date.now()) { return Object.values(lireJson(fichierChats(cfg), {})).filter((x) => x.statut === 'archive' && x.archive_le && maintenant - Date.parse(x.archive_le) < 86400000).map((x) => x.titre || x.chat_id); }

// ---------- v2.6.2 : ajouter une issue à une campagne en cours ----------
export function ajouterIssues(cfg, nom, ids = [], { projet = null, criticite = 'standard', bloqueePar = [], milestone = null, motif = '' } = {}) {
  if (cfg.hote === 'local' && (cfg.registre_distant || cfg.atelier_simule)) return appelAtelier(cfg, ['campagne', 'ajouter', nom, ...ids, '--motif', String(motif || ''), '--criticite', criticite, ...(projet ? ['--projet', projet] : []), ...(bloqueePar.length ? ['--bloquee-par', bloqueePar.join(',')] : []), ...(milestone ? ['--milestone', milestone] : [])]);
  const usage = 'usage : pilote.mjs campagne ajouter <campagne> <ID…> --motif "<décision de Paul ou clause du contrat>" [--projet p] [--criticite c] [--bloquee-par ID,ID] [--milestone slug]';
  if (!ids.length) refuser('ISSUE ABSENTE', usage);
  if (motif === true || !net(motif)) refuser('MOTIF ABSENT', 'une issue ajoutée en cours de campagne doit être couverte par une décision ou le contrat. ' + usage);
  if (!CRITICITES.includes(criticite)) refuser('CRITICITÉ INCONNUE', criticite);
  for (const id of [...ids, ...bloqueePar]) if (!RE_ID_ISSUE.test(id)) refuser('IDENTIFIANT INVALIDE', id);
  if (projet && cfg.projets && !cfg.projets[projet]) refuser('PROJET INCONNU', projet);
  const maintenant = new Date().toISOString();
  const r = modifierCampagne(cfg, nom, (c) => {
    if (c.statut === 'close') refuser('CAMPAGNE CLOSE', nom + ' est close : composer une nouvelle campagne');
    const ms = milestone ? c.items.find((it) => it.type === 'milestone' && (it.slug === milestone || it.linear_id === milestone)) : null;
    if (milestone && !ms) refuser('MILESTONE INCONNU', milestone);
    const presentes = new Set(issues(c).map((i) => i.linear_id)); const ajoutees = [], deja = [];
    for (const id of ids) {
      if (presentes.has(id)) { deja.push(id); continue; }
      const i = { linear_id: id, statut: 'en_attente', criticite, branche: 'codex/issue-' + id, sha_valide: null, sha_reprise: null, branche_reprise: null, attempts: 0, modele_courant: null, blocked_by: [...bloqueePar], ...(projet ? { projet } : {}), ajoutee_le: maintenant, ajout_motif: net(motif).slice(0, 300) };
      if (ms) ms.issues.push(i); else c.items.push({ type: 'issue_standalone', ...i }); presentes.add(id); ajoutees.push(id);
    }
    c.maj = maintenant; return { campagne: nom, statut: c.statut, ajoutees, deja_presentes: deja, ...avancement(c) };
  });
  for (const id of r.ajoutees) decision(cfg, nom, id, 'Ajoutée à la campagne en cours (pilote.mjs campagne ajouter' + (milestone ? ', milestone ' + milestone : '') + ') : ' + net(motif) + (bloqueePar.length ? ' ; bloquée par ' + bloqueePar.join(', ') : ''));
  return { ...r, regle: 'admise au prochain réveil selon ses dépendances et les limites d’admission ; la fiche Linear reste la source du contenu' };
}

// ---------- v2.6.5 : relance sur changement, sinon une fois par heure (reveil.relance_sans_changement_min) ----------
export function empreinteReprise(cfg, c) {
  const l = issues(c);
  const parts = l.map((i) => [i.linear_id, i.statut, i.poste || '', i.poste_resultat || '', i.attempts || 0, i.arret?.le || '', i.worktree && ACTIFS_ISSUE.includes(i.statut) && fs.existsSync(i.worktree) ? git(i.worktree, 'rev-parse', 'HEAD').out : '']);
  const j = path.join(dossierCampagnes(cfg), c.id + '.decisions.md'); const taille = fs.existsSync(j) ? fs.statSync(j).size : 0;
  const taches = lireTaches(cfg).filter((t) => t.campagne === c.id).map((t) => t.id + ':' + t.statut);
  return sha256(JSON.stringify([parts, taille, taches, c.statut, !!c.attente_go, peutAdmettre(cfg, c)])).slice(0, 16); // v2.8.1
}
// v2.8.1-2.8.3 : une place libre, l'attente CPU sous la garde et au moins une issue admissible.
export function peutAdmettre(cfg, c) {
  const l = issues(c); const p = cfg.admission?.garde_cpu_pct ?? 40; const cpu = pressionCpu(cfg); const stE = statutsAvecSoeurs(cfg, c);
  return actifsAdmission(l, null, !!c.voie_recette?.chat).length < (cfg.admission?.dev_max || 4) && ouvertesAdmission(l, null, !!c.voie_recette?.chat).length < ouvertesMax(cfg) && (cpu === null || cpu <= p) && l.some((i) => i.statut === 'en_attente' && !i.poste_exclu && admissibilite(cfg, c, i, stE).ok);
}
// Décide d'une reprise pour un orchestrateur au repos : changement d'état → reprise (au plus toutes les intervalleMin) ; sinon une fois par heure.
export function decisionReprise(cfg, c, { maintenant = new Date(), intervalleMin = 10 } = {}) {
  const E = empreinteReprise(cfg, c); const max = cfg.reveil?.relance_sans_changement_min ?? 60;
  const min = (d) => d ? (maintenant - Date.parse(d)) / 60000 : Infinity;
  if (min(c.dernier_reveil) < intervalleMin) return { relancer: false, raison: 'reprise récente', empreinte: E };
  if (c.empreinte_repos === undefined) return { relancer: true, raison: 'première reprise (aucun état mémorisé)', empreinte: E };
  if (c.empreinte_repos === null) return { relancer: false, memoriser: true, raison: 'état mémorisé à la fin du tour', empreinte: E };
  if (E !== c.empreinte_repos) return { relancer: true, raison: 'changement détecté', empreinte: E };
  const repos = c.repos_le ? min(c.repos_le) : min(c.dernier_reveil); // durée de repos depuis la fin du dernier tour
  if (repos >= max) return { relancer: true, raison: 'relance horaire sans changement', empreinte: E };
  const adm = cfg.reveil?.relance_admission_min ?? 20; // v2.8.3 : orchestrateur au repos alors qu'une admission est possible
  if (repos >= adm && peutAdmettre(cfg, c)) return { relancer: true, raison: 'admission possible (place libre, CPU sous la garde, issue admissible) depuis ' + Math.round(repos) + ' min', empreinte: E };
  return { relancer: false, raison: 'aucun changement depuis ' + Math.round(repos) + ' min (relance horaire à ' + max + ' min)', empreinte: E };
}

// ---------- v2.7 : scission d'une campagne, voie de recette dédiée ----------
export function scinderCampagne(cfg, nom, { projets = [], vers = null } = {}) {
  const usage = 'usage : pilote.mjs campagne scinder <campagne> --projet <p>[,<q>] --vers <nouvelle>';
  if (!projets.length || !vers) refuser('ARGUMENT ABSENT', usage);
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(vers)) refuser('NOM INVALIDE', 'kebab-case attendu');
  if (fs.existsSync(fichierCampagne(cfg, vers))) refuser('CAMPAGNE EXISTANTE', vers);
  const le = new Date().toISOString();
  const r = verrou(cfg, () => {
    const c = lireCampagne(cfg, nom); if (c.statut === 'close') refuser('CAMPAGNE CLOSE', nom);
    const proj = (i) => i.projet || c.projet; const garder = [], deplacer = [], mixtes = [];
    for (const it of c.items) { const l = it.type === 'milestone' ? it.issues : [it]; const n = l.filter((i) => projets.includes(proj(i))).length;
      if (!l.length) (projets.includes(it.projet || c.projet) ? deplacer : garder).push(it); else if (n === l.length) deplacer.push(it); else if (!n) garder.push(it); else mixtes.push(it.linear_id || it.slug); }
    if (mixtes.length) refuser('MILESTONE MIXTE', 'milestones à cheval sur plusieurs projets : ' + mixtes.join(', '));
    if (!deplacer.length) refuser('AUCUNE ISSUE', 'aucune issue des projets ' + projets.join(', ') + ' dans ' + nom);
    for (const it of deplacer) for (const i of it.type === 'milestone' ? it.issues : [it]) i.projet ||= c.projet;
    const ids = deplacer.flatMap((it) => it.type === 'milestone' ? [it.linear_id, ...it.issues.map((i) => i.linear_id)] : [it.linear_id]).filter(Boolean);
    const soeursAvant = (c.soeurs || []).filter((x) => x !== vers);
    const n = { id: vers, projet: projets[0], mode: c.mode, statut: c.statut, mandat: c.mandat, hote_execution: c.hote_execution, hote_livraison: c.hote_livraison, contrat_valide: c.contrat_valide, contrat: c.contrat, items: deplacer, lancee_le: le, maj: le, scindee_de: nom, soeurs: [nom, ...soeursAvant] };
    c.items = garder; c.soeurs = [...new Set([...soeursAvant, vers])]; c.transferts = { ...(c.transferts || {}), ...Object.fromEntries(ids.map((x) => [x, vers])) }; c.maj = le;
    ecrireJson(fichierCampagne(cfg, vers), n); ecrireJson(fichierCampagne(cfg, nom), c);
    for (const sn of soeursAvant) { const s = lireJson(fichierCampagne(cfg, sn), null); if (s) { s.soeurs = [...new Set([...(s.soeurs || []), vers])]; ecrireJson(fichierCampagne(cfg, sn), s); } }
    const jA = path.join(dossierCampagnes(cfg), nom + '.decisions.md'); if (fs.existsSync(jA)) fs.copyFileSync(jA, path.join(dossierCampagnes(cfg), vers + '.decisions.md'));
    const taches = []; for (const t of lireTaches(cfg).filter((x) => x.campagne === nom && ids.includes(x.issue))) { t.campagne = vers; (t.historique ||= []).push({ le, action: 'campagne scindée : ' + nom + ' → ' + vers }); ecrireTache(cfg, t); taches.push(t.id); }
    return { campagne: nom, vers, projets, deplacees: ids, restantes: issues(c).length, nouvelle: { ...avancement(n) }, taches_poste: taches };
  });
  const txt = 'Scission (pilote.mjs campagne scinder, v2.7) : les issues des projets ' + projets.join(', ') + ' passent de ' + nom + ' à ' + vers + ' (' + r.deplacees.length + ' identifiants). Campagnes sœurs : dépendances suivies entre elles ; un statut ou une décision visant une issue transférée est redirigé automatiquement.';
  decision(cfg, nom, 'GLOBAL', txt); decision(cfg, vers, 'GLOBAL', txt);
  return { ...r, ensuite: 'ouvrir le chat de ' + vers + ' : node <pilote> chat ' + vers + ' ; voie de recette : node <pilote> campagne voie-recette <campagne>' };
}
function consigneVoie(cfg, c) {
  const P = RACINE + '/scripts/pilote.mjs';
  return 'Tu ne développes rien. Pour chaque issue de a_recetter, dans l’ordre (les premières débloquent le plus d’issues), confie sa recette à un sous-agent (modèle : node ' + P + ' modele tests <criticite> compact ' + c.id + ' --sous-agent, champ catalogue) : matrice de couverture dressée à neuf depuis la fiche Linear, une ligne par critère, scénario et décision, chacune jouée réellement (dispositif /srv/recette, données synthétiques) ; charges lourdes uniquement par node ' + P + ' lourde ' + c.id + ' -- <commande> ; ce qu’atelier ne peut pas jouer part au poste Windows par node ' + P + ' poste deposer ' + c.id + ' <ID> --fiche <f>. Réutilise les preuves valides. Au plus 6 sous-agents. Matrice complète : node ' + P + ' statut ' + c.id + ' <ID> close <matrice.json>. Échec dû au code : node ' + P + ' statut ' + c.id + ' <ID> en_cours puis node ' + P + ' decision ' + c.id + ' <ID> "<lignes ko, cause, preuve>" (l’orchestrateur corrige). Ligne injouable : cadreur de déblocage (node ' + P + ' lancer cadrage deblocage-<ID> --depuis-role AUTO --projet <projet> --nouveau --fiche-stdin), jamais de blocage direct. Ne rends pas la main tant qu’une issue de a_recetter n’a pas d’agent. Interdits : gestionnaire de mots de passe, données réelles, base partagée, déploiement, fusion vers une branche qui déploie. Termine chaque message final par la ligne rendue par node ' + P + ' recettes ' + c.id + ' (champ ligne), seule en dernière ligne. Réponds en français, format compact.';
}
export function recettesVoie(cfg, nom) {
  const c = lireCampagne(cfg, nom); const l = issues(c); const ret = retenues(cfg, c); const stR = statutsAvecSoeurs(cfg, c);
  const x = l.filter((i) => ['recette', 'fusionnee'].includes(i.statut) && !i.poste_exclu && !(i.empile_sur?.length && !i.empile_sur.every((d) => ['close', 'fusionnee'].includes(stR[d])))); const auP = x.filter(auPoste);
  const aR = x.filter((i) => !auPoste(i)).sort((a, b) => (ret[b.linear_id] || 0) - (ret[a.linear_id] || 0));
  const ids = aR.map((i) => i.linear_id); const extrait = ids.slice(0, 4).join(', ') + (ids.length > 4 ? '…' : '');
  const ligne = aR.length ? formatLigne('▶', aR.length + ' issue(s) à recetter (' + extrait + ')' + (auP.length ? ' ; ' + auP.length + ' au poste Windows' : '') + ' ; reprise au prochain réveil') : formatLigne('⏳', auP.length ? 'retour du poste Windows attendu pour ' + auP.map((i) => i.linear_id).join(', ') : 'aucune issue à recetter : l’orchestrateur en passe en recette', 'rien');
  return { campagne: nom, voie: c.voie_recette?.chat || null, a_recetter: aR.map((i) => ({ issue: i.linear_id, statut: i.statut, criticite: i.criticite || 'standard', projet: i.projet || c.projet, worktree: i.worktree || null, branche: i.branche_reprise || i.branche || null, sha: i.sha_reprise || i.sha_valide || null, retient: ret[i.linear_id] || 0, derniere_decision: derniereDecision(cfg, nom, i.linear_id) })), au_poste: auP.map((i) => i.linear_id), consigne: consigneVoie(cfg, c), ligne };
}
export async function creerVoieRecette(cfg, nom) {
  const c = lireCampagne(cfg, nom); if (c.statut !== 'en_cours') refuser('CAMPAGNE NON LANCÉE', nom + ' doit être en_cours');
  if (c.voie_recette?.chat) return { campagne: nom, chat: c.voie_recette.chat, action: 'existe' };
  const r = router(cfg, { tache: 'recette-milestone', criticite: 'standard' }); const t = titre('TEST', c.projet, 'recettes ' + nom);
  const { connecter } = await import('./appserver.mjs'); const s = await connecter(cfg);
  try {
    const e = cfg.execution || {};
    const th = await s.call('thread/start', { model: r.catalogue, cwd: (cfg.projets?.[c.projet] || {}).chemin || cfg.etat, approvalPolicy: e.approvalPolicy || 'never', sandbox: e.sandbox || 'workspace-write' });
    const chat = th.thread.id; await s.call('thread/name/set', { threadId: chat, name: t.titre });
    const carte = ['▣ ' + t.titre, 'Rôle       : voie de recette de la campagne ' + nom + ' (v' + VERSION + ')', 'Chat       : ' + chat, 'Hôte       : ☁ ' + cfg.hote, 'Modèle     : ' + r.modele].join('\n');
    const texte = carte + '\n\nTu es la voie de recette de la campagne ' + nom + ' : tu prends les issues en recette ou fusionnées, tu joues leur recette et tu les clos, en parallèle de l’orchestrateur. Lis ' + RACINE + '/SKILL.md, references/test.md et references/recette-atelier.md, puis : node ' + RACINE + '/scripts/pilote.mjs recettes ' + nom + '.\n' + consigneVoie(cfg, c) + '\n' + regleAcces(cfg, chat);
    const tour = await s.call('turn/start', { threadId: chat, model: r.catalogue, effort: 'medium', ...parametresTour(cfg), input: [{ type: 'text', text: texte }] });
    modifierCampagne(cfg, nom, (cc) => { cc.voie_recette = { chat, modele: r.catalogue, cree_le: new Date().toISOString(), dernier_reveil: new Date().toISOString(), empreinte_repos: null }; });
    inscrireChat(cfg, { chat_id: chat, role: 'TEST', titre: t.titre, dossier: t.dossier, projet: c.projet, objet: 'recettes ' + nom, modele: r.catalogue, effort: 'medium', hote: cfg.hote, campagne: nom, lien: { type: 'campagne', id: nom }, voie_recette: true, statut: 'actif', action: 'voie de recette créée par pilote.mjs' });
    await rangerChat(cfg, s, chat, t.dossier);
    return { campagne: nom, chat, titre: t.titre, modele: r.catalogue, tour: tour.turn?.id };
  } finally { s.fermer(); }
}
export async function reveilVoieRecette(cfg, c, s, { maintenant = new Date(), intervalleMin = 10 } = {}) {
  const v = c.voie_recette; const r = recettesVoie(cfg, c.id); const e = cfg.execution || {};
  const lu = await s.call('thread/read', { threadId: v.chat, includeTurns: false }).catch((x) => ({ erreur: x.message }));
  let etat = lu?.thread?.status?.type || lu?.erreur || 'inconnu';
  if (etat === 'notLoaded') { const rep = await s.call('thread/resume', { threadId: v.chat, model: v.modele, approvalPolicy: e.approvalPolicy || 'never', sandbox: e.sandbox || 'workspace-write' }).catch((x) => ({ erreur: x.message })); etat = rep?.erreur ? 'reprise impossible : ' + rep.erreur : 'idle'; }
  if (etat !== 'idle' || !r.a_recetter.length) return { campagne: c.id, voie: 'recette', chat: etat, action: 'aucune', a_recetter: r.a_recetter.length };
  const dr = decisionReprise(cfg, { ...c, dernier_reveil: v.dernier_reveil, empreinte_repos: v.empreinte_repos, repos_le: v.repos_le }, { maintenant, intervalleMin });
  if (dr.memoriser) modifierCampagne(cfg, c.id, (cc) => { cc.voie_recette.empreinte_repos = dr.empreinte; cc.voie_recette.repos_le = maintenant.toISOString(); });
  if (!dr.relancer) return { campagne: c.id, voie: 'recette', action: 'aucune', raison: dr.raison, a_recetter: r.a_recetter.length };
  const t = await s.call('turn/start', { threadId: v.chat, model: v.modele, effort: 'medium', ...parametresTour(cfg), input: [{ type: 'text', text: 'Reprise de la voie de recette : node ' + RACINE + '/scripts/pilote.mjs recettes ' + c.id + ', puis : ' + r.consigne }] });
  modifierCampagne(cfg, c.id, (cc) => { cc.voie_recette.dernier_reveil = maintenant.toISOString(); cc.voie_recette.empreinte_repos = null; delete cc.voie_recette.repos_le; });
  return { campagne: c.id, voie: 'recette', action: 'reprise', tour: t.turn?.id, raison: dr.raison, a_recetter: r.a_recetter.length };
}

// ---------- v2.8 : admission empilée, chaîne critique, priorité des charges lourdes, poste éveillé sur secteur ----------
export function issuesAvecSoeurs(cfg, c) {
  const out = issues(c).map((i) => ({ ...i, projet: i.projet || c.projet, campagne: c.id }));
  for (const n of c.soeurs || []) { const s = lireJson(fichierCampagne(cfg, n), null); if (s?.items) out.push(...issues(s).map((i) => ({ ...i, projet: i.projet || s.projet, campagne: s.id }))); }
  return out;
}
// Une issue est admissible si ses dépendances sont fusionnées ou closes, ou (empilement) en recette, c'est-à-dire revue favorable.
export function admissibilite(cfg, c, i, stS = statutsAvecSoeurs(cfg, c)) {
  const ouvertes = (i.blocked_by || []).filter((d) => !['fusionnee', 'close'].includes(stS[d]));
  if (!ouvertes.length) return { ok: true, empile: null };
  const max = cfg.admission?.empilement_max ?? 3;
  const pasPretes = ouvertes.filter((d) => stS[d] !== 'recette');
  if (max <= 0 || pasPretes.length) return { ok: false, raison: 'dépendances sans revue favorable (ni en recette, ni fusionnées, ni closes) : ' + (pasPretes.length ? pasPretes : ouvertes).join(', ') };
  const by = Object.fromEntries(issuesAvecSoeurs(cfg, c).map((x) => [x.linear_id, x])); const projet = i.projet || c.projet;
  const memeDepot = ouvertes.filter((d) => by[d] && by[d].projet === projet);
  if (memeDepot.length > 1) return { ok: false, raison: 'plusieurs dépendances du même dépôt en recette (' + memeDepot.join(', ') + ') : une seule branche de base possible' };
  const profondeur = 1 + Math.max(0, ...ouvertes.map((d) => by[d]?.empile_profondeur || 0));
  if (profondeur > max) return { ok: false, raison: 'empilement de profondeur ' + profondeur + ', au-delà de ' + max };
  const base = memeDepot[0] ? by[memeDepot[0]] : null;
  return { ok: true, empile: { sur: ouvertes, base_sur: base?.linear_id || null, branche: base ? (base.branche_reprise || base.branche) : null, profondeur } };
}
export function chaineCritique(cfg, c) {
  const tout = issuesAvecSoeurs(cfg, c).filter((i) => i.statut !== 'close'); const ids = new Set(tout.map((i) => i.linear_id)); const enfants = {};
  for (const i of tout) for (const d of i.blocked_by || []) if (ids.has(d)) (enfants[d] ||= []).push(i.linear_id);
  const memo = {}; const L = (id, pile = new Set()) => { if (memo[id] != null) return memo[id]; if (pile.has(id)) return 0; pile.add(id); const v = 1 + Math.max(0, ...(enfants[id] || []).map((x) => L(x, pile))); pile.delete(id); return (memo[id] = v); };
  let best = null; for (const i of tout) if (best === null || L(i.linear_id) > L(best)) best = i.linear_id;
  const chaine = []; const vus = new Set(); let cur = best;
  while (cur && !vus.has(cur) && chaine.length < 15) { vus.add(cur); chaine.push(cur); cur = [...(enfants[cur] || [])].sort((a, b) => L(b) - L(a))[0]; }
  return chaine.length > 1 ? chaine : [];
}
// La dépendance d'issues empilées repasse en développement : ces issues reviennent en attente, travail conservé.
export function desempilerEnfants(cfg, nom, id, motif) {
  const out = []; const camps = [nom, ...(lireCampagne(cfg, nom).soeurs || [])];
  for (const n of camps) { try { modifierCampagne(cfg, n, (cc) => { for (const it of cc.items) for (const i of it.type === 'milestone' ? it.issues : [it]) {
    if (!(i.empile_sur || []).includes(id) || !ACTIFS_ISSUE.includes(i.statut)) continue;
    const sha = i.worktree && fs.existsSync(i.worktree) ? git(i.worktree, 'rev-parse', 'HEAD').out : '';
    i.statut = 'en_attente'; if (sha) { i.sha_reprise = sha; i.branche_reprise = i.branche; } delete i.empile_sur; delete i.empile_base; delete i.empile_profondeur; out.push({ campagne: n, issue: i.linear_id, sha_reprise: sha || null }); } }); } catch {} }
  for (const x of out) decision(cfg, x.campagne, x.issue, 'Désempilée (v2.8) : ' + motif + ' ; remise en attente, travail conservé' + (x.sha_reprise ? ' (sha_reprise ' + x.sha_reprise.slice(0, 8) + ')' : '') + ', réadmise quand la dépendance repasse en recette.');
  return out;
}
export function desempiler(cfg, nom, id) {
  nom = redirigerCampagne(cfg, nom, id);
  const r = modifierCampagne(cfg, nom, (c) => { const i = trouverIssue(c, id); const avant = i.empile_sur || null; delete i.empile_sur; delete i.empile_base; delete i.empile_profondeur; return { campagne: nom, issue: id, etait_empilee_sur: avant }; });
  decision(cfg, nom, id, 'Désempilée après fusion de ' + (r.etait_empilee_sur || []).join(', ') + ' : branche rebasée sur sa cible, PR rétablie vers la cible.');
  return r;
}
export function prochainLourd(tickets, libre) { const e = tickets.filter((t) => libre(t.campagne)).sort((a, b) => (b.priorite || 0) - (a.priorite || 0) || String(a.depuis).localeCompare(String(b.depuis)) || a.pid - b.pid); return e[0]?.pid ?? null; }
export function decisionVeille(enAttente, sauvegarde) { if (enAttente > 0 && !sauvegarde) return 'desactiver'; if (enAttente === 0 && sauvegarde) return 'restaurer'; return 'rien'; }
// Sur secteur seulement (valeurs AC) : veille et veille prolongée coupées tant que la file du poste n'est pas vide, puis restaurées.
export function garderEveilSecteur(cfg, enAttente) {
  if (process.platform !== 'win32' || cfg.passerelle?.eveil_secteur === false || cfg.atelier_simule || cfg.passerelle?.commande_test) return { action: 'rien', raison: 'non applicable' };
  const f = path.join(cfg.etat, 'poste-veille.json'); const sauv = lireJson(f, null); const a = decisionVeille(enAttente, sauv);
  const lire = (sub) => { const r = spawnSync('powercfg', ['/query', 'SCHEME_CURRENT', 'SUB_SLEEP', sub], { encoding: 'utf8', windowsHide: true }); const m = (r.stdout || '').match(/(?:courant alternatif|AC Power Setting Index)[^:\n]*:\s*(0x[0-9a-f]+)/i); return m ? parseInt(m[1], 16) : null; };
  const regler = (sub, v) => spawnSync('powercfg', ['/setacvalueindex', 'SCHEME_CURRENT', 'SUB_SLEEP', sub, String(v)], { windowsHide: true }).status === 0;
  const activer = () => spawnSync('powercfg', ['/setactive', 'SCHEME_CURRENT'], { windowsHide: true });
  if (a === 'desactiver') { const s = { STANDBYIDLE: lire('STANDBYIDLE'), HIBERNATEIDLE: lire('HIBERNATEIDLE'), le: new Date().toISOString() }; if (s.STANDBYIDLE === null || s.HIBERNATEIDLE === null) return { action: 'rien', raison: 'lecture powercfg impossible' }; ecrireJson(f, s); regler('STANDBYIDLE', 0); regler('HIBERNATEIDLE', 0); activer(); return { action: 'desactiver', sauvegarde: s }; }
  if (a === 'restaurer') { regler('STANDBYIDLE', sauv.STANDBYIDLE); regler('HIBERNATEIDLE', sauv.HIBERNATEIDLE); activer(); fs.rmSync(f, { force: true }); return { action: 'restaurer', valeurs: sauv }; }
  return { action: 'rien', etat: sauv ? 'veille coupée sur secteur' : 'réglage d’origine' };
}

// ---------- v2.8.4 : pas de clôture d'une issue autonome sans fusion dans la branche principale ----------
export function verifierFusion(cfg, c, i, { sansFusion = null } = {}) {
  if (sansFusion && sansFusion !== true && net(sansFusion)) return { verifie: false, motif: net(sansFusion) };
  if (i.milestone || i.nature === 'livrable' || !(i.branche_reprise || i.branche)) return { verifie: false, motif: 'non applicable (milestone, livrable ou sans branche)' };
  const projet = (cfg.projets || {})[i.projet || c.projet]; if (!projet?.chemin || !fs.existsSync(path.join(projet.chemin, '.git'))) return { verifie: false, motif: 'dépôt absent sur cet hôte' };
  const princ = projet.branche_principale || 'main'; const br = i.branche_reprise || i.branche; const id = i.linear_id;
  git(projet.chemin, 'fetch', '-q', 'origin', princ); git(projet.chemin, 'fetch', '-q', 'origin', br);
  const ref = ['origin/' + br, br].find((r) => git(projet.chemin, 'rev-parse', '--verify', '-q', r).code === 0);
  if (ref && git(projet.chemin, 'merge-base', '--is-ancestor', ref, 'origin/' + princ).code === 0) return { verifie: true, branche: br, cible: princ, par: 'historique' };
  if (cfg.gh !== false) { const url = git(projet.chemin, 'remote', 'get-url', 'origin').out; const depot = (url.match(/github\.com[:/](.+?)(\.git)?$/) || [])[1];
    if (depot) { const r = spawnSync('gh', ['pr', 'list', '--repo', depot, '--state', 'merged', '--head', br, '--base', princ, '--json', 'number,mergeCommit'], { encoding: 'utf8', windowsHide: true, timeout: 30000 }); try { const l = JSON.parse(r.stdout || '[]'); if (l.length) return { verifie: true, branche: br, cible: princ, par: 'PR #' + l[0].number + ' fusionnée' }; } catch {} } }
  refuser('CLÔTURE SANS FUSION', id + ' : la branche ' + br + ' n’est pas fusionnée dans ' + princ + ' (' + (ref ? 'absente de son historique' : 'introuvable') + ', aucune PR fusionnée) ; ouvrir la PR vers ' + princ + ', la fusionner, puis clore. Issue sans code livré : --sans-fusion "<motif>".');
}

// ---------- charges lourdes : verrou réel (lourdes_max par campagne) ----------
function pidVivant(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }
export function prendreCreneauLourd(cfg, nom, { attenteMax = 4 * 3600000, pas = 5000, libelle = '', priorite = 0 } = {}) {
  lireCampagne(cfg, nom);
  const max = cfg.admission.lourdes_max || 1; const racine = path.join(cfg.etat, 'lourdes'); const dir = path.join(racine, nom); const fileDir = path.join(racine, '_file');
  fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(fileDir, { recursive: true });
  const debut = Date.now(); let annonce = false;
  const maxHote = cfg.admission.lourdes_max_hote || Infinity, gardeGio = cfg.admission.garde_ram_lourde_gio || 0;
  const vivantsDans = (d) => { let n = 0; for (const f of fs.existsSync(d) ? fs.readdirSync(d) : []) { const o = lireJson(path.join(d, f), {}); if (o.pid && pidVivant(o.pid)) n++; } return n; };
  const occupesHote = () => (fs.existsSync(racine) ? fs.readdirSync(racine) : []).filter((d) => d !== '_file').reduce((n, d) => n + vivantsDans(path.join(racine, d)), 0);
  const ramLibreGio = () => { try { const m = fs.readFileSync('/proc/meminfo', 'utf8').match(/MemAvailable:\s+(\d+)/); if (m) return Number(m[1]) / 1048576; } catch {} return os.freemem() / 2 ** 30; };
  const ticket = path.join(fileDir, process.pid + '.json'); ecrireJson(ticket, { pid: process.pid, campagne: nom, priorite, depuis: new Date().toISOString(), libelle }); // v2.8 : file par priorité
  const tickets = () => fs.readdirSync(fileDir).map((f) => { const o = lireJson(path.join(fileDir, f), null); if (!o?.pid || !pidVivant(o.pid)) { fs.rmSync(path.join(fileDir, f), { force: true }); return null; } return o; }).filter(Boolean);
  try {
    for (;;) {
      const hoteOk = occupesHote() < maxHote && ramLibreGio() >= gardeGio;
      const monTour = hoteOk && prochainLourd(tickets(), (camp) => vivantsDans(path.join(racine, camp)) < max) === process.pid;
      for (let k = 1; monTour && k <= max; k++) {
        const f = path.join(dir, k + '.lock');
        try { const fd = fs.openSync(f, 'wx'); fs.writeSync(fd, JSON.stringify({ pid: process.pid, libelle, priorite, depuis: new Date().toISOString() })); fs.closeSync(fd); return f; }
        catch (e) { if (e.code !== 'EEXIST') throw e; const o = lireJson(f, {}); if (!o.pid || !pidVivant(o.pid)) fs.rmSync(f, { force: true }); }
      }
      if (Date.now() - debut > attenteMax) refuser('CRÉNEAU LOURD INDISPONIBLE', 'attente de plus de ' + Math.round(attenteMax / 60000) + ' min pour ' + nom, 5);
      if (!annonce) { process.stderr.write('Charge lourde en file (priorité ' + priorite + ') : créneaux occupés pour ' + nom + ', attente…\n'); annonce = true; }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, pas);
    }
  } finally { fs.rmSync(ticket, { force: true }); }
}
export function lourde(cfg, nom, commande, options = {}) {
  if (!commande.length) refuser('COMMANDE ABSENTE', 'usage : pilote.mjs lourde <campagne> [--issue <ID>] -- <commande> [arguments]');
  let priorite = 0; if (options.issue) { nom = redirigerCampagne(cfg, nom, options.issue); try { const c = lireCampagne(cfg, nom); priorite = (retenues(cfg, c)[options.issue] || 0) + (chaineCritique(cfg, c).includes(options.issue) ? 1000 : 0); } catch {} }
  const verrou = prendreCreneauLourd(cfg, nom, { ...options, priorite, libelle: commande.join(' ').slice(0, 200) });
  try { const r = spawnSync(commande[0], commande.slice(1), { stdio: 'inherit', shell: process.platform === 'win32' && !path.isAbsolute(commande[0]), windowsHide: true }); return { campagne: nom, commande: commande.join(' '), code: r.status ?? 1, priorite }; }
  finally { fs.rmSync(verrou, { force: true }); }
}


// ---------- contrats par commande $dev ----------
export const COMMANDES = {
  'campagne composer': ['campagne.md', 'inline'], 'campagne ajouter': ['campagne.md', 'inline'], desempiler: ['campagne.md', 'inline'], 'campagne scinder': ['campagne.md', 'inline'], 'campagne voie-recette': ['test.md', 'TEST'], recettes: ['test.md', 'TEST'], point: ['point.md', 'inline'], 'campagne lancer': ['campagne.md', 'AUTO/SUP'], milestone: ['execution.md', 'MS'], issue: ['issue.md', 'DEV'],
  iteration: ['iteration.md', 'DEV'], finaliser: ['finalisation.md', 'inline'], cadrage: ['cadrage.md', 'CADRE'], 'cadrage-court': ['cadrage-court.md', 'inline'],
  projet: ['projet.md', 'inline'], digest: ['campagne.md', 'inline'], prototype: ['prototype.md', 'PROTO'], test: ['test.md', 'inline ou TEST'],
  nettoyeur: ['nettoyeur.md', 'RELAIS'], aide: ['aide.md', 'AIDE'], menage: ['menage.md', 'inline'], lancer: ['lanceur.md', 'inline'], livrer: ['livraison.md', 'SUP'], cloture: ['cloture.md', 'BILAN'], pause: ['campagne.md', 'inline'], reprendre: ['campagne.md', 'inline'], etat: [null, 'inline'], modele: ['modeles.md', 'inline'],
  archi: ['archi.md', 'ARCHI'], evolution: ['archi.md', 'ARCHI'], poste: ['poste.md', 'inline'],
};
export function contrat(commande) {
  if (commande === 'img2code') refuser('COMMANDE NON REPRISE', 'img2code reste dans l’archive');
  const c = COMMANDES[commande]; if (!c) refuser('COMMANDE INCONNUE', commande);
  const ref = c[0] && path.join(RACINE, 'references', c[0]);
  return { commande: '$dev ' + commande, reference: ref, existe: ref ? fs.existsSync(ref) : true, chat: c[1] };
}
export function etat(cfg, nom) {
  const libre = os.freemem() / 2 ** 30; let disque = null;
  try { const s = fs.statfsSync(cfg.etat); disque = Math.round((s.bavail * s.bsize) / 2 ** 30 * 100) / 100; } catch {}
  const base = { pilote: cfg.pilote || null, pilote_existe: !!cfg.pilote && fs.existsSync(cfg.pilote), hote: cfg.hote, deploiement_serveurs: !!cfg.deploiement_serveurs, ram_libre_gio: Math.round(libre * 100) / 100, disque_etat_libre_gio: disque, garde_disque_gio: cfg.garde_disque_gio || null, sous_agents: cfg.modeles.sous_agents || [], admission: cfg.admission, chat_local: chatLocalDisponible(cfg) ? 'disponible' : 'indisponible : ' + MESSAGE_CHAT_LOCAL, taches_planifiees: etatTaches(cfg), pression_cpu_60s: pressionCpu(cfg), garde_cpu_pct: cfg.admission?.garde_cpu_pct ?? 40, passerelle: (() => { try { return posteFile(cfg); } catch (e) { return { erreur: e.message }; } })() };
  if (nom) return { ...base, campagne: contexte(cfg, nom) };
  return { ...base, campagnes: listerCampagnes(cfg).map((c) => ({ id: c.id, statut: c.statut, mode: c.mode, ...avancement(c), titre: titreCampagne(c).titre })) };
}

// ---------- chat d'aiguillage ❓ AIDE (aide.md) ----------
export const TITRE_AIDE = '❓ AIDE · workflow';
const DOSSIER_AIDE = '00 Accueil';
const fichierAide = (cfg) => path.join(cfg.etat, 'aide.json');
function cheminSkill(cfg) { const f = cfg.skill_md || path.join(RACINE, 'SKILL.md'); return path.isAbsolute(f) ? f : path.join(cfg.etat, f); }
export function empreinteSkill(cfg) { return createHash('sha256').update(fs.readFileSync(cheminSkill(cfg))).digest('hex').slice(0, 16); }
const dateParis = (d) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }).format(d);
export function premierMessageAide(cfg, modele) {
  return ['▣ ❓ AIDE — workflow', 'Rôle    : aiguilleur et lanceur du workflow $dev v' + VERSION, 'Modèle  : ' + modele + '  ·  Hôte : 💻 local',
    'Lit     : ' + cheminSkill(cfg) + ' et ' + path.join(RACINE, 'references', 'modeles.md') + ', uniquement', '', 'Règles :',
    'Rôles  : aiguilleur et lanceur (porte d\'entrée du workflow $dev v' + VERSION + ').',
    '- Je ne fais aucun travail moi-même : ni cadrage, ni code, ni écriture dans Linear, ni modification de fichier.',
    '- Commande $dev tapée ici : je rédige une fiche de lancement de 15 lignes au plus (la demande mot pour mot, l\'essentiel de ce qui précède, les issues, fichiers et liens cités), puis j\'exécute uniquement :',
    '  node ' + (cfg.pilote || path.join(RACINE, 'scripts', 'pilote.mjs')) + ' lancer <commande> <arguments> --depuis-modele ' + (cfg.modeles.aide || 'gpt-6-luna') + ' --fiche-stdin',
    '  et je réponds par sa ligne « → ouvert : … », ou par la question unique qu\'il renvoie, ou par les 5 lignes du sous-agent.',
    '- À chaque question, je réponds en 3 lignes maximum :', '  1. le chat à utiliser (pastille, titre ou dossier) ;', '  2. la commande à taper ;', '  3. pourquoi.',
    '- Si une question révèle un manque ou une contradiction dans le workflow, je le signale', '  en une ligne commençant par « ⚠ Workflow : ».',
    '- Une question ou une demande d\'évolution du workflow lui-même va vers 🏛 ARCHI · workflow :', '  je lance $dev evolution <sujet> (ou $dev archi) par le lanceur, qui rouvre ce chat sans doublon.',
    '- « Où en sont mes chats ? » : je lis le dernier message des chats locaux (read_thread), puis je passe [{ id, titre, dernier_message }] sur l\'entrée standard de node ' + (cfg.pilote || path.join(RACINE, 'scripts', 'pilote.mjs')) + ' etat chats --chats-stdin (aucun fichier écrit) ; je recopie le tableau.',
    '- $dev point [campagne…], ou « où en sont les campagnes, qu\'est-ce qui bloque, combien de temps reste-t-il ? » : seule commande que j\'exécute moi-même, car elle n\'écrit rien : node ' + (cfg.pilote || path.join(RACINE, 'scripts', 'pilote.mjs')) + ' point [campagne…] --texte ; je recopie sa sortie telle quelle, sans rien ajouter ni retirer.', '- ' + REGLE_LIGNE_ETAT,
    '- Si la réponse n\'est pas dans SKILL.md, je le dis au lieu d\'inventer.'].join('\n');
}
function modeleAide(cfg, indisponibles = []) {
  const voulu = cfg.modeles.aide || 'gpt-6-luna'; const secours = 'claude-haiku-5-5';
  const m = indisponibles.includes(voulu) ? secours : voulu;
  if (indisponibles.includes(m)) refuser('MODÈLE INDISPONIBLE', 'ni ' + voulu + ' ni ' + secours + ' pour le chat AIDE');
  return { modele: m, catalogue: catalogue(cfg, m), signalement: m !== voulu ? voulu + ' indisponible : chat AIDE créé sur ' + secours : null };
}
// Décide de l'action ; l'agent l'applique avec les outils de l'application (ou à la main) puis appelle "aide enregistrer".
export function aide(cfg, { chats = [], recreer = false, indisponibles = [] } = {}) {
  const reg = lireJson(fichierAide(cfg), null); const empreinte = empreinteSkill(cfg);
  const titres = chats.filter((c) => (c.titre ?? c.title) === TITRE_AIDE);
  const actifs = titres.filter((c) => !c.archive && !c.archived).sort((a, b) => String(b.maj || b.updatedAt || '').localeCompare(String(a.maj || a.updatedAt || '')));
  const signalements = []; let archiver = [];
  if (actifs.length > 1) { archiver = actifs.slice(1).map((c) => c.id); signalements.push(actifs.length + ' chats « ' + TITRE_AIDE + ' » : le plus récent est gardé, ' + archiver.length + ' archivé(s)'); }
  const garde = actifs[0]; let action, raison;
  if (recreer) { action = 'creer'; raison = 'recréation demandée'; if (garde) archiver.unshift(garde.id); }
  else if (!garde) { action = 'creer'; raison = reg && titres.some((c) => c.id === reg.chat_id) ? 'archivé' : 'absent'; }
  else if (!reg || reg.chat_id !== garde.id) { action = 'creer'; raison = 'non enregistré'; archiver.unshift(garde.id); }
  else if (reg.skill_hash !== empreinte) { action = 'maj'; raison = 'SKILL.md modifié'; }
  else { action = 'ouvrir'; raison = 'à jour'; }
  const sortie = { action, raison, chat_id: action === 'creer' ? null : garde.id, archiver, archiver_dans: '99 Archives', signalements, registre: fichierAide(cfg), skill_hash: empreinte };
  if (action === 'maj') sortie.message = 'ℹ SKILL.md mis à jour le ' + dateParis(fs.statSync(cheminSkill(cfg)).mtime) + ' : relis-le avant de répondre';
  if (action === 'creer') {
    const m = modeleAide(cfg, indisponibles); if (m.signalement) signalements.push(m.signalement);
    sortie.creation = { titre: TITRE_AIDE, dossier: DOSSIER_AIDE, avant_dossier: '01 Campagnes', position: 'en tête du dossier', modele: m.modele, modele_catalogue: m.catalogue, hote: 'local', premier_message: premierMessageAide(cfg, m.modele) };
  }
  sortie.ensuite = action === 'ouvrir' ? 'ouvrir le chat, sans rien poster' : action === 'maj' ? 'poster le message dans le chat, puis : pilote.mjs aide enregistrer ' + garde.id + ', puis ouvrir le chat' : 'archiver les chats listés, créer le chat (creation), le ranger, puis : pilote.mjs aide enregistrer <id> --modele ' + sortie.creation.modele + ', puis ouvrir le chat';
  return sortie;
}
export function enregistrerAide(cfg, id, modele) {
  if (!id) refuser('CHAT ABSENT', 'usage : pilote.mjs aide enregistrer <chat_id> [--modele <modèle>]');
  const ancien = lireJson(fichierAide(cfg), {}); const meme = ancien.chat_id === id;
  const reg = { chat_id: id, titre: TITRE_AIDE, dossier: DOSSIER_AIDE, modele: modele || (meme && ancien.modele) || cfg.modeles.aide || 'gpt-6-luna', cree_le: meme && ancien.cree_le ? ancien.cree_le : new Date().toISOString(), skill_hash: empreinteSkill(cfg) };
  ecrireJson(fichierAide(cfg), reg);
  inscrireChat(cfg, { chat_id: id, role: 'AIDE', titre: TITRE_AIDE, objet: 'workflow', projet: 'workflow', dossier: DOSSIER_AIDE, modele: reg.modele, hote: 'local', lien: { type: 'sujet', id: 'workflow' }, statut: 'actif', action: 'chat AIDE enregistré' });
  return reg;
}
// $dev nettoyeur : chats ✅ de plus de 7 jours vers 99 Archives ; le chat AIDE n'est jamais archivé.
export function candidatsNettoyeur(cfg, chats, { maintenant = new Date(), jours = 7 } = {}) {
  const reg = lireJson(fichierAide(cfg), {});
  return chats.filter((c) => { const t = c.titre ?? c.title ?? ''; const m = Date.parse(c.maj || c.updatedAt || 0);
    return !c.archive && t !== TITRE_AIDE && c.id !== reg.chat_id && /✅\s*$/.test(t) && maintenant - m > jours * 86400000; }).map((c) => c.id);
    // (le chat 🏛 ARCHI ne porte jamais ✅ : il n'est donc jamais candidat)
}


// ---------- v2.5 : ligne d'état des chats (SKILL.md §2.3 bis) ----------
export const ETATS_LIGNE = { '▶': 'EN COURS', '⏳': 'EN ATTENTE', '⏸': 'À TOI', '⛔': 'BLOQUÉ', '✅': 'TERMINÉ' };
const STATUT_PAR_LIGNE = { 'EN COURS': 'actif', 'EN ATTENTE': 'actif', 'À TOI': 'attente_go', 'BLOQUÉ': 'bloque', 'TERMINÉ': 'clos' };
const SUFFIXE_PAR_LIGNE = { 'À TOI': '⏸ GO', 'BLOQUÉ': '⛔ BLOQUÉ', 'TERMINÉ': '✅' };
export const REGLE_LIGNE_ETAT = 'Ligne d’état : termine CHAQUE message final par une ligne seule, la dernière, au format exact « <icône> <ÉTAT> · <ce que tu fais ou attends, en une phrase> · Toi : <rien | action exacte pour Paul> », avec un seul de ces états : ▶ EN COURS (tu travailles, ou tes sous-agents, avec reprise automatique prévue), ⏳ EN ATTENTE (poste, créneau, dépendance, réveil), ⏸ À TOI (un des 3 motifs d’interruption), ⛔ BLOQUÉ, ✅ TERMINÉ.';
const net = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
export function formatLigne(icone, quoi, toi = 'rien') { if (!ETATS_LIGNE[icone]) refuser('ÉTAT INCONNU', icone); return icone + ' ' + ETATS_LIGNE[icone] + ' · ' + net(quoi) + ' · Toi : ' + net(toi || 'rien'); }
const RE_LIGNE = /^(▶|⏳|⏸|⛔|✅)\uFE0F?\s+(EN COURS|EN ATTENTE|À TOI|BLOQUÉ|TERMINÉ)\s+·\s+(.+?)\s+·\s+Toi\s*:\s*(.+)$/u;
export function lireLigneEtat(texte) {
  const l = String(texte || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean).at(-1) || '';
  const m = l.replace(/^[>*_\x60\s]+|[*_\x60\s]+$/g, '').match(RE_LIGNE);
  return m ? { icone: m[1], etat: m[2], quoi: m[3], toi: m[4], ligne: m[0], statut: STATUT_PAR_LIGNE[m[2]], suffixe: SUFFIXE_PAR_LIGNE[m[2]] || null } : null;
}
const ACTIFS_ISSUE = ['preflight', 'en_cours', 'revue', 'recette'];
export const auPoste = (i) => ['en_file', 'en_cours'].includes(i.poste);
// Admission : une issue qui attend le poste Windows ne compte pas dans dev_max (v2.5).
export const ouvertesAdmission = (l, sauf = null, voie = false) => l.filter((x) => ACTIFS_ISSUE.includes(x.statut) && !auPoste(x) && x.linear_id !== sauf && !(voie && x.statut === 'recette')); // v2.7 : la voie de recette porte ses issues
export const ATTENTES_EXTERIEURES = ['paul', 'poste', 'env'];
export const attendDehors = (i) => ATTENTES_EXTERIEURES.includes(i.arret?.attend); // v2.9
// v2.9 : une issue qui attend Paul, le poste ou l'environnement libère sa place ; ouvertes_max (2 × dev_max) borne le total ouvert.
export const actifsAdmission = (l, sauf = null, voie = false) => ouvertesAdmission(l, sauf, voie).filter((x) => !attendDehors(x));
export const ouvertesMax = (cfg) => cfg.admission?.ouvertes_max || 2 * (cfg.admission?.dev_max || 4);
export function ligneEtat(cfg, nom) {
  const c = lireCampagne(cfg, nom); const l = issues(c); const st = statutsAvecSoeurs(cfg, c);
  const liste = (x, f = (i) => i.linear_id) => x.slice(0, 4).map(f).join(', ') + (x.length > 4 ? '…' : '');
  const exclus = l.filter((i) => i.poste_exclu && i.statut !== 'close'); const travail = actifsAdmission(l).filter((i) => i.poste !== 'retour' && !i.poste_exclu); const dehors = ouvertesAdmission(l).filter((i) => attendDehors(i) && i.poste !== 'retour' && !i.poste_exclu); const pourPaul = l.filter((i) => i.statut !== 'close' && i.arret?.attend === 'paul'); /* v2.9 */ const poste = l.filter(auPoste); const retours = l.filter((i) => i.poste === 'retour');
  const bloquees = l.filter((i) => i.statut === 'bloquee'); const attente = l.filter((i) => i.statut === 'en_attente' && !i.poste_exclu);
  const stE = new Proxy(st, { get: (o, k) => o[k] ?? 'close' }); const eligibles = attente.filter((i) => admissibilite(cfg, c, i, stE).ok); // v2.8 : admission empilée comprise
  const noteBloq = bloquees.length ? ' ; ⛔ ' + bloquees.length + ' bloquée(s) : ' + liste(bloquees) : '';
  const debloquer = l.filter((i) => aDebloquerPoste(cfg, i));
  const toiParts = [...(exclus.length ? ['à faire par toi : ' + exclus.slice(0, 2).map((i) => i.linear_id + ' (' + i.poste_exclu + ')').join(', ')] : []), ...(debloquer.length ? ['débloquer le poste pour ' + debloquer.slice(0, 2).map((i) => i.linear_id + ' (' + (i.poste_env_cause || 'voir le retour') + ')').join(', ')] : []), ...(pourPaul.length ? ['décider pour ' + pourPaul.slice(0, 3).map((i) => i.linear_id + ' (' + net(i.arret.quoi).slice(0, 90) + ')').join(', ') + (pourPaul.length > 3 ? '…' : '')] : [])]; // v2.9 : ligne d'état honnête
  const toiPaul = toiParts.length ? toiParts.join(' ; ') : 'rien';
  const vu = lireJson(path.join(cfg.etat, 'poste', 'vu.json'), null); const posteOccupe = lireTaches(cfg).some((t) => t.statut === 'en_cours'); const posteAbsent = !posteOccupe && (!vu || Date.now() - Date.parse(vu.le) > 3600000);
  let ligne;
  if (c.statut === 'close') ligne = formatLigne('✅', 'campagne close (' + avancement(c).closes + '/' + l.length + ' issues closes)');
  else if (c.statut === 'brouillon') ligne = formatLigne('⏳', 'campagne en brouillon, aucun agent lancé', 'valider le contrat, puis $dev campagne lancer ' + nom);
  else if (c.statut === 'en_pause') ligne = formatLigne('⏳', 'campagne en pause', '$dev reprendre ' + nom + ' quand tu veux');
  else if (c.livraison_echec) ligne = formatLigne('⛔', 'livraison arrêtée : ' + String(c.livraison_echec.message || '').split('\n')[0], 'lire le journal de livraison, puis décider');
  else if (c.attente_go) ligne = formatLigne('⏸', 'GO attendu avant la livraison', c.hote_livraison === 'local' ? 'donner ton GO, puis $dev livrer ' + nom + ' depuis le poste' : 'donner ton GO dans ce chat');
  else if (l.length && bloquees.length && l.every((i) => ['close', 'bloquee'].includes(i.statut))) ligne = formatLigne('⛔', 'toutes les issues restantes sont bloquées : ' + liste(bloquees), 'reprendre une issue dans son chat 🔵 DEV');
  else if (travail.length || retours.length || dehors.length) {
    const parts = []; if (travail.length) parts.push(travail.length + ' issue(s) en travail (' + liste(travail, (i) => i.linear_id + ' ' + i.statut) + ')');
    if (dehors.length) parts.push(dehors.length + ' en attente hors agents (' + liste(dehors, (i) => i.linear_id + ' : ' + ATTENTES[i.arret.attend]) + ')');
    if (retours.length) parts.push('retours du poste à vérifier : ' + liste(retours)); if (poste.length) parts.push(poste.length + ' au poste Windows (' + liste(poste) + ')');
    ligne = formatLigne(travail.length || retours.length ? '▶' : pourPaul.length ? '⏸' : '⏳', parts.join(' ; ') + noteBloq + ' ; reprise automatique au prochain réveil', toiPaul);
  } else if (poste.length) ligne = formatLigne('⏳', 'retour du poste Windows attendu pour ' + liste(poste) + noteBloq, posteAbsent ? 'ouvrir ta session sur le poste pour que la passerelle relève la file' : toiPaul);
  else if (eligibles.length) ligne = formatLigne('▶', 'admission de ' + liste(eligibles) + ' au prochain réveil' + noteBloq, toiPaul);
  else if (attente.length) ligne = formatLigne('⏳', attente.length + ' issue(s) attendent leurs dépendances' + noteBloq, bloquees.length ? 'reprendre les issues bloquées pour débloquer la suite' : toiPaul);
  else if (exclus.length) ligne = formatLigne('⏸', 'il ne reste que ta part : ' + liste(exclus) + noteBloq, toiPaul);
  else ligne = formatLigne('✅', 'toutes les issues sont closes', '$dev cloture ' + nom);
  return { campagne: nom, ligne };
}

// ---------- v2.6 : $dev point (references/point.md) ----------
export const ATTENTES = { paul: 'Toi', agents: 'agents', poste: 'poste', env: 'environnement' };
const STATUTS_ARRET = ['bloquee', 'revue', 'recette', 'en_attente', 'fusionnee', 'preflight', 'en_cours'];
function verifierArret(statut, attend, quoi) {
  if (!ATTENTES[attend]) refuser('ATTENTE INCONNUE', String(attend) + ' (liste fermée : ' + Object.keys(ATTENTES).join(', ') + ')');
  if (!net(quoi) || quoi === true) refuser('CAUSE ABSENTE', 'usage : --attend ' + attend + ' --quoi "<cause courte ; pour Paul, l\'action exacte et la réponse proposée>"');
  if (statut && !STATUTS_ARRET.includes(statut)) refuser('STATUT SANS ARRÊT', statut + ' : --attend s\'emploie avec ' + STATUTS_ARRET.join(', '));
}
// Qualifie un arrêt sans changer le statut (ni solder un retour du poste).
export function qualifierArret(cfg, nom, id, { attend, quoi, lever = false, irreversible = null } = {}) {
  return modifierCampagne(cfg, nom, (c) => { const i = trouverIssue(c, id);
    if (lever) { delete i.arret; return { campagne: nom, issue: id, statut: i.statut, arret: null }; }
    verifierArret(i.statut, attend, quoi); if (attend === 'paul') verifierCadreur(cfg, nom, id, irreversible); i.arret = { attend, quoi: net(quoi).slice(0, 240), le: new Date().toISOString(), ...(attend === 'paul' && irreversible && irreversible !== true ? { irreversible: net(irreversible).slice(0, 160) } : {}) };
    return { campagne: nom, issue: id, statut: i.statut, arret: i.arret }; });
}
// v2.9 : pas d'attente de Paul sans conclusion d'un cadreur de déblocage au journal (sauf action irréversible ou root)
export function conclusionCadreur(cfg, nom, id) {
  const f = path.join(dossierCampagnes(cfg), nom + '.decisions.md'); if (!fs.existsSync(f)) return null;
  const textes = fs.readFileSync(f, 'utf8').split('\n').filter((x) => x.includes(' · ' + id + ' · ')).map((x) => x.slice(2).replace(/^\S+ · \S+ · /, ''));
  return textes.filter((t) => /^(conclusion du cadreur|cadreur de déblocage)/i.test(t) && !/\b(ouvert|lancé|ouverture)\b/i.test(t.slice(0, 90))).at(-1) || null;
}
function verifierCadreur(cfg, nom, id, irreversible) {
  if (irreversible && irreversible !== true && net(irreversible)) return;
  if (!conclusionCadreur(cfg, nom, id)) refuser('CADREUR REQUIS', id + ' : avant d’attendre Paul, ouvre un cadreur de déblocage (pilote.mjs lancer cadrage deblocage-' + id + ' --depuis-role AUTO --projet <projet> --nouveau --fiche-stdin) et attends sa conclusion au journal (« Conclusion du cadreur : … ») ; l’issue reste en_attente --attend agents pendant le cadrage. Motif réservé à Paul d’emblée (action irréversible ou root, secret à fournir, hors mandat) : --reserve "<motif>".');
}
// v2.9 : le réveil lance lui-même les cadreurs quand la campagne n'a pas bougé depuis reveil.cadreur_apres_min (120 min).
export async function cadreursAuto(cfg, c, { maintenant = new Date(), lanceur = lancerCommande } = {}) {
  const E = empreinteReprise(cfg, c); const apres = cfg.reveil?.cadreur_apres_min ?? 120; const max = cfg.reveil?.cadreurs_max ?? 3;
  if (c.immobile?.e !== E) { modifierCampagne(cfg, c.id, (cc) => { cc.immobile = { e: E, depuis: maintenant.toISOString() }; }); return null; }
  const immobileMin = (maintenant - Date.parse(c.immobile.depuis)) / 60000; if (immobileMin < apres) return null;
  const l = issues(c); const ret = retenues(cfg, c); const conclu = (i) => !!conclusionCadreur(cfg, c.id, i.linear_id);
  const enCours = l.filter((i) => i.statut !== 'close' && i.cadreur && maintenant - Date.parse(i.cadreur.le) < 6 * 3600000 && !conclusionCadreur(cfg, c.id, i.linear_id)).length;
  const cible = (i) => { if (i.statut === 'close' || auPoste(i) || i.poste_exclu || i.arret?.irreversible || ['poste', 'agents'].includes(i.arret?.attend)) return false;
    if (i.cadreur && Date.parse(i.cadreur.le) >= Date.parse(c.immobile.depuis)) return false;
    if (i.arret?.attend === 'paul' && conclu(i)) return false; // attend vraiment Paul, après cadrage
    return ACTIFS_ISSUE.includes(i.statut) || i.statut === 'bloquee' || ['paul', 'env'].includes(i.arret?.attend); };
  const choix = l.filter(cible).sort((a, b) => (ret[b.linear_id] || 0) - (ret[a.linear_id] || 0)).slice(0, Math.max(0, max - enCours));
  if (!choix.length) return null;
  const lances = [];
  for (const i of choix) { const id = i.linear_id;
    const fiche = ['Cadreur de déblocage lancé par le réveil (v2.9) : la campagne ' + c.id + ' n’a pas bougé depuis ' + Math.round(immobileMin) + ' min.', 'Issue : ' + id + ' (' + (i.titre || '') + '), statut ' + i.statut + (i.arret ? ', arrêt ' + i.arret.attend + ' : ' + i.arret.quoi : '') + '.', 'Dernière ligne au journal : ' + (derniereDecision(cfg, c.id, id) || 'aucune') + '.', 'Contexte : node ' + RACINE + '/scripts/pilote.mjs contexte ' + c.id + ' ; journal ' + path.join(dossierCampagnes(cfg), c.id + '.decisions.md') + '.', 'Mandat de Paul (20/11) : tu décides par défaut (« à confirmer »), tu publies au besoin une issue corrective (pilote.mjs campagne ajouter).', 'Conclusion obligatoire : node ' + RACINE + '/scripts/pilote.mjs decision ' + c.id + ' ' + id + ' "Conclusion du cadreur : <décision et suite> ; réservé à Paul : oui|non".', 'Réservé à Paul seulement pour une action irréversible, root ou hors mandat, avec la réponse proposée.'].join('\n');
    try { const r = await lanceur(cfg, { commande: 'cadrage', args: ['deblocage-' + id], depuisRole: 'AUTO', projet: i.projet || c.projet, nouveau: true, fiche });
      const chat = r.chat || r.registre || null; modifierCampagne(cfg, c.id, (cc) => { trouverIssue(cc, id).cadreur = { le: maintenant.toISOString(), chat, action: r.action }; });
      decision(cfg, c.id, id, 'Cadreur de déblocage lancé par le réveil (v2.9) : campagne immobile depuis ' + Math.round(immobileMin) + ' min ; ' + (r.action === 'ouvrir' ? 'cadreur déjà ouvert ' : 'chat ') + (chat || r.action) + '.'); lances.push({ issue: id, action: r.action, chat });
    } catch (e) { lances.push({ issue: id, erreur: e.message }); } }
  return { campagne: c.id, action: 'cadreurs de déblocage (v2.9)', immobile_min: Math.round(immobileMin), lances };
}
function derniereDecision(cfg, nom, id) {
  const f = path.join(dossierCampagnes(cfg), nom + '.decisions.md'); if (!fs.existsSync(f)) return null;
  const l = fs.readFileSync(f, 'utf8').split('\n').filter((x) => x.includes(' · ' + id + ' · ')).at(-1);
  return l ? l.slice(2).replace(/^\S+ · \S+ · /, '').slice(0, 220) : null;
}
const mediane = (v) => { const s = [...v].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const demiHeure = (h) => Math.max(0.5, Math.round(h * 2) / 2);
export function estimerReste(cfg, c, l, attentePaul, maintenant = Date.now()) {
  const durees = l.filter((i) => i.admise_le && i.close_le).map((i) => (Date.parse(i.close_le) - Date.parse(i.admise_le)) / 3600000).filter((h) => h > 0);
  const closes = l.filter((i) => i.statut === 'close' && i.close_le).length;
  const depuis = c.lancee_le ? Math.max(1, (maintenant - Date.parse(c.lancee_le)) / 3600000) : null;
  const places = Math.max(1, Math.min(cfg.admission?.dev_max || 4, actifsAdmission(l).length || 1));
  let parIssue = null, base;
  if (durees.length >= 5) { parIssue = mediane(durees) / places; base = 'durée médiane de ' + durees.length + ' issues mesurées, ' + places + ' place(s) occupée(s)'; }
  else if (closes && depuis) { parIssue = depuis / closes; base = 'rythme de la campagne : ' + closes + ' clôture(s) en ' + Math.round(depuis) + ' h'; }
  else base = 'aucune clôture mesurée';
  const mesures = durees.length >= 5 ? durees.length : closes;
  const reste = l.filter((i) => i.statut !== 'close'); const sansToi = reste.filter((i) => !attentePaul.has(i.linear_id));
  const fourchette = (n) => !n ? [0, 0] : parIssue === null ? null : [demiHeure(n * parIssue * 0.75), demiHeure(n * parIssue * 1.5)];
  return { unite: 'heures de travail des agents', si_actions_faites: fourchette(reste.length), sinon: fourchette(sansToi.length), plafond_sans_toi: (l.length - reste.length) + sansToi.length, fiabilite: mesures < 5 ? 'faible' : mesures < 15 ? 'moyenne' : 'bonne', base };
}
const h = (f) => !f ? 'non mesurable' : f[1] === 0 ? '0 h' : f[0] === f[1] ? f[0] + ' h' : f[0] + ' à ' + f[1] + ' h';
export function rendrePoint(p) {
  const L = ['**Campagnes**', '', '| Campagne | Avancement | Clôtures 24 h | Reste | Temps restant (heures de travail des agents) |', '|---|---|---|---|---|'];
  for (const c of p.campagnes) { const e = c.estimation; const sinon = e.plafond_sans_toi < c.total ? ' ; sans tes actions : ' + h(e.sinon) + ', plafond ' + e.plafond_sans_toi + '/' + c.total : '';
    L.push('| ' + c.campagne + ' (' + ({ auto: 'AUTO', supervise: 'SUP' }[c.mode] || String(c.mode || '').toUpperCase()) + ') | ' + c.closes + '/' + c.total + ' (' + c.pourcent + ' %) | ' + c.closes_24h + ' | ' + c.reste + ' | ' + h(e.si_actions_faites) + sinon + (e.fiabilite === 'faible' ? ' · estimation faible' : '') + ' |'); }
  const arrets = p.campagnes.flatMap((c) => c.arrets.map((a) => ({ ...a, campagne: c.campagne })));
  L.push('', '**Blocages**', ''); if (!arrets.length) L.push('Aucun.'); else { L.push('| Issue | Campagne | Qui débloque | Cause |', '|---|---|---|---|'); for (const a of arrets) L.push('| ' + a.issue + ' (' + a.statut + ') | ' + a.campagne + ' | ' + a.qui + ' | ' + String(a.quoi).replace(/\|/g, '/') + ' |'); }
  L.push('', '**Ce que tu dois faire**', ''); if (!p.actions_paul.length) L.push('Rien.'); else p.actions_paul.forEach((a, k) => L.push((k + 1) + '. ' + a.action + ' — débloque ' + a.debloque + ' issue(s) (' + a.issues.join(', ') + ')'));
  const r = p.ressources; L.push('', '**Ressources** (' + r.hote + ') : RAM libre ' + r.ram_libre_gio + ' Gio · charge ' + r.charge_1min + ' pour ' + r.coeurs + ' cœurs' + (r.pression_cpu_60s !== null ? ' · attente CPU ' + r.pression_cpu_60s + ' % sur 60 s' : '') + ' · places : ' + p.campagnes.map((c) => c.campagne + ' ' + c.places.occupees + '/' + c.places.max).join(', '));
  const ar = p.chats_archives_24h || []; if (ar.length) L.push('', '**Chats archivés (24 h)** : ' + ar.length + ' — ' + ar.slice(0, 6).join(' ; ') + (ar.length > 6 ? ' ; …' : ''));
  L.push('', p.ligne_etat);
  return L.join('\n');
}
export function point(cfg, noms = [], { maintenant = Date.now() } = {}) {
  if (cfg.hote === 'local' && (cfg.registre_distant || cfg.atelier_simule)) return appelAtelier(cfg, ['point', ...noms]);
  const choisies = noms.length ? noms.map((n) => lireCampagne(cfg, n)) : listerCampagnes(cfg).filter((c) => c.statut === 'en_cours');
  const actions = new Map(); const campagnes = [];
  for (const c of choisies) {
    const l = issues(c); const par = {}; for (const i of l) par[i.statut] = (par[i.statut] || 0) + 1;
    const dependants = (id) => { const vus = new Set(); const pile = [id]; while (pile.length) { const x = pile.pop(); for (const j of l) if (j.statut !== 'close' && (j.blocked_by || []).includes(x) && !vus.has(j.linear_id)) { vus.add(j.linear_id); pile.push(j.linear_id); } } return [...vus]; };
    const arrets = [];
    for (const i of l) { if (i.statut === 'close') continue; let attend = null, quoi = null;
      if (i.arret) ({ attend, quoi } = i.arret);
      else if (i.poste_exclu) { attend = 'paul'; quoi = i.poste_exclu; }
      else if (aDebloquerPoste(cfg, i)) { attend = 'paul'; quoi = 'débloquer le poste Windows : ' + (i.poste_env_cause || 'voir le retour du poste'); }
      else if (auPoste(i)) { attend = 'poste'; quoi = 'recette Windows ' + (i.poste === 'en_cours' ? 'en cours' : 'en file') + ' à la passerelle'; }
      else if (i.statut === 'bloquee') { attend = 'a_qualifier'; quoi = derniereDecision(cfg, c.id, i.linear_id) || 'aucune ligne au journal'; }
      if (attend) arrets.push({ issue: i.linear_id, statut: i.statut, attend, qui: ATTENTES[attend] || 'à qualifier', quoi, retient: dependants(i.linear_id) }); }
    const attentePaul = new Set();
    for (const a of arrets.filter((x) => x.attend === 'paul')) { attentePaul.add(a.issue); a.retient.forEach((d) => attentePaul.add(d));
      const cle = net(a.quoi).toLowerCase(); const ex = actions.get(cle) || { action: net(a.quoi), issues: [], retenues: new Set(), campagnes: new Set() };
      ex.issues.push(a.issue); ex.retenues.add(a.issue); a.retient.forEach((d) => ex.retenues.add(d)); ex.campagnes.add(c.id); actions.set(cle, ex); }
    const closes24 = l.filter((i) => i.close_le && maintenant - Date.parse(i.close_le) < 86400000).length;
    campagnes.push({ campagne: c.id, mode: c.mode, statut: c.statut, ...avancement(c), reste: l.filter((i) => i.statut !== 'close').length, par_statut: par, closes_24h: closes24,
      places: { occupees: actifsAdmission(l, null, !!c.voie_recette?.chat).length, max: cfg.admission?.dev_max || 4, ouvertes: ouvertesAdmission(l, null, !!c.voie_recette?.chat).length, ouvertes_max: ouvertesMax(cfg) }, arrets, estimation: estimerReste(cfg, c, l, attentePaul, maintenant), ligne_etat: ligneEtat(cfg, c.id).ligne });
  }
  const actions_paul = [...actions.values()].map((x) => ({ action: x.action, issues: x.issues, debloque: x.retenues.size, campagnes: [...x.campagnes] })).sort((a, b) => b.debloque - a.debloque);
  const ressources = { hote: cfg.hote, ram_libre_gio: Math.round(os.freemem() / 2 ** 30 * 10) / 10, charge_1min: Math.round(os.loadavg()[0] * 10) / 10, coeurs: os.cpus().length, pression_cpu_60s: pressionCpu(cfg) };
  const n = campagnes.length; const qualifier = campagnes.flatMap((c) => c.arrets.filter((a) => a.attend === 'a_qualifier').map((a) => a.issue));
  const toi = actions_paul.slice(0, 2).map((a) => a.action + ' (' + a.issues.join(', ') + ')').join(' ; ') + (actions_paul.length > 2 ? ' ; et ' + (actions_paul.length - 2) + ' autre(s) action(s)' : '');
  const ligne_etat = actions_paul.length ? formatLigne('⏸', 'point de ' + n + ' campagne(s) fait' + (qualifier.length ? ', ' + qualifier.length + ' blocage(s) à qualifier' : ''), toi) : formatLigne('✅', 'point de ' + n + ' campagne(s) fait, rien ne t’attend' + (qualifier.length ? ' ; ' + qualifier.length + ' blocage(s) à qualifier par les orchestrateurs' : ''), 'rien');
  const p = { genere_le: new Date(maintenant).toISOString(), campagnes, actions_paul, ressources, chats_archives_24h: chatsArchives24h(cfg, maintenant), ligne_etat, consigne: 'Recopie le champ rendu tel quel, sans rien ajouter ni retirer ; point en lecture seule.' };
  return { ...p, rendu: rendrePoint(p) };
}

// ---------- v2.5 : passerelle poste Windows (references/poste.md) ----------
const dossierPoste = (cfg, ...p) => path.join(cfg.etat, 'poste', ...p);
export const STATUTS_TACHE = ['en_file', 'en_cours', 'rendu', 'bloque', 'retiree'];
export function lireTaches(cfg) { const d = dossierPoste(cfg, 'file'); return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => lireJson(path.join(d, f))).filter(Boolean) : []; }
const ecrireTache = (cfg, t) => ecrireJson(dossierPoste(cfg, 'file', t.id + '.json'), t);
function marquerIssuePoste(cfg, t, etat, extra = {}) {
  try { modifierCampagne(cfg, t.campagne, (c) => { const i = trouverIssue(c, t.issue); delete i.poste_resultat; delete i.poste_retour; if (etat) Object.assign(i, { poste: etat, poste_tache: t.id }, extra); else { delete i.poste; delete i.poste_tache; } }); } catch {}
}
function appelAtelier(cfg, args, entree) {
  if (cfg.atelier_simule) { const r = spawnSync(process.execPath, [path.join(RACINE, 'scripts', 'pilote.mjs'), ...args], { input: entree, encoding: 'utf8', windowsHide: true, env: { ...process.env, PILOTE_CONFIG: cfg.atelier_simule } }); if (r.status !== 0) refuser('ATELIER INJOIGNABLE', (r.stderr || r.stdout || '').trim().slice(0, 300), 6); return JSON.parse(r.stdout); }
  if (!cfg.ssh?.atelier || !cfg.pilote_atelier) refuser('ATELIER INJOIGNABLE', 'ssh.atelier et pilote_atelier requis dans poste.local.json', 6);
  return viaAtelier(cfg, args, entree);
}
export function posteDeposer(cfg, nom, id, { fiche = '', criticite = null, priorite = 5, reglages = [], forcer = false } = {}) {
  if (cfg.hote === 'local' && (cfg.registre_distant || cfg.atelier_simule)) return appelAtelier(cfg, ['poste', 'deposer', nom, id, '--fiche-stdin', '--priorite', String(priorite), ...(criticite ? ['--criticite', criticite] : []), ...(reglages.length ? ['--reglages', reglages.join(';')] : []), ...(forcer ? ['--forcer'] : [])], fiche);
  if (!String(fiche).trim()) refuser('FICHE ABSENTE', 'la fiche de délégation est obligatoire (--fiche <f> ou --fiche-stdin) : SHA, étapes, attendu, critères');
  const c = lireCampagne(cfg, nom); const i = trouverIssue(c, id);
  if (!forcer && (i.poste_env_echecs || 0) >= maxEchecsEnv(cfg)) refuser('POSTE À DÉBLOQUER', id + ' : ' + i.poste_env_echecs + ' échecs d’environnement au poste (dernière cause : ' + (i.poste_env_cause || 'voir le retour') + ') ; redépôt seulement après l’action de Paul, avec --forcer');
  if (i.poste_exclu && !forcer) refuser('POSTE EXCLU', id + ' a été retirée de la passerelle : ' + i.poste_exclu + ' (nouveau dépôt seulement sur instruction de Paul : --forcer)');
  if (lireTaches(cfg).some((t) => t.campagne === nom && t.issue === id && ['en_file', 'en_cours'].includes(t.statut))) refuser('TÂCHE DÉJÀ EN FILE', id + ' attend déjà le poste');
  const maintenant = new Date().toISOString();
  const t = { id: 'P' + Date.now().toString(36) + '-' + id, campagne: nom, issue: id, projet: i.projet || c.projet, criticite: criticite || i.criticite || 'standard', priorite: Number(priorite) || 5, reglages, fiche: String(fiche), statut: 'en_file', depose_le: maintenant, essais_env: 0, historique: [{ le: maintenant, action: 'déposée' }] };
  verrou(cfg, () => ecrireTache(cfg, t)); marquerIssuePoste(cfg, t, 'en_file');
  if (forcer && (i.poste_exclu || i.poste_env_echecs)) modifierCampagne(cfg, nom, (cc) => { const x = trouverIssue(cc, id); delete x.poste_exclu; delete x.poste_env_echecs; delete x.poste_env_cause; });
  return { tache: t.id, issue: id, statut: 'en_file', regle: 'l’issue sort du quota dev_max tant qu’elle attend le poste' };
}
export function postePrendre(cfg, { poste = 'poste', maintenant = new Date() } = {}) {
  const delai = (cfg.passerelle?.delai_max_min || 180) * 60000; const le = maintenant.toISOString(); const expirees = []; let prise = null;
  verrou(cfg, () => {
    ecrireJson(dossierPoste(cfg, 'vu.json'), { poste, le });
    const toutes = lireTaches(cfg);
    for (const t of toutes.filter((x) => x.statut === 'en_cours' && !x.hors_passerelle && maintenant - Date.parse(x.pris_le) > delai)) {
      t.essais_env = (t.essais_env || 0) + 1; t.statut = t.essais_env >= MAX_ESSAIS ? 'bloque' : 'en_file'; t.historique.push({ le, action: 'délai dépassé : ' + (t.statut === 'bloque' ? 'bloquée' : 'remise en file') }); ecrireTache(cfg, t); expirees.push(t);
    }
    const file = toutes.filter((x) => x.statut === 'en_file').sort((a, b) => a.priorite - b.priorite || String(a.depose_le).localeCompare(String(b.depose_le)));
    if (file[0]) { prise = file[0]; Object.assign(prise, { statut: 'en_cours', pris_le: le, poste }); prise.historique.push({ le, action: 'prise par ' + poste }); ecrireTache(cfg, prise); }
  });
  for (const t of expirees.filter((x) => x.statut === 'bloque')) compterEchecEnv(cfg, t, 'délai dépassé ' + MAX_ESSAIS + ' fois sur le poste');
  for (const t of expirees) marquerIssuePoste(cfg, t, t.statut === 'bloque' ? 'retour' : 'en_file', t.statut === 'bloque' ? { poste_resultat: 'environnement', poste_retour: 'délai dépassé ' + MAX_ESSAIS + ' fois : tâche bloquée' } : {});
  const enFile = lireTaches(cfg).filter((t) => t.statut === 'en_file').length;
  if (!prise) return { tache: null, expirees: expirees.map((t) => t.id), en_file: enFile };
  marquerIssuePoste(cfg, prise, 'en_cours'); const depot = dossierPoste(cfg, 'retours', prise.id); fs.mkdirSync(depot, { recursive: true });
  return { tache: prise, depot, expirees: expirees.map((t) => t.id), en_file: enFile };
}
export function posteRendre(cfg, tid, { resultat, retour = '', ligne = null, issue = null, campagne = null, preuves = null } = {}) {
  if (!['ok', 'echec', 'environnement'].includes(resultat)) refuser('RÉSULTAT INCONNU', String(resultat) + ' (ok, echec ou environnement)');
  if (cfg.hote === 'local' && (cfg.registre_distant || cfg.atelier_simule)) {
    const p = appelAtelier(cfg, ['poste', 'preparer-rendu', ...(tid ? ['--tache', tid] : []), ...(issue ? ['--issue', issue] : []), ...(campagne ? ['--campagne', campagne] : [])]);
    let ok = null; if (preuves) { if (!fs.existsSync(preuves)) refuser('PREUVES ABSENTES', preuves); if (cfg.atelier_simule) { fs.cpSync(preuves, path.join(p.depot, 'preuves'), { recursive: true }); ok = true; } else ok = spawnSync('scp', ['-q', '-r', '-o', 'BatchMode=yes', preuves, cfg.ssh.atelier + ':' + p.depot + '/preuves'], { encoding: 'utf8', windowsHide: true, timeout: 600000 }).status === 0; }
    const r = appelAtelier(cfg, ['poste', 'rendre', p.tache, '--resultat', resultat, '--retour-stdin', ...(ligne ? ['--ligne', ligne] : [])], String(retour || '') + (preuves && !ok ? '\n⚠ Preuves non déposées sur atelier : elles restent sur le poste dans ' + preuves : ''));
    return { ...r, tache_creee: p.cree, preuves_deposees: ok };
  }
  if (!tid) tid = postePreparerRendu(cfg, { issue, campagne }).tache;
  let t; const le = new Date().toISOString();
  verrou(cfg, () => { t = lireJson(dossierPoste(cfg, 'file', tid + '.json'), null); if (!t) refuser('TÂCHE INCONNUE', tid); Object.assign(t, { statut: 'rendu', resultat, rendu_le: le, ligne }); t.historique.push({ le, action: 'rendue : ' + resultat }); ecrireTache(cfg, t); });
  const depot = dossierPoste(cfg, 'retours', tid); fs.mkdirSync(depot, { recursive: true }); fs.writeFileSync(path.join(depot, 'retour.md'), String(retour || 'Aucun retour écrit.') + '\n');
  let essaiCompte = null; if (resultat === 'echec') { try { essaiCompte = essai(cfg, t.campagne, t.issue, 'echec'); } catch {} }
  marquerIssuePoste(cfg, t, 'retour', { poste_resultat: resultat, poste_retour: path.join(depot, 'retour.md') });
  let echecsEnv = null; if (resultat === 'environnement') echecsEnv = compterEchecEnv(cfg, t, causeRetour(retour)); else if (resultat === 'ok') { try { modifierCampagne(cfg, t.campagne, (c) => { const i = trouverIssue(c, t.issue); delete i.poste_env_echecs; delete i.poste_env_cause; }); } catch {} }
  return { tache: tid, issue: t.issue, resultat, retour: path.join(depot, 'retour.md'), preuves: path.join(depot, 'preuves'), essai: resultat === 'echec' ? essaiCompte : 'non compté', ...(echecsEnv !== null ? { echecs_environnement: echecsEnv, a_debloquer_par_paul: echecsEnv >= maxEchecsEnv(cfg) } : {}) };
}
export function posteRetirer(cfg, cible, { motif = '', campagne = null } = {}) {
  if (cfg.hote === 'local' && (cfg.registre_distant || cfg.atelier_simule)) return appelAtelier(cfg, ['poste', 'retirer', cible, '--motif', motif, ...(campagne ? ['--campagne', campagne] : [])]);
  if (!net(motif)) refuser('MOTIF ABSENT', 'usage : pilote.mjs poste retirer <tâche|ID> --motif "<raison>" [--campagne <nom>]');
  const toutes = lireTaches(cfg); const parId = toutes.filter((t) => t.id === cible);
  const cands = parId.length ? parId : toutes.filter((t) => ['en_file', 'en_cours'].includes(t.statut) && t.issue === cible && (!campagne || t.campagne === campagne));
  if (!cands.length) refuser('TÂCHE INCONNUE', cible + ' : aucune tâche en file ou en cours');
  if (cands.length > 1) refuser('TÂCHE AMBIGUË', cible + ' : préciser --campagne (' + cands.map((t) => t.campagne).join(', ') + ')');
  let t = cands[0];
  if (t.statut === 'en_cours') refuser('TÂCHE EN COURS', t.id + ' s’exécute déjà sur le poste depuis ' + t.pris_le + ' : attendre son retour');
  if (t.statut !== 'en_file') refuser('TÂCHE NON RETIRABLE', t.id + ' est ' + t.statut);
  const le = new Date().toISOString();
  verrou(cfg, () => { t = lireJson(dossierPoste(cfg, 'file', t.id + '.json'), t); if (t.statut !== 'en_file') refuser('TÂCHE NON RETIRABLE', t.id + ' est ' + t.statut); Object.assign(t, { statut: 'retiree', retiree_le: le, motif: net(motif) }); t.historique.push({ le, action: 'retirée : ' + net(motif) }); ecrireTache(cfg, t); });
  marquerIssuePoste(cfg, t, null);
  modifierCampagne(cfg, t.campagne, (c) => { trouverIssue(c, t.issue).poste_exclu = net(motif); });
  decision(cfg, t.campagne, t.issue, 'Retirée de la passerelle poste par Paul (via 🏛 ARCHI) : ' + net(motif) + '. Ne pas la redéposer au poste ni l’admettre : elle attend Paul.');
  return { tache: t.id, issue: t.issue, campagne: t.campagne, statut: 'retiree', motif: net(motif), regle: 'issue exclue de la passerelle et de l’admission ; nouveau dépôt seulement avec --forcer, sur instruction de Paul' };
}
export function posteFile(cfg) {
  if (cfg.hote === 'local' && (cfg.registre_distant || cfg.atelier_simule)) return appelAtelier(cfg, ['poste', 'file']);
  const l = lireTaches(cfg); const vu = lireJson(dossierPoste(cfg, 'vu.json'), null); const n = (s) => l.filter((t) => t.statut === s);
  return { en_file: n('en_file').map((t) => t.issue + ' (' + t.campagne + ')'), en_cours: n('en_cours').map((t) => t.issue + ' depuis ' + t.pris_le), bloquees: n('bloque').map((t) => t.issue), retirees: n('retiree').map((t) => t.issue + ' : ' + t.motif), rendues_24h: l.filter((t) => t.statut === 'rendu' && Date.now() - Date.parse(t.rendu_le) < 86400000).map((t) => t.issue + ' : ' + t.resultat), poste_vu_le: vu?.le || null };
}
function consignePoste(cfg, t, travail, imprimantePdf = false) {
  return ['Tu es la session de la passerelle poste du workflow $dev v' + VERSION + ', sur le poste Windows de Paul. Tâche ' + t.id + ' : ' + t.issue + ' (campagne ' + t.campagne + ', projet ' + t.projet + ').', '', 'Règles absolues :',
    '- N’ouvre, ne consulte ni n’utilise aucun gestionnaire de mots de passe. Aucun secret, jeton, DSN, mot de passe ni donnée RH dans les journaux, le retour ou les preuves : uniquement les données synthétiques des dispositifs.',
    '- Aucune base partagée, aucun serveur cible, aucun déploiement, aucune fusion, aucune clôture d’issue, aucune écriture dans Linear.',
    '- Worktrees et caches sur D: (' + (cfg.worktrees || 'D:\\worktrees') + '), jamais sur C: ; arrête-toi si C: passe sous ' + (cfg.garde_disque_gio || 2) + ' Gio.',
    '- Suppression : Corbeille uniquement (Microsoft.VisualBasic.FileIO.FileSystem, SendToRecycleBin).',
    '- Réglages Windows permis pour cette tâche, toujours restaurés à la fin même en cas d’échec (try/finally), valeur d’origine notée dans le retour : ' + (t.reglages?.length ? t.reglages.join(' ; ') : 'aucun') + '. Imprimante : ' + (imprimantePdf ? 'la passerelle a déjà mis « Microsoft Print to PDF » par défaut et la restaurera après toi ; ne change pas l’imprimante' : 'uniquement « Microsoft Print to PDF »') + ', jamais une imprimante physique.',
    '- Pour chaque étape : commande exacte, code de sortie, chemin du journal. Une étape en échec : arrête-toi, ne contourne pas le dispositif.', '', 'Fiche de la tâche :', t.fiche, '', 'Livrables, dans ' + travail + ' :',
    '1. preuves\\ : journaux, matrice (JSON, une ligne par critère : ok, non_applicable justifié ou echec), commandes.jsonl.',
    '2. retour.md : 15 lignes au plus : issue, SHA testé, versions des outils, codes de sortie, chemin des preuves, anomalies, verdict proposé (prêt pour clôture, ou bloqué avec la cause), réglages modifiés et restaurés.',
    '3. resultat.json : {"resultat":"ok"} si tous les critères sont ok ou non applicables justifiés ; {"resultat":"echec"} si le code de la branche est en cause ; {"resultat":"environnement"} si c’est le poste ou un outil (non compté comme essai).', '',
    REGLE_LIGNE_ETAT + ' Ici, ta tâche est finie quand tu écris cette ligne : ✅ TERMINÉ si le résultat est ok, ⛔ BLOQUÉ si c’est echec ou environnement (avec la cause en une phrase), et « Toi : rien » : c’est l’orchestrateur de la campagne qui relit le retour et décide de la clôture.'].join('\n');
}
function executerTachePoste(cfg, t, travail, imprimantePdf = false) {
  const r = router(cfg, { tache: 'tests', criticite: t.criticite || 'standard' }); const sortie = path.join(travail, 'dernier-message.md'); const e = cfg.execution || {}; const test = cfg.passerelle?.commande_test;
  const [exe, ...args] = test || [cfg.codexExecutable, 'exec', '--skip-git-repo-check', '-s', e.sandbox || 'danger-full-access', '-c', 'approval_policy="' + (e.approvalPolicy || 'never') + '"', '-m', r.catalogue, '-C', travail, '-o', sortie];
  if (!exe) refuser('CODEX INTROUVABLE', 'codexExecutable manquant dans poste.local.json');
  const x = spawnSync(exe, args, { input: consignePoste(cfg, t, travail, imprimantePdf), encoding: 'utf8', windowsHide: true, cwd: travail, timeout: (cfg.passerelle?.delai_max_min || 180) * 60000, env: { ...process.env, PASSERELLE_TRAVAIL: travail } });
  return { code: x.status, modele: r.modele, dernier: fs.existsSync(sortie) ? fs.readFileSync(sortie, 'utf8') : (x.stdout || '') };
}
// Sur le poste : relève une tâche de la file d'atelier (tâche planifiée pilote-poste-passerelle), une seule à la fois.
export function posteRelever(cfg) {
  if (cfg.hote !== 'local') refuser('PASSERELLE SUR LE POSTE', 'pilote.mjs poste relever s’exécute sur le poste Windows', 6);
  const p = cfg.passerelle || {}; if (!p.actif) return { action: 'aucune', raison: 'passerelle inactive (poste.local.json : passerelle.actif)' };
  if (cfg.garde_disque_gio) { try { const s = fs.statfsSync(cfg.etat); if (s.bavail * s.bsize / 2 ** 30 < cfg.garde_disque_gio) return { action: 'aucune', raison: 'C: sous la garde de ' + cfg.garde_disque_gio + ' Gio' }; } catch {} }
  fs.mkdirSync(cfg.etat, { recursive: true }); const vl = path.join(cfg.etat, 'poste-releve.verrou');
  try { const fd = fs.openSync(vl, 'wx'); fs.writeSync(fd, String(process.pid)); fs.closeSync(fd); }
  catch (e) { if (e.code !== 'EEXIST') throw e; const pid = Number(fs.readFileSync(vl, 'utf8')); let vivant = false; try { process.kill(pid, 0); vivant = pid !== process.pid; } catch {} if (vivant) return { action: 'aucune', raison: 'relève déjà en cours (pid ' + pid + ')' }; fs.writeFileSync(vl, String(process.pid)); }
  try {
    const r = appelAtelier(cfg, ['poste', 'prendre', '--poste', os.hostname()]);
    const veille = garderEveilSecteur(cfg, (r.tache ? 1 : 0) + (r.en_file || 0)); // v2.8 : poste éveillé sur secteur tant que la file n'est pas vide
    if (!r.tache) return { action: 'aucune', raison: 'file vide', expirees: r.expirees, veille };
    const t = r.tache; const travail = path.join(p.dossier_travail || path.join(cfg.etat, 'passerelle'), t.id); fs.mkdirSync(path.join(travail, 'preuves'), { recursive: true });
    if (!p.commande_test) { try { os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch {} }
    const eveil = maintenirEveille(cfg); const imp = basculerImprimante(cfg); let x;
    try { x = executerTachePoste(cfg, t, travail, imp.active); } finally { imp.restaurer(); eveil.relacher(); }
    let resultat = lireJson(path.join(travail, 'resultat.json'), {})?.resultat; if (!['ok', 'echec', 'environnement'].includes(resultat)) resultat = 'environnement';
    const retour = (fs.existsSync(path.join(travail, 'retour.md')) ? fs.readFileSync(path.join(travail, 'retour.md'), 'utf8') : 'Aucun retour écrit par la session (code ' + x.code + ') : compté comme échec d’environnement.') + (imp.note ? '\n- ' + imp.note + ' (passerelle)' : '');
    const ligne = lireLigneEtat(x.dernier)?.ligne || null;
    let preuves = false;
    if (cfg.atelier_simule) { fs.cpSync(path.join(travail, 'preuves'), path.join(r.depot, 'preuves'), { recursive: true }); preuves = true; }
    else { const s = spawnSync('scp', ['-q', '-r', '-o', 'BatchMode=yes', path.join(travail, 'preuves'), cfg.ssh.atelier + ':' + r.depot + '/'], { encoding: 'utf8', windowsHide: true, timeout: 600000 }); preuves = s.status === 0; }
    const rendu = appelAtelier(cfg, ['poste', 'rendre', t.id, '--resultat', resultat, '--retour-stdin', ...(ligne ? ['--ligne', ligne] : [])], retour + (preuves ? '' : '\n⚠ Preuves non déposées sur atelier : elles restent sur le poste dans ' + travail));
    return { action: 'tache', veille, tache: t.id, issue: t.issue, modele: x.modele, code: x.code, resultat, preuves_deposees: preuves, travail, ligne, essai: rendu.essai, imprimante: imp.note, ...(rendu.echecs_environnement ? { echecs_environnement: rendu.echecs_environnement } : {}) };
  } finally { fs.rmSync(vl, { force: true }); }
}
export function posteInstaller(cfg) {
  if (process.platform !== 'win32' || cfg.hote !== 'local') refuser('PASSERELLE SUR LE POSTE', 'l’installation de la tâche planifiée se fait sur le poste Windows', 6);
  const nom = 'pilote-poste-passerelle'; const min = cfg.passerelle?.intervalle_min || 10; const pilote = cfg.pilote || path.join(RACINE, 'scripts', 'pilote.mjs');
  const ps = ["$ErrorActionPreference = 'Stop'",
    "$a = New-ScheduledTaskAction -Execute 'C:\\Windows\\System32\\conhost.exe' -Argument '--headless \"" + process.execPath + "\" \"" + pilote + "\" poste relever'",
    "$t1 = New-ScheduledTaskTrigger -AtLogOn -User ($env:USERDOMAIN + '\\' + $env:USERNAME)",
    "$t2 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes " + min + ")",
    "$cl = Get-CimClass -Namespace ROOT\\Microsoft\\Windows\\TaskScheduler -ClassName MSFT_TaskSessionStateChangeTrigger",
    "$t3 = New-CimInstance -CimClass $cl -ClientOnly; $t3.StateChange = 8; $t3.UserId = ($env:USERDOMAIN + '\\' + $env:USERNAME); $t3.Enabled = $true",
    "$s = New-ScheduledTaskSettingsSet -Hidden -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes " + ((cfg.passerelle?.delai_max_min || 180) + 15) + ")",
    "Register-ScheduledTask -TaskName '" + nom + "' -Action $a -Trigger @($t1, $t2, $t3) -Settings $s -Description 'Passerelle poste du workflow $dev : relève la file des tests Windows sur atelier' -Force | Out-Null",
    "(Get-ScheduledTask -TaskName '" + nom + "').State"].join('; ');
  const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
  if (r.status !== 0) refuser('TÂCHE NON INSTALLÉE', ((r.stderr || '') + (r.stdout || '')).trim().slice(0, 400));
  return { tache: nom, etat: r.stdout.trim(), declencheurs: ['ouverture de session', 'déverrouillage', 'toutes les ' + min + ' min'], commande: 'node ' + pilote + ' poste relever' };
}
// Tableau des chats : dernière ligne d'état de chaque chat (registres des deux hôtes, plus les chats locaux fournis).
export function chatsEtat(cfg, { chats = [], local = false } = {}) {
  const sans = 'pas encore de ligne d’état'; const fournis = Object.fromEntries(chats.map((c) => [c.id, c])); const lignes = []; const vus = new Set();
  if (cfg.registre_distant && !local) { try { lignes.push(...appelAtelier(cfg, ['etat', 'chats', '--local']).tableau); } catch (e) { lignes.push('atelier injoignable : ' + e.message); } }
  for (const c of listerCampagnes(cfg).filter((x) => x.chat && x.statut !== 'close')) { vus.add(c.chat); lignes.push(titreCampagne(c).titre + ' — ' + ligneEtat(cfg, c.id).ligne); }
  for (const [id, x] of Object.entries(lireRegistreChats(cfg))) { if (vus.has(id) || x.statut === 'archive' || id.startsWith('a_creer')) continue; vus.add(id); const f = fournis[id]; const l = f ? lireLigneEtat(f.dernier_message)?.ligne : x.derniere_ligne; lignes.push((f?.titre || x.titre) + ' — ' + (l || sans)); }
  for (const c of chats.filter((x) => !vus.has(x.id))) lignes.push(c.titre + ' — ' + (lireLigneEtat(c.dernier_message)?.ligne || sans));
  return { chats: lignes.length, tableau: lignes };
}

// Réveil : lit la ligne d'état du dernier message d'un chat, met à jour le registre et le suffixe du titre.
async function suivreLigne(cfg, s, chat, info, lu) {
  const tour = (lu?.thread?.turns || []).at(-1); const msg = (tour?.items || []).filter((i) => i.type === 'agentMessage').at(-1)?.text; if (!msg) return null;
  const l = lireLigneEtat(msg);
  if (!l) { if (!info.ligne_absente) inscrireChat(cfg, { chat_id: chat, ligne_absente: true, action: 'dernier message sans ligne d’état' }); return null; }
  if (info.derniere_ligne !== l.ligne || info.ligne_absente) inscrireChat(cfg, { chat_id: chat, derniere_ligne: l.ligne, derniere_ligne_le: new Date().toISOString(), ligne_absente: false, ...(['archive', 'a_creer'].includes(info.statut) ? {} : { statut: l.statut }), action: 'ligne d’état : ' + l.etat });
  if (info.role && info.objet && !['AUTO', 'SUP', 'MS', 'AIDE', 'ARCHI'].includes(info.role)) { const voulu = titre(info.role, info.projet || 'general', info.objet, l.suffixe).titre; if (lu?.thread?.name && lu.thread.name !== voulu) await s.call('thread/name/set', { threadId: chat, name: voulu }).catch(() => {}); }
  return l;
}
export function signalementsPoste(cfg, c) {
  const l = issues(c); const out = []; const vu = lireJson(path.join(cfg.etat, 'poste', 'vu.json'), null); const enFile = l.filter((i) => i.poste === 'en_file');
  if (enFile.length && !lireTaches(cfg).some((t) => t.statut === 'en_cours') && (!vu || Date.now() - Date.parse(vu.le) > 86400000)) out.push('poste Windows non vu depuis ' + (vu ? Math.round((Date.now() - Date.parse(vu.le)) / 3600000) + ' h' : 'sa mise en service') + ' : ' + enFile.length + ' tâche(s) en file (' + enFile.map((i) => i.linear_id).join(', ') + ')');
  for (const i of l.filter((x) => aDebloquerPoste(cfg, x))) out.push('poste à débloquer par Paul : ' + i.linear_id + ' (' + i.poste_env_echecs + ' échecs d’environnement : ' + (i.poste_env_cause || 'voir le retour') + ')');
  for (const i of l.filter((x) => x.poste === 'retour' && x.poste_resultat === 'environnement')) out.push('poste : ' + i.linear_id + ' en échec d’environnement (non compté comme essai)');
  return out;
}

// ---------- v2.5.4 : imprimante PDF automatique, plafond des échecs d'environnement, rendu hors file, garde CPU ----------
export const IMPRIMANTE_PDF = 'Microsoft Print to PDF';
function imprimanteOps(cfg) {
  const sim = cfg.passerelle?.imprimante_simulee;
  if (sim) return { lire: () => lireJson(sim, {}).defaut || null, existe: (n) => (lireJson(sim, {}).liste || []).includes(n), definir: (n) => { const e = lireJson(sim, {}); e.defaut = n; e.historique = [...(e.historique || []), n]; ecrireJson(sim, e); return true; } };
  if (process.platform !== 'win32') return null;
  const ps = (c) => (spawnSync('powershell.exe', ['-NoProfile', '-Command', c], { encoding: 'utf8', windowsHide: true, timeout: 60000 }).stdout || '').trim();
  const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  return { lire: () => ps('(Get-CimInstance Win32_Printer | Where-Object Default | Select-Object -First 1).Name') || null,
    existe: (n) => ps('(Get-CimInstance Win32_Printer | Where-Object Name -eq ' + q(n) + ' | Measure-Object).Count') === '1',
    definir: (n) => ps('$p = Get-CimInstance Win32_Printer | Where-Object Name -eq ' + q(n) + '; if ($p) { (Invoke-CimMethod -InputObject $p -MethodName SetDefaultPrinter).ReturnValue } else { 1 }') === '0' };
}
// Bascule l'imprimante par défaut sur « Microsoft Print to PDF » le temps d'une tâche de la passerelle (AGENTS.md : tests d'impression), puis la restaure.
export function basculerImprimante(cfg) {
  const etat = { note: null, restauree: null, active: false, restaurer: () => null };
  if (cfg.passerelle?.imprimante_pdf === false) return etat;
  const ops = imprimanteOps(cfg); if (!ops) return etat;
  let avant = null; try { avant = ops.lire(); } catch {}
  if (!ops.existe(IMPRIMANTE_PDF)) { etat.note = 'Imprimante : « ' + IMPRIMANTE_PDF + ' » absente du poste, défaut inchangé (prérequis manquant).'; return etat; }
  if (avant === IMPRIMANTE_PDF) { etat.note = 'Imprimante : « ' + IMPRIMANTE_PDF + ' » était déjà l’imprimante par défaut.'; etat.active = true; return etat; }
  if (!ops.definir(IMPRIMANTE_PDF)) { etat.note = 'Imprimante : bascule vers « ' + IMPRIMANTE_PDF + ' » refusée par Windows, défaut inchangé.'; return etat; }
  etat.active = true;
  etat.restaurer = () => { let ok = false; try { ok = !!avant && ops.definir(avant) && ops.lire() === avant; } catch {} etat.restauree = ok; etat.note = 'Imprimante : « ' + avant + ' » → « ' + IMPRIMANTE_PDF + ' » le temps de la tâche, restaurée : ' + (ok ? 'oui' : 'NON, à vérifier sur le poste') + '.'; return ok; };
  return etat;
}
const maxEchecsEnv = (cfg) => cfg.passerelle?.max_echecs_env ?? 2;
export const aDebloquerPoste = (cfg, i) => (i.poste_env_echecs || 0) >= maxEchecsEnv(cfg) && !auPoste(i) && i.statut !== 'close';
function causeRetour(texte) { const l = String(texte || '').split(/\r?\n/).map((x) => x.replace(/^[-*#\s]+/, '').trim()).filter(Boolean); return (l.find((x) => /verdict|anomalie|cause/i.test(x)) || l[0] || 'voir le retour').slice(0, 180); }
function compterEchecEnv(cfg, t, cause) { let n = 0; try { modifierCampagne(cfg, t.campagne, (c) => { const i = trouverIssue(c, t.issue); i.poste_env_echecs = (i.poste_env_echecs || 0) + 1; i.poste_env_cause = cause; n = i.poste_env_echecs; }); } catch {} return n; }
// Rendu d'un résultat produit hors passerelle (chat manuel du poste) : rattache ou crée la tâche, sans changer l'état de l'issue.
export function postePreparerRendu(cfg, { issue = null, campagne = null, tache = null } = {}) {
  const depotDe = (id) => { const d = dossierPoste(cfg, 'retours', id); fs.mkdirSync(d, { recursive: true }); return d; };
  if (tache) { const t = lireJson(dossierPoste(cfg, 'file', tache + '.json'), null); if (!t) refuser('TÂCHE INCONNUE', tache); return { tache: t.id, depot: depotDe(t.id), cree: false }; }
  if (!issue || !campagne) refuser('ISSUE ABSENTE', 'usage : pilote.mjs poste rendre --issue <ID> --campagne <nom> --resultat <r> --retour-stdin [--preuves <dossier>]');
  const viv = lireTaches(cfg).find((t) => t.campagne === campagne && t.issue === issue && ['en_file', 'en_cours'].includes(t.statut));
  if (viv) return { tache: viv.id, depot: depotDe(viv.id), cree: false };
  const c = lireCampagne(cfg, campagne); const i = trouverIssue(c, issue); const le = new Date().toISOString();
  const t = { id: 'P' + Date.now().toString(36) + '-' + issue, campagne, issue, projet: i.projet || c.projet, criticite: i.criticite || 'standard', priorite: 5, reglages: [], fiche: 'Résultat produit hors passerelle (chat du poste), rendu par poste rendre --issue.', statut: 'en_cours', hors_passerelle: true, depose_le: le, pris_le: le, poste: 'hors passerelle', essais_env: 0, historique: [{ le, action: 'créée pour un rendu hors passerelle' }] };
  verrou(cfg, () => ecrireTache(cfg, t));
  return { tache: t.id, depot: depotDe(t.id), cree: true };
}
// Garde CPU à l'admission : attente CPU moyenne sur 60 s (PSI Linux) ; absente sous Windows.
export function pressionCpu(cfg) {
  const f = cfg.admission?.pression_cpu_fichier || ['/sys/fs/cgroup/cpu.pressure', '/proc/pressure/cpu'].find((x) => fs.existsSync(x));
  if (!f || !fs.existsSync(f)) return null; const m = fs.readFileSync(f, 'utf8').match(/^some .*avg60=([\d.]+)/m); return m ? Number(m[1]) : null;
}
export function gardeCpu(cfg, i) {
  if (i && i.statut !== 'en_attente') return null; const g = cfg.admission?.garde_cpu_pct ?? 40; const p = pressionCpu(cfg);
  if (p !== null && p > g) refuser('ADMISSION DIFFÉRÉE', 'attente CPU de ' + p + ' % sur 60 s, au-dessus de la garde de ' + g + ' % : admission reportée au prochain réveil', 5);
  return p;
}

// ---------- CLI ----------
function options(argv) { const o = { _: [] }; for (let k = 0; k < argv.length; k++) { const a = argv[k]; if (a.startsWith('--')) { const n = a.slice(2); const v = argv[k + 1] && !argv[k + 1].startsWith('--') ? argv[++k] : true; o[n] = v; } else o._.push(a); } return o; }
// v2.7 : une commande visant une issue transférée (scission) est rejouée sur la campagne sœur.
export function executer(argv, cfg = null) { try { return executerBrut(argv, cfg); } catch (e) { if (e instanceof Refus && e.titre === 'ISSUE TRANSFÉRÉE' && e.de && e.vers && argv.includes(e.de)) return executerBrut(argv.map((x) => x === e.de ? e.vers : x), cfg); throw e; } }
function executerBrut(argv, cfg = null) {
  const o = options(argv); const [cmd, ...a] = o._; const C = () => cfg || (cfg = lireConfig());
  switch (cmd) {
    case 'etat': if (a[0] === 'chats') return chatsEtat(C(), { chats: o['chats-stdin'] ? JSON.parse(fs.readFileSync(0, 'utf8') || '[]') : o['chats-fichier'] ? lireJson(o['chats-fichier'], []) : [], local: !!o.local }); return etat(C(), a[0]);
    case 'modele': return router(C(), { tache: a[0], criticite: a[1], volumetrie: a[2] || 'compact', sousAgent: !!o['sous-agent'], entree: Number(o.entree || 0), trivial: !!o.trivial });
    case 'escalade': return escalade(C(), { criticite: a[0], essai: a[1], nature: a[2] || 'bug', sousAgent: !!o['sous-agent'] });
    case 'titre': return a[0] === 'campagne' ? titreCampagne(lireCampagne(C(), a[1])) : titre(a[0], a[1], a[2], a[3]);
    case 'badge': { const v = [o.role ?? a[0], o.issue ?? o.id ?? a[1], o.projet ?? a[2], o.hote ?? a[3], o.modele ?? a[4], o.essai ?? a[5]]; if ([0, 2, 3, 4].some((k) => !v[k] || v[k] === true)) refuser('BADGE INCOMPLET', 'usage : badge <rôle> <ID|-> <projet> <atelier|local> <modèle> [essai], ou --role --issue --projet --hote --modele [--essai]'); return { badge: badge(v[0], v[1] === '-' || v[1] === true ? null : v[1], v[2], v[3], v[4], v[5] === true ? null : v[5]) }; } // v2.8.5 : options nommées, plus de champ undefined
    case 'tour': return parametresTour(C());
    case 'campagne': {
      const [sous, nom, ...r] = a;
      if (sous === 'composer') return composer(C(), { nom, projet: r[0], ids: r.slice(1), depuis: o.depuis, mode: o.mode, hoteExecution: o['hote-execution'], hoteLivraison: o['hote-livraison'] });
      if (sous === 'contrat') return validerContrat(C(), nom);
      if (sous === 'scinder') return scinderCampagne(C(), nom, { projets: String(o.projet && o.projet !== true ? o.projet : '').split(',').map((x) => x.trim()).filter(Boolean), vers: o.vers && o.vers !== true ? o.vers : null });
      if (sous === 'voie-recette') return creerVoieRecette(C(), nom);
      if (sous === 'ajouter') return ajouterIssues(C(), nom, r, { projet: o.projet && o.projet !== true ? o.projet : null, criticite: o.criticite && o.criticite !== true ? o.criticite : 'standard', bloqueePar: o['bloquee-par'] && o['bloquee-par'] !== true ? String(o['bloquee-par']).split(',').map((x) => x.trim()).filter(Boolean) : [], milestone: o.milestone && o.milestone !== true ? o.milestone : null, motif: o.motif });
      if (sous === 'lancer') return lancer(C(), nom, r[0] === 'supervise' ? 'supervise' : r[0] === 'auto' ? 'auto' : undefined);
      if (sous === 'cloturer') return changerStatutCampagne(C(), nom, 'close');
      refuser('COMMANDE INCONNUE', 'campagne ' + sous);
    }
    case 'pause': return changerStatutCampagne(C(), a[0], 'en_pause');
    case 'reprendre': return lancer(C(), a[0]);
    case 'statut': return statutIssue(C(), a[0], a[1], a[2], a[3], { attend: o.attend && o.attend !== true ? o.attend : (o.attend === true ? 'inconnue' : null), quoi: o.quoi, sansFusion: o['sans-fusion'] ?? null, irreversible: o.reserve ?? o.irreversible ?? null });
    case 'arret': return qualifierArret(C(), a[0], a[1], { attend: o.attend, quoi: o.quoi, lever: !!o.lever, irreversible: o.reserve ?? o.irreversible ?? null });
    case 'point': { const r = point(C(), a); return o.texte ? { __texte: r.rendu } : r; }
    case 'essai': return essai(C(), a[0], a[1], a[2]);
    case 'reprise': return reprise(C(), a[0], a[1], a[2], a[3]);
    case 'decision': return decision(C(), a[0], a[1], a.slice(2).join(' '));
    case 'decision-globale': return decisionGlobale(C(), o['texte-stdin'] ? fs.readFileSync(0, 'utf8') : a.join(' '));
    case 'poste': { const s = a[0];
      if (s === 'deposer') return posteDeposer(C(), a[1], a[2], { fiche: o['fiche-stdin'] ? fs.readFileSync(0, 'utf8') : (o.fiche && o.fiche !== true && fs.existsSync(o.fiche) ? fs.readFileSync(o.fiche, 'utf8') : ''), criticite: o.criticite || null, priorite: o.priorite || 5, reglages: o.reglages && o.reglages !== true ? String(o.reglages).split(';').map((x) => x.trim()).filter(Boolean) : [], forcer: !!o.forcer });
      if (s === 'prendre') return postePrendre(C(), { poste: o.poste || 'poste' });
      if (s === 'rendre') return posteRendre(C(), a[1] || (o.tache && o.tache !== true ? o.tache : null), { resultat: o.resultat, retour: o['retour-stdin'] ? fs.readFileSync(0, 'utf8') : '', ligne: o.ligne && o.ligne !== true ? o.ligne : null, issue: o.issue && o.issue !== true ? o.issue : null, campagne: o.campagne && o.campagne !== true ? o.campagne : null, preuves: o.preuves && o.preuves !== true ? o.preuves : null });
      if (s === 'preparer-rendu') return postePreparerRendu(C(), { issue: o.issue || null, campagne: o.campagne || null, tache: o.tache || null });
      if (s === 'retirer') return posteRetirer(C(), a[1], { motif: o.motif && o.motif !== true ? o.motif : a.slice(2).join(' '), campagne: o.campagne || null });
      if (s === 'relever') return posteRelever(C());
      if (s === 'installer') return posteInstaller(C());
      if (!s || s === 'file') return posteFile(C());
      refuser('COMMANDE INCONNUE', 'poste ' + s + ' — deposer, retirer, prendre, rendre, relever, installer, file'); }
    case 'ligne-etat': return ligneEtat(C(), a[0]);
    case 'recettes': return recettesVoie(C(), a[0]);
    case 'contexte': return contexte(C(), a[0]);
    case 'digest': return digest(C(), a[0]);
    case 'ouvrir': return ouvrir(C(), a[0], a[1], { compte: o.compte, fiche: o.fiche, livrable: !!o.livrable, aBlanc: !!(o['a-blanc'] || o['dry-run']) }); // v2.8.3 : --dry-run = --a-blanc
    case 'carte': { const cf = C(); const pr = cf.projets[a[0]]; if (!pr) refuser('PROJET INCONNU', a[0]); const f0 = path.join(cf.etat, 'carte', a[0] + '.md'); if (!fs.existsSync(f0) || o.squelette) genererCarte(cf, a[0], pr); return { carte: f0, agent_pid: lancerAgentCarte(cf, a[0]) }; }
    case 'fiche': return lireFiche(C(), a[0], { maxAgeMin: o.rafraichir ? 0 : 60 });
    case 'mentions': { const t = o.fiche && fs.existsSync(o.fiche) ? fs.readFileSync(o.fiche, 'utf8') : String(o.fiche || a.join(' ')); return { mentions: mentionsModele(C(), t), signalements: mentionsModele(C(), t).map((m) => signalementModele(o.id || 'issue', m)) }; }
    case 'rendre': return rendre(C(), a[0], a[1]);
    case 'refus': return refus(C(), a[0], a.slice(1).join(' '));
    case 'deployer': return deployer(C(), a[0], a[1]);
    case 'contrat': return contrat(a.join(' '));
    case 'chat': return ouvrirChat(C(), a[0]);
    case 'lourde': { const i = argv.indexOf('--'); const avant = i >= 0 ? argv.slice(0, i) : argv; const k = avant.indexOf('--issue'); const r = lourde(C(), a[0], i >= 0 ? argv.slice(i + 1) : a.slice(1), { issue: k >= 0 ? avant[k + 1] : null }); process.exitCode = r.code; return r; }
    case 'desempiler': return desempiler(C(), a[0], a[1]);
    case 'chaine-critique': return { campagne: a[0], chaine: chaineCritique(C(), lireCampagne(C(), a[0])) };
    case 'aide': { if (a[0] === 'enregistrer') return enregistrerAide(C(), a[1], o.modele); const ch = o['chats-fichier'] ? lireJson(o['chats-fichier'], null) : o.chats ? JSON.parse(o.chats) : []; if (!Array.isArray(ch)) refuser('CHATS ILLISIBLES', 'attendu un tableau JSON [{ id, titre, archive, maj }]'); return aide(C(), { chats: ch, recreer: !!o.recreer, indisponibles: o.indisponible ? String(o.indisponible).split(',') : [] }); }
    case 'archi': { if (a[0] === 'enregistrer') return enregistrerArchi(C(), a[1], o.modele); refuser('COMMANDE INCONNUE', 'archi ' + (a[0] || '') + ' — usage : pilote.mjs archi enregistrer <chat_id> ; pour ouvrir le chat : pilote.mjs lancer archi'); }
    case 'nettoyeur': { if (a[0] !== 'candidats') refuser('COMMANDE INCONNUE', 'nettoyeur ' + a[0]); const ch = o['chats-fichier'] ? lireJson(o['chats-fichier'], []) : JSON.parse(o.chats || '[]'); return { chats: 'hors périmètre : les chats relèvent de $dev menage', ne_jamais_toucher: livrablesProteges(C()), taches_protegees: tachesProtegees(C()) }; }
    case 'chat-travail': { const cs = o['consigne-stdin'] ? fs.readFileSync(0, 'utf8') : o['consigne-fichier'] ? fs.readFileSync(o['consigne-fichier'], 'utf8') : (o.consigne || ''); return ouvrirChatTravail(C(), { role: a[0], projet: a[1], objet: a.slice(2).join(' '), hote: o.hote || null, livraison: !!o.livraison, modele: o.modele, cwd: o.cwd, consigne: cs, campagne: o.campagne || null, issue: o.issue || null, effort: o.effort || 'medium' }); }
    case 'acces-restreint': return accesRestreint(C(), a[0]);
    case 'relancer-chat': return relancerChat(C(), a[0], { motif: o.motif || 'relance demandée' });
    case 'livrables': { if (a[0] === 'proteges') return { proteges: livrablesProteges(C()) }; if (a[0] === 'a-rapatrier') return { a_rapatrier: livrablesARapatrier(C()) }; if (a[0] === 'marquer') return marquerLivrables(C(), a[1], a[2], a[3]); if (a[0] === 'rapatrier') return rapatrierLivrables(C()); refuser('COMMANDE INCONNUE', 'livrables ' + a[0]); }
    case 'livrer': return livrer(C(), a[0], { aBlanc: !!o['a-blanc'] }).then((r) => { process.exitCode = r.code; return r; });
    case 'livraison-executer': return executerLivraison(C(), a[0], { aBlanc: !!o['a-blanc'], journal: o.journal || null }).then((r) => { process.exitCode = r.code; return r; });
    case 'livraison-go': return goLivraison(C(), a[0], a[1]);
    case 'livraison-info': return infoLivraison(C(), a[0]);
    case 'livraison-marquer': return marquerLivraison(C(), a[0], JSON.parse(fs.readFileSync(0, 'utf8')));
    case 'poster': return posterSup(C(), a[0], o['texte-stdin'] ? fs.readFileSync(0, 'utf8') : String(o.texte || ''));
    case 'lancer': return lancerCommande(C(), { commande: a[0], args: a.slice(1), depuisModele: o['depuis-modele'] || null, depuisRole: o['depuis-role'] && o['depuis-role'] !== true ? o['depuis-role'] : null, fiche: o['fiche-stdin'] ? fs.readFileSync(0, 'utf8') : o['fiche-fichier'] ? fs.readFileSync(o['fiche-fichier'], 'utf8') : String(o.fiche || ''), projet: o.projet || null, criticite: o.criticite || null, garder: o.garder || null, nouveau: !!o.nouveau });
    case 'menage': { const rel = (f) => path.isAbsolute(f) ? f : path.join(C().etat, f); const ch = o['chats-fichier'] ? lireJson(rel(o['chats-fichier']), []) : o.chats ? JSON.parse(o.chats) : null; const lin = o['linear-fichier'] ? lireJson(rel(o['linear-fichier']), {}) : {}; if (o['archive-apres-jours'] !== undefined) { C().chats = { ...(C().chats || {}), archive_apres_jours: Number(o['archive-apres-jours']) }; delete C().chats.archive_apres_heures; } if (o['archive-apres-heures'] !== undefined) C().chats = { ...(C().chats || {}), archive_apres_heures: Number(o['archive-apres-heures']) }; if (a[0] === 'appliquer') return appliquerMenage(C(), a[1] || 'surs', { chats: ch, linear: lin }); return analyserMenage(C(), { chats: ch || [], linear: lin }); }
    case 'chats': return lireRegistreChats(C());
    case 'recreer-chat': return modifierCampagne(C(), a[0], (cc) => { cc.recreer_chat = true; return { campagne: a[0], recreer_chat: true, regle: 'recréé par le réveil au prochain point stable, jamais au milieu d’une issue' }; });
    case 'chats-app': return (async () => { const { connecter } = await import('./appserver.mjs'); const s = await connecter(C()); const out = []; try { let cursor = null; for (let i = 0; i < 20; i++) { const r = await s.call('thread/list', { limit: 100, ...(cursor ? { cursor } : {}) }); for (const x of r.data) out.push({ id: x.id, titre: x.name || '', hote: C().hote, archive: false, maj: new Date((x.updatedAt || 0) * 1000).toISOString(), dossier: x.section?.name || null }); cursor = r.nextCursor; if (!cursor) break; } } finally { s.fermer(); } return out; })();
    case 'chat-inscrire': return inscrireChat(C(), JSON.parse(fs.readFileSync(0, 'utf8')));
    case 'menage-donnees': return donneesMenage(C(), o.ids && o.ids !== '-' ? String(o.ids).split(',') : []);
    case 'menage-attente': { const cf = C(); ecrireJson(path.join(cf.etat, 'menage', 'attente.json'), { n: Number(a[0] || 0), le: new Date().toISOString() }); return { attente: Number(a[0] || 0) }; }
    case 'menage-executer': return executerOpsChats(C(), JSON.parse(fs.readFileSync(0, 'utf8')));
    case 'reveil': return reveil(C(), { intervalleMin: Number(o.intervalle || 10) });
    default: refuser('COMMANDE INCONNUE', String(cmd) + ' — commandes : etat, point, modele, escalade, titre, badge, tour, campagne, pause, reprendre, statut, arret, essai, reprise, decision, contexte, digest, ouvrir, rendre, refus, deployer, contrat, aide, nettoyeur');
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const r = await executer(process.argv.slice(2)); console.log(r && typeof r.__texte === 'string' ? r.__texte : JSON.stringify(r, null, 2)); }
  catch (e) { if (e instanceof Refus) { console.error(e.titre + ' — ' + e.message); process.exitCode = e.code; } else { console.error(e.stack || e.message); process.exitCode = 1; } }
}

