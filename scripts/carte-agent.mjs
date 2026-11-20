#!/usr/bin/env node
// carte-agent.mjs — complète en arrière-plan une carte de dépôt « squelette » avec un sous-agent Haiku (2 000 tokens maximum).
// Usage : node carte-agent.mjs <poste.local.json> <projet>   (lancé détaché par pilote.mjs ouvrir ou pilote.mjs carte)
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { spawnSync } from 'node:child_process';
process.env.PILOTE_CONFIG = process.argv[2];
const P = await import('./pilote.mjs');
const cfg = P.lireConfig(process.argv[2]); const nom = process.argv[3]; const projet = cfg.projets[nom];
const carte = path.join(cfg.etat, 'carte', nom + '.md'); const journal = carte + '.agent.log';
const log = (m) => fs.appendFileSync(journal, new Date().toISOString() + ' ' + m + '\n');
try {
  const git = (...a) => (spawnSync('git', ['-C', projet.chemin, ...a], { encoding: 'utf8', windowsHide: true }).stdout || '').trim();
  const fichiers = git('ls-files').split('\n').filter(Boolean).filter((f) => !/(^|\/)(node_modules|dist|bin|obj|vendor|\.git)\//.test(f));
  const dossiers = {}; for (const f of fichiers) { const p = f.split('/'); const k = p.length > 2 ? p.slice(0, 2).join('/') + '/' : p.length === 2 ? p[0] + '/' : '(racine)'; dossiers[k] = (dossiers[k] || 0) + 1; }
  const arbo = Object.entries(dossiers).sort((a, b) => b[1] - a[1]).slice(0, 60).map(([d, n]) => d + ' (' + n + ')').join('\n');
  const manifestes = fichiers.filter((f) => /(^|\/)(package\.json|[^/]+\.csproj|[^/]+\.sln|pyproject\.toml|requirements\.txt|go\.mod|Cargo\.toml|docker-compose[^/]*\.ya?ml|Dockerfile|vite\.config\.[mc]?[jt]s|playwright\.config\.[mc]?[jt]s|vitest\.config\.[mc]?[jt]s)$/.test(f)).slice(0, 25);
  const lire = (f, max) => { try { const t = fs.readFileSync(path.join(projet.chemin, f), 'utf8'); return t.length > max ? t.slice(0, max) + '\n[…tronqué]' : t; } catch { return ''; } };
  const projetMd = lire('PROJECT.md', 9000);
  const gates = projetMd.split('\n').filter((l) => /(final|conditionnelle):|test/i.test(l) && l.includes('|')).slice(0, 25).join('\n');
  const consigne = ['Tu es un sous-agent lecteur. Rédige la carte de dépôt de « ' + nom + ' » en Markdown, 2 000 tokens au maximum, en français.',
    'Sections : 1. Rôle du dépôt (2 lignes) ; 2. Stack et versions ; 3. Arborescence utile (dossiers clés, où vit quoi) ; 4. Commandes : installer, construire, tester (ciblé et complet), lancer ; 5. Conventions et pièges visibles ; 6. Points d’entrée pour une issue.',
    'N’invente rien : n’utilise que les éléments ci-dessous. Ne lance aucune commande. Réponds uniquement par la carte, en commençant par « # Carte de dépôt — ' + nom + ' ».',
    '', '## Arborescence (fichiers suivis, hors dépendances et builds)', arbo,
    '', '## Manifestes', ...manifestes.map((f) => '### ' + f + '\n' + lire(f, 2500)),
    '', '## Commandes de test et gates (PROJECT.md)', gates || 'aucune',
    '', '## PROJECT.md', projetMd || 'absent'].join('\n');
  const sortie = path.join(os.tmpdir(), 'carte-' + nom + '-' + process.pid + '.md');
  const modele = P.catalogue(cfg, cfg.modeles.lecteur?.jusqu_a_100k || 'claude-haiku-5-5');
  log('début · modèle ' + modele + ' · ' + consigne.length + ' caractères de contexte');
  const r = spawnSync(cfg.codexExecutable || 'codex', ['exec', '--ephemeral', '--skip-git-repo-check', '-s', 'read-only', '-m', modele, '-C', os.tmpdir(), '-o', sortie], { input: consigne, encoding: 'utf8', windowsHide: true, timeout: 15 * 60000 });
  const texte = fs.existsSync(sortie) ? fs.readFileSync(sortie, 'utf8').trim() : '';
  fs.rmSync(sortie, { force: true });
  if (r.status !== 0 || !texte.startsWith('# Carte de dépôt')) { log('échec · code ' + r.status + ' · ' + (r.stderr || '').slice(-300).replace(/\s+/g, ' ')); process.exit(1); }
  if (texte.length > 9000) { log('refus · carte trop longue (' + texte.length + ' caractères, plus de 2 000 tokens)'); process.exit(1); }
  const entete = texte.split('\n')[0] + '\n\nStatut : complète (sous-agent ' + modele + ', ' + new Date().toISOString().slice(0, 16) + ')\n';
  fs.writeFileSync(carte + '.tmp', entete + texte.split('\n').slice(1).join('\n') + '\n'); fs.renameSync(carte + '.tmp', carte);
  log('fin · carte complète, ' + texte.length + ' caractères');
} catch (e) { log('erreur · ' + e.message); process.exit(1); }

