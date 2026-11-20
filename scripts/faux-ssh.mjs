#!/usr/bin/env node
// Faux ssh pour les tests de livraison : journalise chaque appel, échoue selon le scénario.
import fs from 'node:fs';
const sc = JSON.parse(fs.readFileSync(process.env.FAUX_SSH_SCENARIO, 'utf8'));
const args = process.argv.slice(2); const commande = args.at(-1); const alias = args.at(-2);
fs.appendFileSync(sc.journal, JSON.stringify({ alias, commande }) + '\n');
if ((sc.injoignables || []).includes(alias) && commande === 'true') { process.stderr.write('Permission denied (publickey)'); process.exit(255); }
for (const motif of sc.echecs || []) if (commande.includes(motif)) { process.stderr.write('erreur simulée : ' + motif); process.exit(1); }
if (commande.startsWith('df -Pk')) { console.log('/dev/sda1 100000000 50000000 ' + (sc.libre_ko ?? 20000000) + ' 50% /'); process.exit(0); }
if (commande === 'cat /srv/VERSION') { console.log(sc.version || '1.2.3'); process.exit(0); }
if (commande.startsWith('curl')) { console.log(sc.sante || 'ok'); process.exit(0); }
console.log('ok'); process.exit(0);

