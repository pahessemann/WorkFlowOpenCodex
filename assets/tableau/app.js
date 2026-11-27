/* Tableau de bord $dev : lit /api/point et /api/chats, rafraîchit, n’écrit jamais. */
(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const gras = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const heure = (iso) => iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
  const dateCourte = (iso) => iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  const classeEtat = (l) => /^⏸/.test(l || '') ? 'toi-attend' : /^⛔/.test(l || '') ? 'bloque' : /^⏳/.test(l || '') ? 'attente' : '';
  let periode = 60, restant = 60, enCours = false;

  // Markdown minimal du champ rendu : titres en gras, tableaux, paragraphes.
  function markdown(t) {
    const lignes = String(t || '').split('\n'); let html = '', table = [];
    const videTable = () => { if (!table.length) return; const rows = table.filter((r) => !/^\|\s*:?-{2,}/.test(r)).map((r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())); html += '<table><thead><tr>' + rows[0].map((c) => '<th>' + gras(c) + '</th>').join('') + '</tr></thead><tbody>' + rows.slice(1).map((r) => '<tr>' + r.map((c) => '<td>' + gras(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>'; table = []; };
    for (const l of lignes) { if (/^\|/.test(l)) { table.push(l); continue; } videTable(); if (!l.trim()) continue; html += /^- /.test(l) ? '<p class="puce">' + gras(l) + '</p>' : '<p>' + gras(l) + '</p>'; }
    videTable(); return html;
  }

  function bandeau(texte, attente) { const b = $('#bandeau'); if (!texte) { b.hidden = true; return; } b.hidden = false; b.textContent = texte; b.className = 'bandeau' + (attente ? ' attente' : ''); }

  function afficherPoint(r) {
    const p = r.point; if (!p) return;
    $('#releve').textContent = 'relevé à ' + heure(r.releve_le) + (p.ressources?.hote ? ' · données d’' + esc(p.ressources.hote) : '');
    const actions = $('#actions'); actions.innerHTML = p.actions_paul?.length ? p.actions_paul.map((a, i) => '<li>' + esc(a.action) + ' <span class="issues">' + esc((a.issues || []).join(', ')) + (a.campagne ? ' · ' + esc(a.campagne) : '') + '</span></li>').join('') : '<li class="vide">Rien.</li>';
    $('#ligne-point').textContent = p.ligne_etat || '';
    $('#campagnes').innerHTML = (p.campagnes || []).map((c) => {
      const pct = c.total ? Math.round(100 * (c.closes || 0) / c.total) : 0; const e = c.estimation || {}; const fourchette = (f) => Array.isArray(f) ? (f[0] === f[1] ? f[0] + ' h' : f[0] + ' à ' + f[1] + ' h') : 'non mesurable';
      return '<article class="campagne"><div class="nom"><span>' + esc(c.campagne) + '</span><small>' + esc(c.mode || '') + ' · ' + esc(c.statut || '') + '</small></div>'
        + '<div class="barre"><i style="width:' + pct + '%"></i></div><div class="estimation">' + (c.closes || 0) + '/' + (c.total || 0) + ' closes (' + pct + ' %) · clôtures 24 h : ' + (c.closes_24h || 0) + ' · temps restant : ' + fourchette(e.si_actions_faites) + (e.fiabilite ? ' (estimation ' + esc(e.fiabilite) + ')' : '') + (c.places ? ' · places ' + c.places.occupees + '/' + c.places.max : '') + '</div>'
        + '<div class="etat ' + classeEtat(c.ligne_etat) + '">' + esc(c.ligne_etat || '') + '</div>'
        + (c.bloc ? '<p class="bloc">' + gras(c.bloc) + '</p>' : '') + '</article>';
    }).join('') || '<p class="vide">Aucune campagne en cours.</p>';
    const arrets = (p.campagnes || []).flatMap((c) => (c.arrets || []).map((a) => ({ ...a, campagne: c.campagne })));
    const qui = { paul: '👤 Toi', agents: '🤖 agents', poste: '🪟 poste', env: '🌐 environnement' };
    $('#blocages').innerHTML = arrets.length ? arrets.map((a) => '<li class="bloc-item"><span class="qui">' + (qui[a.attend] || esc(a.attend || 'à qualifier')) + '</span> <strong>' + esc(a.issue || a.linear_id || '') + '</strong> · ' + esc(a.campagne) + ' — ' + esc(a.quoi || a.cause || '') + '</li>').join('') : '<li class="vide">Aucun.</li>';
    const R = p.ressources || {}; const dl = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('');
    $('#ressources').innerHTML = dl({ 'hôte': R.hote, 'RAM libre': R.ram_libre_gio !== undefined ? R.ram_libre_gio + ' Gio' : null, 'disque libre': R.disque_libre_gio !== undefined ? R.disque_libre_gio + ' Gio' + (R.disque_seuil_gio ? ' (seuil ' + R.disque_seuil_gio + ')' : '') : null, 'charge 1 min': R.charge_1min !== undefined ? R.charge_1min + (R.coeurs ? ' pour ' + R.coeurs + ' cœurs' : '') : null, 'attente CPU 60 s': R.pression_cpu_60s !== undefined ? R.pression_cpu_60s + ' %' : null, 'sauvegarde': R.volume?.sauvegarde ? R.volume.sauvegarde.resultat + ' (' + R.volume.sauvegarde.le + ')' : null });
    const A = p.abonnement || {}; const rz = (iso) => iso ? 'remise à zéro ' + dateCourte(iso) : '';
    $('#abonnement').innerHTML = dl({ 'Anthropic': A.anthropic ? A.anthropic.pct + ' % (compte ' + A.anthropic.compte + ', ' + rz(A.anthropic.remise) + ')' : null, 'vitesse': A.vitesse_pt_h !== undefined && A.vitesse_pt_h !== null ? A.vitesse_pt_h + ' pt/h' : null, 'Codex': A.codex ? A.codex.pct + ' % (' + rz(A.codex.remise) + ')' : null, 'Fable': A.fable_pct !== null && A.fable_pct !== undefined ? A.fable_pct + ' %' : null, 'fournisseur': A.mode ? A.mode + (A.effectif && A.effectif !== A.mode ? ' → ' + A.effectif : '') : null, 'conseil': A.conseil });
    $('#rendu').innerHTML = markdown(p.rendu);
  }

  function afficherChats(r) {
    const tb = $('#chats tbody'); const chats = r.chats || [];
    $('#nb-chats').textContent = chats.length + (r.atelier_injoignable ? ' · atelier injoignable, registre du poste seulement' : '');
    tb.innerHTML = chats.map((c) => '<tr><td class="titre-chat">' + esc(c.titre) + (c.statut !== 'actif' ? ' <span class="badge">' + esc(c.statut) + '</span>' : '') + '</td><td>' + esc(c.hote) + '</td><td>' + esc(c.dossier || '') + '</td><td class="ligne-chat ' + classeEtat(c.ligne_etat) + '">' + (c.ligne_etat ? esc(c.ligne_etat) : '<span class="nr">non relevée</span>') + '</td><td>' + dateCourte(c.ligne_etat_le) + '</td></tr>').join('') || '<tr><td colspan="5" class="vide">Aucun chat ouvert au registre.</td></tr>';
  }

  async function rafraichir() {
    if (enCours) return; enCours = true; $('#compte').textContent = 'relevé en cours…';
    try {
      const [v, p, c] = await Promise.all([fetch('/api/version').then((x) => x.json()), fetch('/api/point').then((x) => x.json()), fetch('/api/chats').then((x) => x.json())]);
      $('#version').textContent = 'v' + v.version; periode = Number(v.rafraichissement_s) || 60;
      afficherPoint(p); afficherChats(c);
      const erreurs = [p.erreur ? 'point : ' + p.erreur : null, c.erreur ? 'chats : ' + c.erreur : null, c.atelier_injoignable ? 'ATELIER INJOIGNABLE — ' + c.atelier_injoignable : null].filter(Boolean);
      bandeau(erreurs.length ? erreurs.join(' · ') + (p.point ? ' (derniers chiffres conservés)' : '') : '', !!p.point);
    } catch (e) { bandeau('Serveur du tableau injoignable : ' + e.message + ' — relancer node pilote.mjs tableau servir', false); }
    restant = periode; enCours = false;
  }
  setInterval(() => { restant -= 1; if (restant <= 0) rafraichir(); else if (!enCours) $('#compte').textContent = 'prochain relevé dans ' + restant + ' s'; }, 1000);
  rafraichir();
})();

