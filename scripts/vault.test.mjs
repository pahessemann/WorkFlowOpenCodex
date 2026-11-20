import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "vault.mjs");
// core.autocrlf=false : les dépôts de test gardent les fins de ligne telles quelles, sous Windows comme sous Linux.
const identite = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.autocrlf", GIT_CONFIG_VALUE_0: "false" };

function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...identite } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

// Un vault distant et deux postes qui l'ont cloné.
function fixture(t) {
  const racine = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), "vault-")));
  t.after(() => fs.rmSync(racine, { recursive: true, force: true }));
  const origin = path.join(racine, "origin.git");
  const graine = path.join(racine, "graine");
  git(racine, "init", "-q", "--bare", "-b", "main", origin);
  git(racine, "init", "-q", "-b", "main", graine);
  fs.writeFileSync(path.join(graine, "a.md"), "ligne a\n");
  fs.writeFileSync(path.join(graine, "b.md"), "ligne b\n");
  git(graine, "add", ".");
  git(graine, "commit", "-q", "-m", "départ");
  git(graine, "remote", "add", "origin", origin);
  git(graine, "push", "-q", "-u", "origin", "main");
  const poste = (nom) => { const d = path.join(racine, nom); git(racine, "clone", "-q", origin, d); return d; };
  return { racine, origin, A: poste("A"), B: poste("B") };
}

function vault(dossier, args) {
  const r = spawnSync(process.execPath, [script, ...args, "--vault", dossier], { cwd: dossier, encoding: "utf8", env: { ...process.env, ...identite } });
  return { code: r.status, ligne: (r.stdout || "").trim(), err: r.stderr };
}
const ecrire = (d, f, texte) => fs.writeFileSync(path.join(d, f), texte);
const pousser = (d, f, texte, message) => { ecrire(d, f, texte); git(d, "commit", "-qam", message); git(d, "push", "-q"); };
const avance = (d) => git(d, "rev-list", "--count", "@{upstream}..HEAD");

test("lire récupère les écritures des autres postes", (t) => {
  const f = fixture(t);
  pousser(f.B, "b.md", "écrit par B\n", "B écrit");
  const r = vault(f.A, ["lire"]);
  assert.equal(r.code, 0, r.ligne + r.err);
  assert.match(r.ligne, /^VAULT À JOUR — /);
  assert.equal(fs.readFileSync(path.join(f.A, "b.md"), "utf8"), "écrit par B\n");
});

test("envoyer n'enregistre que les fichiers indiqués", (t) => {
  const f = fixture(t);
  ecrire(f.A, "a.md", "note A\n");
  ecrire(f.A, "b.md", "brouillon non destiné au vault\n");
  const r = vault(f.A, ["envoyer", "-m", "Note A", path.join(f.A, "a.md")]);
  assert.equal(r.code, 0, r.ligne + r.err);
  assert.match(r.ligne, /^VAULT SYNCHRONISÉ — \w+ \(1 tentative\)$/);
  assert.deepEqual(git(f.A, "show", "--name-only", "--format=", "HEAD").split("\n"), ["a.md"]);
  assert.match(git(f.A, "status", "--porcelain"), /b\.md/);
});

test("un envoi refusé sans conflit est intégré puis renvoyé", (t) => {
  const f = fixture(t);
  pousser(f.B, "b.md", "écrit par B\n", "B écrit");
  ecrire(f.A, "a.md", "note A\n");
  const r = vault(f.A, ["envoyer", "-m", "Note A", path.join(f.A, "a.md")]);
  assert.equal(r.code, 0, r.ligne + r.err);
  assert.match(r.ligne, /^VAULT SYNCHRONISÉ — \w+ \(2 tentatives\)$/);
  assert.equal(avance(f.A), "0");
  assert.equal(git(f.origin, "log", "-1", "--format=%s", "main"), "Note A");
  assert.equal(git(f.origin, "log", "-2", "--format=%s", "main").split("\n")[1], "B écrit");
});

test("un vrai conflit est annulé et le commit local conservé", (t) => {
  const f = fixture(t);
  pousser(f.B, "a.md", "version B\n", "B modifie a");
  ecrire(f.A, "a.md", "version A\n");
  const r = vault(f.A, ["envoyer", "-m", "A modifie a", path.join(f.A, "a.md")]);
  assert.equal(r.code, 1);
  assert.match(r.ligne, /^VAULT EN CONFLIT — a\.md ; mise à jour annulée, commit local \w+ conservé$/);
  assert.equal(fs.existsSync(path.join(f.A, ".git", "rebase-merge")), false, "aucun rebase laissé en cours");
  assert.equal(git(f.A, "log", "-1", "--format=%s"), "A modifie a");
  assert.equal(fs.readFileSync(path.join(f.A, "a.md"), "utf8"), "version A\n");
  assert.equal(git(f.origin, "log", "-1", "--format=%s", "main"), "B modifie a", "rien n'est forcé");
});

test("un commit local en attente est renvoyé sans nouveau fichier", (t) => {
  const f = fixture(t);
  ecrire(f.A, "a.md", "note A\n");
  git(f.A, "commit", "-qam", "Note en attente");
  pousser(f.B, "b.md", "écrit par B\n", "B écrit");
  const r = vault(f.A, ["envoyer"]);
  assert.equal(r.code, 0, r.ligne + r.err);
  assert.match(r.ligne, /^VAULT SYNCHRONISÉ — \w+ \(2 tentatives\)$/);
  assert.match(vault(f.A, ["envoyer"]).ligne, /^RIEN À ENVOYER — /);
});

test("fichier hors du vault, rebase en cours ou HEAD détachée bloquent", (t) => {
  const f = fixture(t);
  const dehors = path.join(f.racine, "dehors.md");
  fs.writeFileSync(dehors, "x\n");
  assert.match(vault(f.A, ["envoyer", "-m", "x", dehors]).ligne, /^VAULT BLOQUÉ — fichier hors du vault/);
  fs.mkdirSync(path.join(f.A, ".git", "rebase-merge"));
  assert.match(vault(f.A, ["lire"]).ligne, /^VAULT BLOQUÉ — rebase ou fusion déjà en cours/);
  fs.rmdirSync(path.join(f.A, ".git", "rebase-merge"));
  git(f.A, "checkout", "-q", "--detach");
  assert.match(vault(f.A, ["lire"]).ligne, /^VAULT BLOQUÉ — HEAD détachée/);
});

test("un chemin relatif ou vault: part de la racine du vault, pas du dossier courant", (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.A, "apps", "projets"), { recursive: true });
  ecrire(f.A, "apps/projets/accueil.md", "accueil\n");
  ecrire(f.A, "b.md", "note B\n");
  // Lancé depuis un autre dossier, comme le pilote l'est depuis la racine du skill.
  const r = spawnSync(process.execPath, [script, "envoyer", "-m", "Notes", "apps/projets/accueil.md", "vault:b.md", "--vault", f.A], { cwd: f.racine, encoding: "utf8", env: { ...process.env, ...identite } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout.trim(), /^VAULT SYNCHRONISÉ — /);
  assert.deepEqual(git(f.A, "show", "--name-only", "--format=", "HEAD").split("\n").sort(), ["apps/projets/accueil.md", "b.md"]);
  assert.match(vault(f.A, ["envoyer", "-m", "x", "../dehors.md"]).ligne, /^VAULT BLOQUÉ — fichier hors du vault : \.\.\/dehors\.md$/);
});
