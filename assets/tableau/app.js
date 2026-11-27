/* Tableau de bord $dev : lit /api/point, /api/chats, /api/campagnes ; les actions (3.4) passent par POST /api/action avec le jeton de session. */
(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const gras = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const heure = (iso) => iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
  const dateCourte = (iso) => iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  const classeEtat = (l) => /^⏸/.test(l || '') ? 'toi-attend' : /^⛔/.test(l || '') ? 'bloque' : /^⏳/.test(l || '') ? 'attente' : '';
  let periode = 60, restant = 60, enCours = false, version = {}, campagnesInfo = [], abonnement = null;

  // Jeton de session : porté par l’URL ouverte depuis AIDE, gardé pour la session de l’onglet, retiré de la barre d’adresse.
  const params = new URLSearchParams(location.search); if (params.get('jeton')) { sessionStorage.setItem('jeton', params.get('jeton')); history.replaceState(null, '', location.pathname); }
  const jeton = () => sessionStorage.getItem('jeton') || '';

  function markdown(t) {
    const lignes = String(t || '').split('\n'); let html = '', table = [];
    const videTable = () => { if (!table.length) return; const rows = table.filter((r) => !/^\|\s*:?-{2,}/.test(r)).map((r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())); html += '<table><thead><tr>' + rows[0].map((c) => '<th>' + gras(c) + '</th>').join('') + '</tr></thead><tbody>' + rows.slice(1).map((r) => '<tr>' + r.map((c) => '<td>' + gras(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>'; table = []; };
    for (const l of lignes) { if (/^\|/.test(l)) { table.push(l); continue; } videTable(); if (!l.trim()) continue; html += '<p>' + gras(l) + '</p>'; }
    videTable(); return html;
  }
  function bandeau(texte, attente) { const b = $('#bandeau'); if (!texte) { b.hidden = true; return; } b.hidden = false; b.textContent = texte; b.className = 'bandeau' + (attente ? ' attente' : ''); }

  // ---------- actions ----------
  async function agir(corps, bouton) {
    if (!jeton()) { montrer({ ok: false, refus: 'JETON ABSENT', message: 'ouvre le tableau depuis AIDE ($dev tableau)' }, corps.action); return null; }
    if (bouton) { bouton.disabled = true; bouton.dataset.texte = bouton.textContent; bouton.textContent = '…'; }
    try {
      const r = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Jeton': jeton() }, body: JSON.stringify(corps) });
      const j = await r.json(); montrer(j, corps.action); if (j.ok) { restant = 1; } chargerJournal(); return j;
    } catch (e) { montrer({ ok: false, refus: 'SERVEUR INJOIGNABLE', message: e.message }, corps.action); return null; }
    finally { if (bouton) { bouton.disabled = false; bouton.textContent = bouton.dataset.texte; } }
  }
  function montrer(j, action) {
    const d = $('#resultat'); d.hidden = false; d.className = 'resultat ' + (j.ok ? 'ok' : 'refus');
    d.innerHTML = '<strong>' + esc(action) + '</strong> · ' + (j.ok ? '✅ fait' : '⛔ ' + esc(j.refus) + ' — ' + esc(j.message)) + ' <span class="badge">' + heure(new Date().toISOString()) + '</span>' + (j.ok ? '<pre>' + esc(JSON.stringify(j.resultat, null, 2)) + '</pre>' : '');
    d.scrollIntoView({ block: 'nearest' });
  }
  async function chargerJournal() {
    try { const j = await fetch('/api/journal').then((x) => x.json()); $('#journal').innerHTML = (j.journal || []).map((l) => '<li><span class="' + (l.ok ? 'ok' : 'refus') + '">' + (l.ok ? '✅' : '⛔') + '</span> ' + dateCourte(l.le) + ' · <strong>' + esc(l.action) + '</strong> ' + esc(JSON.stringify(Object.fromEntries(Object.entries(l.params || {}).filter(([k]) => k !== 'action')))) + (l.ok ? '' : ' — ' + esc(l.refus) + ' : ' + esc(l.message)) + '</li>').join('') || '<li class="vide">Aucune action.</li>'; } catch {}
  }
  const bouton = (texte, corps, classe = '') => { const b = document.createElement('button'); b.textContent = texte; b.className = classe; b.addEventListener('click', () => agir(corps, b)); return b; };

  function boutonsCampagne(c) {
    const info = campagnesInfo.find((x) => x.id === c.campagne) || {}; const div = document.createElement('div'); div.className = 'boutons';
    if (c.statut === 'en_cours') div.append(bouton('⏸ Pause', { action: 'pause', campagne: c.campagne }));
    if (c.statut === 'en_pause') div.append(bouton('▶ Reprendre', { action: 'reprendre', campagne: c.campagne }));
    if (c.statut === 'en_cours' && !info.chat) div.append(bouton('💬 Créer le chat', { action: 'chat', campagne: c.campagne }));
    if (info.hote_livraison === 'local' && !info.livraison_par_paul) { const b = document.createElement('button'); b.textContent = '🚚 GO de livraison'; b.className = 'danger'; b.addEventListener('click', () => panneauLivraison(c.campagne, div)); div.append(b); }
    return div;
  }
  async function panneauLivraison(campagne, apres) {
    const ancien = apres.parentElement.querySelector('.go-livraison'); if (ancien) ancien.remove();
    const j = await agir({ action: 'livraison-info', campagne }); if (!j || !j.ok) return;
    const info = j.resultat; const p = document.createElement('div'); p.className = 'go-livraison';
    if (!info.plan_texte) { p.innerHTML = '<span class="vide">Aucun plan de livraison présenté pour cette campagne.</span>'; apres.after(p); return; }
    p.innerHTML = '<div class="plan">' + esc(info.plan_texte) + '</div>' + (info.livraison?.go_le ? '<span class="vide">GO déjà enregistré le ' + dateCourte(info.livraison.go_le) + (info.livraison.utilise ? ', utilisé' : '') + '.</span>' : '') + '<label>Recopie les 8 premiers caractères de l’empreinte sha256 du plan (affichée par AIDE ou le chat de livraison) : <input placeholder="empreinte" maxlength="64"></label>';
    const b = document.createElement('button'); b.className = 'danger'; b.textContent = 'Enregistrer le GO'; b.addEventListener('click', () => { const emp = p.querySelector('input').value.trim(); if (!emp || !confirm('Enregistrer le GO de livraison de ' + campagne + ' sur l’empreinte ' + emp + ' ? La livraison sera jouée depuis le poste par $dev livrer.')) return; agir({ action: 'livraison-go', campagne, empreinte: emp, plan: info.livraison?.plan || '' }, b).then((r) => { if (r && r.ok) p.remove(); }); });
    p.append(b); apres.after(p);
  }

  function afficherPoint(r) {
    const p = r.point; if (!p) return; abonnement = p.abonnement || null;
    $('#releve').textContent = 'relevé à ' + heure(r.releve_le) + (p.ressources?.hote ? ' · données d’' + p.ressources.hote : '');
    $('#actions-paul').innerHTML = p.actions_paul?.length ? p.actions_paul.map((a) => '<li>' + esc(a.action) + ' <span class="issues">' + esc((a.issues || []).join(', ')) + (a.campagne ? ' · ' + esc(a.campagne) : '') + '</span></li>').join('') : '<li class="vide">Rien.</li>';
    $('#ligne-point').textContent = p.ligne_etat || '';
    const conteneur = $('#campagnes'); conteneur.innerHTML = '';
    for (const c of p.campagnes || []) {
      const pct = c.total ? Math.round(100 * (c.closes || 0) / c.total) : 0; const e = c.estimation || {}; const fourchette = (f) => Array.isArray(f) ? (f[0] === f[1] ? f[0] + ' h' : f[0] + ' à ' + f[1] + ' h') : 'non mesurable';
      const art = document.createElement('article'); art.className = 'campagne';
      art.innerHTML = '<div class="nom"><span>' + esc(c.campagne) + '</span><small>' + esc(c.mode || '') + ' · ' + esc(c.statut || '') + '</small></div>'
        + '<div class="barre"><i style="width:' + pct + '%"></i></div><div class="estimation">' + (c.closes || 0) + '/' + (c.total || 0) + ' closes (' + pct + ' %) · clôtures 24 h : ' + (c.closes_24h || 0) + ' · temps restant : ' + fourchette(e.si_actions_faites) + (e.fiabilite ? ' (estimation ' + esc(e.fiabilite) + ')' : '') + (c.places ? ' · places ' + c.places.occupees + '/' + c.places.max : '') + '</div>'
        + '<div class="etat ' + classeEtat(c.ligne_etat) + '">' + esc(c.ligne_etat || '') + '</div>' + (c.bloc ? '<p class="bloc">' + gras(c.bloc) + '</p>' : '');
      art.append(boutonsCampagne(c)); conteneur.append(art);
    }
    if (!(p.campagnes || []).length) conteneur.innerHTML = '<p class="vide">Aucune campagne en cours.</p>';
    const arrets = (p.campagnes || []).flatMap((c) => (c.arrets || []).map((a) => ({ ...a, campagne: c.campagne })));
    const qui = { paul: '👤 Toi', agents: '🤖 agents', poste: '🪟 poste', env: '🌐 environnement' };
    $('#blocages').innerHTML = arrets.length ? arrets.map((a) => '<li class="bloc-item"><span class="qui">' + (qui[a.attend] || esc(a.attend || 'à qualifier')) + '</span> <strong>' + esc(a.issue || a.linear_id || '') + '</strong> · ' + esc(a.campagne) + ' — ' + esc(a.quoi || a.cause || '') + '</li>').join('') : '<li class="vide">Aucun.</li>';
    const R = p.ressources || {}; const dl = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('');
    $('#ressources').innerHTML = dl({ 'hôte': R.hote, 'RAM libre': R.ram_libre_gio !== undefined ? R.ram_libre_gio + ' Gio' : null, 'disque libre': R.disque_libre_gio !== undefined ? R.disque_libre_gio + ' Gio' + (R.disque_seuil_gio ? ' (seuil ' + R.disque_seuil_gio + ')' : '') : null, 'charge 1 min': R.charge_1min !== undefined ? R.charge_1min + (R.coeurs ? ' pour ' + R.coeurs + ' cœurs' : '') : null, 'attente CPU 60 s': R.pression_cpu_60s !== undefined ? R.pression_cpu_60s + ' %' : null, 'sauvegarde': R.volume?.sauvegarde ? R.volume.sauvegarde.resultat + ' (' + R.volume.sauvegarde.le + ')' : null });
    const A = p.abonnement || {}; const rz = (iso) => iso ? 'remise à zéro ' + dateCourte(iso) : '';
    $('#abonnement').innerHTML = dl({ 'Anthropic': A.anthropic ? A.anthropic.pct + ' % (compte ' + A.anthropic.compte + ', ' + rz(A.anthropic.remise) + ')' : null, 'vitesse': A.vitesse_pt_h !== undefined && A.vitesse_pt_h !== null ? A.vitesse_pt_h + ' pt/h' : null, 'Codex': A.codex ? A.codex.pct + ' % (' + rz(A.codex.remise) + ')' : null, 'Fable': A.fable_pct !== null && A.fable_pct !== undefined ? A.fable_pct + ' %' : null, 'fournisseur': A.mode ? A.mode + (A.effectif && A.effectif !== A.mode ? ' → ' + A.effectif : '') : null, 'conseil': A.conseil });
    const sel = $('#f-compte select'); sel.innerHTML = (A.comptes || []).map((c) => '<option value="' + esc(c.id) + '"' + (c.actif ? ' selected' : '') + '>' + esc(c.compte) + ' · ' + c.pct + ' %' + (c.actif ? ' (actif)' : '') + '</option>').join('') || '<option value="">aucun compte relevé</option>';
    $('#rendu').innerHTML = markdown(p.rendu);
  }

  function afficherChats(r) {
    const tb = $('#chats tbody'); const chats = r.chats || []; tb.innerHTML = '';
    $('#nb-chats').textContent = chats.length + (r.atelier_injoignable ? ' · atelier injoignable, registre du poste seulement' : '');
    for (const c of chats) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td class="titre-chat">' + esc(c.titre) + (c.statut !== 'actif' ? ' <span class="badge">' + esc(c.statut) + '</span>' : '') + '</td><td>' + esc(c.hote) + '</td><td>' + esc(c.dossier || '') + '</td><td class="ligne-chat ' + classeEtat(c.ligne_etat) + '">' + (c.ligne_etat ? esc(c.ligne_etat) : '<span class="nr">non relevée</span>') + '</td><td>' + dateCourte(c.ligne_etat_le) + '</td><td></td>';
      if (c.hote === 'atelier') { const d = document.createElement('div'); d.className = 'boutons'; d.append(bouton('↻ Relancer', { action: 'relancer-chat', chat: c.chat_id })); tr.lastElementChild.append(d); }
      tb.append(tr);
    }
    if (!chats.length) tb.innerHTML = '<tr><td colspan="6" class="vide">Aucun chat ouvert au registre.</td></tr>';
  }

  function preparerFormulaires() {
    $('#f-lancer select[name=commande]').innerHTML = (version.commandes_lanceur || []).map((c) => '<option>' + esc(c) + '</option>').join('');
    $('#f-lancer select[name=projet]').innerHTML = '<option value="">(aucun)</option>' + (version.projets || []).map((p) => '<option>' + esc(p) + '</option>').join('');
    $('#mode').textContent = jeton() ? 'actions avec jeton de session' : 'lecture seule (sans jeton)';
    $('#sans-jeton').hidden = !!jeton(); for (const b of document.querySelectorAll('#actions button')) if (!jeton()) b.disabled = true;
    $('#f-lancer').addEventListener('submit', (e) => { e.preventDefault(); const f = new FormData(e.target); agir({ action: 'lancer', commande: f.get('commande'), args: f.get('args'), projet: f.get('projet') || undefined, fiche: f.get('fiche'), nouveau: !!f.get('nouveau') }, e.submitter).then((r) => { if (r && r.ok) e.target.reset(); }); });
    $('#f-decision').addEventListener('submit', (e) => { e.preventDefault(); const f = new FormData(e.target); if (!confirm('Inscrire cette décision au journal de chaque campagne en cours ?')) return; agir({ action: 'decision-globale', texte: f.get('texte') }, e.submitter).then((r) => { if (r && r.ok) e.target.reset(); }); });
    $('#f-compte').addEventListener('submit', (e) => { e.preventDefault(); const f = new FormData(e.target); if (!f.get('compte')) return; agir({ action: 'abonnement-compte', compte: f.get('compte') }, e.submitter); });
    $('#f-menage').addEventListener('submit', (e) => { e.preventDefault(); agir({ action: 'menage' }, e.submitter).then((r) => { $('#menage-appliquer').disabled = !(r && r.ok); }); });
    $('#menage-appliquer').addEventListener('click', (e) => { if (!confirm('Appliquer les actions sûres du dernier ménage (archivages, rangements ; jamais de suppression) ?')) return; agir({ action: 'menage', appliquer: true }, e.target).then(() => { $('#menage-appliquer').disabled = true; }); });
  }

  async function rafraichir() {
    if (enCours) return; enCours = true; $('#compte').textContent = 'relevé en cours…';
    try {
      const [v, p, c, k] = await Promise.all([fetch('/api/version').then((x) => x.json()), fetch('/api/point').then((x) => x.json()), fetch('/api/chats').then((x) => x.json()), fetch('/api/campagnes').then((x) => x.json())]);
      version = v; $('#version').textContent = 'v' + v.version; periode = Number(v.rafraichissement_s) || 60; campagnesInfo = k.campagnes || [];
      afficherPoint(p); afficherChats(c);
      const erreurs = [p.erreur ? 'point : ' + p.erreur : null, c.erreur ? 'chats : ' + c.erreur : null, k.erreur ? 'campagnes : ' + k.erreur : null, c.atelier_injoignable ? 'ATELIER INJOIGNABLE — ' + c.atelier_injoignable : null].filter(Boolean);
      bandeau(erreurs.length ? erreurs.join(' · ') + (p.point ? ' (derniers chiffres conservés)' : '') : '', !!p.point);
    } catch (e) { bandeau('Serveur du tableau injoignable : ' + e.message + ' — relancer node pilote.mjs tableau servir', false); }
    restant = periode; enCours = false;
  }
  setInterval(() => { restant -= 1; if (restant <= 0) rafraichir(); else if (!enCours) $('#compte').textContent = 'prochain relevé dans ' + restant + ' s'; }, 1000);
  fetch('/api/version').then((x) => x.json()).then((v) => { version = v; preparerFormulaires(); chargerJournal(); rafraichir(); });
})();

