#!/usr/bin/env node

// Synchronisation du vault Obsidian, partagé par tous les postes et modifié
// directement sur sa branche principale, sans branche ni pull request :
//   lire     — récupère la dernière version, en replaçant d'éventuels commits
//              locaux par-dessus ; à lancer avant de lire et avant d'écrire ;
//   envoyer  — enregistre seulement les fichiers indiqués, puis envoie. Si
//              l'envoi est refusé parce que le vault a avancé, intègre les
//              nouveautés et réessaie, deux fois au plus (trois tentatives).
//              Un chemin relatif ou noté vault:<chemin> part de la racine du
//              vault, quel que soit le dossier d'où le script est lancé.
// Un vrai conflit est annulé proprement : le commit local reste conservé et
// l'utilisateur décide. Jamais d'envoi forcé. Une ligne de réponse par appel.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Configuration du poste : poste.local.json à la racine du skill (dossier parent de scripts/).
function lirePoste() {
  const f = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), "poste.local.json");
  try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return {}; }
}

export const TENTATIVES = 3;
class Arret extends Error {
  constructor(titre, message) { super(message); this.titre = titre; }
}
const stop = (titre, message) => { throw new Arret(titre, message); };
const derniere = (texte) => (texte || "").trim().split(/\r?\n/).filter(Boolean).at(-1) || "";

// GIT_EDITOR=true : aucun éditeur ne s'ouvre pendant un rebase.
function git(cwd, ...args) {
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_EDITOR: "true" } });
  return { code: r.error ? 127 : (r.status ?? 1), out: (r.stdout || "").trim(), err: (r.stderr || r.error?.message || "").trim() };
}
const court = (sha) => (sha || "").slice(0, 8);

// Chemin réel : sous Windows, Git donne la forme longue (C:/Users/<utilisateur>)
// alors qu'un chemin reçu peut être court (C:\Users\<utilisateur-court>). Un fichier
// supprimé est résolu par son dossier parent.
function reel(chemin) {
  const absolu = path.resolve(chemin);
  try { return fs.realpathSync.native(absolu); } catch {
    const parent = path.dirname(absolu);
    return parent === absolu ? absolu : path.join(reel(parent), path.basename(absolu));
  }
}

function resoudreVault(option) {
  const dossier = option || lirePoste().vault;
  if (!dossier) stop("VAULT BLOQUÉ", "chemin du vault absent de poste.local.json (clé vault)");
  if (!fs.existsSync(dossier) || git(dossier, "rev-parse", "--git-dir").code) stop("VAULT BLOQUÉ", "vault introuvable : " + dossier);
  return reel(git(dossier, "rev-parse", "--show-toplevel").out);
}

function controler(vault) {
  const gitDir = path.resolve(vault, git(vault, "rev-parse", "--git-dir").out);
  if (fs.existsSync(path.join(gitDir, "rebase-merge")) || fs.existsSync(path.join(gitDir, "rebase-apply")) || fs.existsSync(path.join(gitDir, "MERGE_HEAD"))) {
    stop("VAULT BLOQUÉ", "rebase ou fusion déjà en cours dans " + vault + " : à terminer ou annuler avec l'utilisateur");
  }
  if (git(vault, "symbolic-ref", "-q", "HEAD").code) stop("VAULT BLOQUÉ", "HEAD détachée dans " + vault);
  if (git(vault, "rev-parse", "--abbrev-ref", "@{upstream}").code) stop("VAULT BLOQUÉ", "branche sans suivi distant dans " + vault);
}

// Intègre les nouveautés distantes. Un conflit est annulé : rien n'est perdu.
function integrer(vault) {
  const r = git(vault, "pull", "--rebase", "--autostash", "-q");
  if (r.code === 0) return;
  const enConflit = git(vault, "diff", "--name-only", "--diff-filter=U").out.split("\n").filter(Boolean);
  const gitDir = path.resolve(vault, git(vault, "rev-parse", "--git-dir").out);
  if (fs.existsSync(path.join(gitDir, "rebase-merge")) || fs.existsSync(path.join(gitDir, "rebase-apply"))) {
    git(vault, "rebase", "--abort");
    stop("VAULT EN CONFLIT", (enConflit.length ? enConflit.join(", ") : "fichiers en conflit") + " ; mise à jour annulée, commit local " + court(git(vault, "rev-parse", "HEAD").out) + " conservé");
  }
  stop("VAULT REFUSÉ", "récupération impossible : " + derniere(r.err || r.out));
}

const enAvance = (vault) => Number(git(vault, "rev-list", "--count", "@{upstream}..HEAD").out || "0");

export function lire({ vault: option } = {}) {
  const vault = resoudreVault(option);
  controler(vault);
  integrer(vault);
  return "VAULT À JOUR — " + court(git(vault, "rev-parse", "HEAD").out) + (enAvance(vault) ? " ; " + enAvance(vault) + " commit(s) local(aux) à envoyer" : "");
}

export function envoyer({ vault: option, message, chemins = [] } = {}) {
  const vault = resoudreVault(option);
  controler(vault);
  if (chemins.length) {
    if (!message) stop("VAULT BLOQUÉ", "message de commit requis (-m)");
    const relatifs = chemins.map((c) => {
      const brut = c.startsWith("vault:") ? c.slice("vault:".length) : c;
      const absolu = path.isAbsolute(brut) ? brut : path.join(vault, brut);
      const relatif = path.relative(vault, reel(absolu));
      if (!relatif || relatif.startsWith("..") || path.isAbsolute(relatif)) stop("VAULT BLOQUÉ", "fichier hors du vault : " + c);
      return relatif.split(path.sep).join("/");
    });
    const ajout = git(vault, "add", "-A", "--", ...relatifs);
    if (ajout.code) stop("VAULT BLOQUÉ", "ajout impossible : " + derniere(ajout.err));
    if (git(vault, "diff", "--cached", "--quiet").code) {
      const commit = git(vault, "commit", "-q", "-m", message);
      if (commit.code) {
        const identite = /tell me who you are|user\.(name|email)|identity/i.test(commit.err);
        stop("VAULT BLOQUÉ", identite ? "identité Git absente (user.name et user.email)" : "commit impossible : " + derniere(commit.err || commit.out));
      }
    }
  }
  if (!enAvance(vault)) return "RIEN À ENVOYER — " + vault;
  for (let tentative = 1; tentative <= TENTATIVES; tentative++) {
    const push = git(vault, "push", "-q");
    if (push.code === 0) return "VAULT SYNCHRONISÉ — " + court(git(vault, "rev-parse", "HEAD").out) + " (" + tentative + " tentative" + (tentative > 1 ? "s" : "") + ")";
    const refuse = /rejected|fetch first|non-fast-forward/i.test(push.err);
    if (!refuse) stop("VAULT REFUSÉ", "envoi impossible : " + derniere(push.err || push.out) + " ; commit local " + court(git(vault, "rev-parse", "HEAD").out) + " conservé");
    if (tentative < TENTATIVES) integrer(vault);
  }
  stop("VAULT REFUSÉ", "envoi refusé après " + TENTATIVES + " tentatives ; commit local " + court(git(vault, "rev-parse", "HEAD").out) + " conservé");
}

// ---------- ligne de commande ----------

function main(argv) {
  const [commande, ...args] = argv;
  const options = { chemins: [] };
  const debut = Date.now();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-m" || args[i] === "--message") options.message = args[++i];
    else if (args[i] === "--vault") options.vault = args[++i];
    else options.chemins.push(args[i]);
  }
  try {
    let ligne;
    if (commande === "lire") ligne = lire(options);
    else if (commande === "envoyer") ligne = envoyer(options);
    else { console.error("Usage : vault.mjs lire | envoyer -m \"<message>\" <fichiers…> [--vault <chemin>]"); process.exit(64); }
    console.log(ligne);
  } catch (e) {
    if (!(e instanceof Arret)) throw e;
    const ligne = e.titre + " — " + e.message;
    console.log(ligne);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) main(process.argv.slice(2));
