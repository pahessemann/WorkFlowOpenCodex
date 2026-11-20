#!/usr/bin/env node
// Joue evals/evals.json contre pilote.mjs, chaque cas avec un état neuf.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const racine = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pilote = path.join(racine, 'scripts', 'pilote.mjs');
const { cas } = JSON.parse(fs.readFileSync(path.join(racine, 'evals', 'evals.json'), 'utf8'));
const base = () => ({ hote: 'local', deploiement_serveurs: true, admission: { dev_max: 4, lourdes_max: 1 },
  modeles: { cerveau: 'claude-opus-5-5', dev: ['claude-opus-5-5', 'claude-sonnet-5-5'], controle: ['claude-sonnet-5-5', 'gpt-6.2-sol'], ouvrier: ['claude-haiku-5-5', 'gpt-6-luna'],
    lecteur: { jusqu_a_100k: 'claude-haiku-5-5', au_dela: 'claude-sonnet-5-5', fallback: 'gpt-6.1-terra' }, second_regard: 'gpt-6.2-astra', recours: 'claude-fable-5-1', oeil: 'claude-fable-5-1',
    reserve_paul: ['claude-fable-5-2'], sous_agents: ['claude-haiku-5-5', 'claude-opus-5-5', 'claude-fable-5-1', 'gpt-6-luna'], fable_autorise: false } });
let ok = 0; const echecs = [];
for (const c of cas) {
  const etat = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-'));
  const cfg = { ...base(), etat };
  for (const [k, v] of Object.entries(c.config || {})) { if (v === null) delete cfg[k]; else if (k === 'modeles') Object.assign(cfg.modeles, v); else cfg[k] = v; }
  const f = path.join(etat, 'poste.local.json'); fs.writeFileSync(f, JSON.stringify(cfg));
  const run = (argv) => spawnSync(process.execPath, [pilote, ...argv], { encoding: 'utf8', env: { ...process.env, PILOTE_CONFIG: f } });
  for (const a of c.avant || []) { if (Array.isArray(a)) run(a); else { fs.mkdirSync(path.dirname(path.join(etat, a.fichier)), { recursive: true }); fs.writeFileSync(path.join(etat, a.fichier), a.contenu ?? '# contrat\n'); } }
  const r = run(c.argv); const sortie = (r.stdout || '') + (r.stderr || '');
  const bon = r.status === c.attendu.code && sortie.includes(c.attendu.contient);
  if (bon) ok++; else echecs.push(c.id + ' : code ' + r.status + ' (attendu ' + c.attendu.code + ') ; ' + sortie.trim().slice(0, 160));
  fs.rmSync(etat, { recursive: true, force: true });
}
console.log(JSON.stringify({ total: cas.length, reussis: ok, echecs }, null, 2));
process.exitCode = echecs.length ? 1 : 0;

