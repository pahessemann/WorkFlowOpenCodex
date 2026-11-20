import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "validate-project.mjs",
);

const remplir = (tpl) => tpl.replace(/{{PROJECT_NAME}}/g, "Test").replace(/{{[A-Z_]+}}/g, "Aucune.");

function agentsWithUnit(unitContract) {
  return `# AGENTS.md — Test

## Unité de travail

${unitContract}

## Données legacy

L'application ne se connecte jamais directement à une base SQL Server legacy.
Une investigation explicitement autorisée reste en lecture seule.
`;
}

function projectWithExceptions(exceptions = "- Aucune exception.") {
  return `# PROJECT.md — Test

- État : \`RACCORDEMENT\`

## Identité et raccordements

- Projet : test

## Exécution

- Environnement : local

## Gates de validation

- Sans objet — projet en raccordement.

## Surfaces sensibles

- Sans objet — projet en raccordement.

## Exceptions propres au projet

${exceptions}
`;
}

async function runValidator(agents, project) {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "validate-project-"));
  try {
    await writeFile(join(fixtureRoot, "AGENTS.md"), agents, "utf8");
    await writeFile(join(fixtureRoot, "PROJECT.md"), project, "utf8");

    const execution = spawnSync(process.execPath, [scriptPath, fixtureRoot], {
      encoding: "utf8",
    });
    const result = JSON.parse(execution.stdout);
    return { execution, result };
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}

function uniteCheck(result) {
  return result.checks.find((item) => item.name === "unite-travail");
}

test("accepte le modèle canonique généré pour un nouveau projet", async () => {
  const template = await readFile(new URL("../templates/AGENTS.projet.md", import.meta.url), "utf8");
  const agents = remplir(template);
  const { execution, result } = await runValidator(agents, projectWithExceptions());
  assert.equal(execution.status, 0, JSON.stringify(result.checks));
  assert.equal(result.status, "READY");
  assert.equal(result.checks.find((item) => item.name === "aucun-chemin-absolu")?.status, "PASS");
});

test("accepte un document du vault nommé runbook mais refuse un runbook comme règle", async () => {
  const template = await readFile(new URL("../templates/AGENTS.projet.md", import.meta.url), "utf8");
  const agents = remplir(template);
  const contexte = (r) => r.checks.find((item) => item.name === "aucun-contexte-historique")?.status;
  const document = await runValidator(agents, projectWithExceptions("- Procédure sandbox : `vault:apps/existant/test/runbook-maj-sandbox.md`"));
  assert.equal(contexte(document.result), "PASS", "un document du vault nommé runbook est accepté");
  const regle = await runValidator(agents, projectWithExceptions("- Suivre le runbook FlowPilot pour chaque issue."));
  assert.equal(contexte(regle.result), "FAIL", "un runbook comme règle active reste refusé");
});

test("signale un chemin propre à un poste sans bloquer le projet", async () => {
  const template = await readFile(new URL("../templates/AGENTS.projet.md", import.meta.url), "utf8");
  const agents = remplir(template);
  const { execution, result } = await runValidator(
    agents,
    projectWithExceptions("- Vault : `/Users/quelquun/vault-obsidian/apps/projets/test`"),
  );
  assert.equal(execution.status, 0);
  assert.equal(result.status, "READY");
  const absolute = result.checks.find((item) => item.name === "aucun-chemin-absolu");
  assert.equal(absolute?.status, "AVERTISSEMENT");
  assert.match(absolute?.detail ?? "", /\/Users\/quelquun/);
});

test("refuse un AGENTS.md qui cite encore un ancien workflow", async () => {
  const { execution, result } = await runValidator(
    "# AGENTS.md — Test\n\nWorkflow : `$dev` v2.2 (skill personnel).\nUne issue est lancée par le chef de projet de l’ancien workflow.\n",
    projectWithExceptions(),
  );
  assert.equal(execution.status, 1);
  assert.equal(result.checks.find((i) => i.name === "aucun-ancien-workflow")?.status, "FAIL");
});

test("refuse un AGENTS.md de plus de 60 lignes ou sans renvoi au workflow", async () => {
  const long = "# AGENTS.md — Test\n" + "- règle\n".repeat(70);
  const { result } = await runValidator(long, projectWithExceptions());
  assert.equal(result.checks.find((i) => i.name === "agents-court")?.status, "FAIL");
  assert.equal(result.checks.find((i) => i.name === "renvoi-workflow")?.status, "FAIL");
});
