#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(process.argv[2] || ".");
const override = resolve(projectRoot, "AGENTS.override.md");
const paths = {
  // Fichier effectif lu par Codex : AGENTS.override.md (non versionné) s'il existe.
  agents: existsSync(override) ? override : resolve(projectRoot, "AGENTS.md"),
  project: resolve(projectRoot, "PROJECT.md")
};

const checks = [];
function check(name, condition, detail) {
  checks.push({ name, status: condition ? "PASS" : "FAIL", detail });
}

// Contrôle non bloquant tant que les projets existants n'ont pas été mis à niveau.
function warn(name, condition, detail) {
  checks.push({ name, status: condition ? "PASS" : "AVERTISSEMENT", detail });
}

function extractSection(markdown, heading) {
  const marker = `## ${heading}`;
  const start = markdown.indexOf(marker);
  if (start === -1) return "";

  const contentStart = start + marker.length;
  const remainder = markdown.slice(contentStart);
  const nextHeading = remainder.search(/\n##\s+/u);
  return nextHeading === -1 ? remainder : remainder.slice(0, nextHeading);
}

function normalizeContract(markdown) {
  return markdown
    .replaceAll("’", "'")
    .replace(/\s+/gu, " ")
    .trim();
}

check("agents-present", existsSync(paths.agents), paths.agents);
check("project-present", existsSync(paths.project), paths.project);

const agents = existsSync(paths.agents) ? readFileSync(paths.agents, "utf8") : "";
const project = existsSync(paths.project) ? readFileSync(paths.project, "utf8") : "";
const combined = `${agents}\n${project}`;

check("aucun-token", !/{{[^{}]+}}/.test(combined), "Aucun placeholder ne doit subsister.");
const absolutePaths = [...combined.matchAll(/(?:^|[\s`(<"'])((?:\/Users\/|\/home\/|~\/|[A-Za-z]:\\)[^\s`)>"']*)/gmu)]
  .map((match) => match[1]);
warn(
  "aucun-chemin-absolu",
  absolutePaths.length === 0,
  absolutePaths.length === 0
    ? "Aucun chemin propre à un poste."
    : `Chemins propres à un poste à remplacer par vault: : ${absolutePaths.slice(0, 3).join(", ")}`,
);
check(
  "aucun-contexte-historique",
  // « runbook » reste refusé comme règle active, sauf dans le nom d'un document
  // de référence du vault (ex. runbook-maj-sandbox-docker.md).
  !/\bexpert(?:s)?\b|spécialiste|specialiste|AGENTS\.legacy|\.codex\/workflow|runbook(?![\w-]*\.md\b)/iu.test(combined),
  "Les contrats générés ne chargent aucun ancien workflow ou profil personnalisé."
);
check(
  "agents-court",
  agents.split(/\r?\n/u).length <= 60,
  "AGENTS.md effectif de 60 lignes au maximum, limité à ce qui est propre au projet."
);
check(
  "renvoi-workflow",
  /\$dev\x60?\s*v2\.2/u.test(agents),
  "Renvoi court au workflow : « Workflow : $dev v2.2 (skill personnel). Rien n’est déclenché sans commande $dev explicite. »"
);
check(
  "aucun-ancien-workflow",
  !/chef de projet|chef-projet|exécutif|executif|\$dev execution/iu.test(agents),
  "Aucune mention d’un ancien workflow, d’un chef de projet ou d’un exécutif."
);
warn(
  "donnees-legacy",
  /ne se connecte jamais directement à une\s+base SQL Server legacy/iu.test(combined) || !/legacy/iu.test(combined),
  "Si le projet touche des données legacy, distinguer l’accès runtime de l’investigation en lecture seule."
);
check(
  "sections-project",
  ["## Identité et raccordements", "## Exécution", "## Gates de validation", "## Surfaces sensibles"]
    .every((heading) => project.includes(heading)),
  "PROJECT.md doit conserver ses quatre surfaces de configuration."
);

const state = project.match(/- État\s*:\s*`([^`]+)`/iu)?.[1] || "ABSENT";
check(
  "etat-valide",
  ["RACCORDEMENT", "PRET_POUR_DEVELOPPEMENT"].includes(state),
  `État observé : ${state}`
);

if (state === "PRET_POUR_DEVELOPPEMENT") {
  check(
    "aucune-valeur-en-attente",
    !/PENDING|À compléter avant développement|A definir avant developpement/iu.test(project),
    "Un projet prêt ne peut conserver aucune configuration en attente."
  );
  check(
    "gates-finales",
    ["final:diff", "final:lint", "final:types", "final:tests", "final:build", "final:security"]
      .every((gate) => project.includes(`\`${gate}\``)),
    "Toutes les gates finales doivent être renseignées ou déclarées sans objet avec une raison."
  );
  check(
    "bootstrap-worktree",
    /- Bootstrap attendu\s*:\s*`[^`]+`/iu.test(project) &&
      /- Reprise (?:pré-GO|de préflight) autorisée\s*:\s*`[^`]+`/iu.test(project),
    "Le résultat du bootstrap et sa reprise de préflight doivent être déclarés."
  );
  check(
    "convention-environnements",
    /- Convention des fichiers d’environnement\s*:[^\n]*\.env\.example[^\n]*\.env\.local[^\n]*\.env\.sandbox[^\n]*\.env\.production[^\n]*\.env[^\n]*interdit/iu.test(project),
    "La convention commune .env.example, .env.local, .env.sandbox et .env.production doit être déclarée ; .env est interdit."
  );
}

const result = {
  status: checks.some((item) => item.status === "FAIL") ? "BLOCKED" : "READY",
  project_root: projectRoot,
  project_state: state,
  checks
};

console.log(JSON.stringify(result, null, 2));
if (result.status !== "READY") process.exitCode = 1;
