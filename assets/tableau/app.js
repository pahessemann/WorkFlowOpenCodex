/* Tableau de bord $dev · 3.5 : lecture (/api/point, /api/chats, /api/campagnes), actions (POST /api/action avec jeton), thème, densité, filtres, confirmations inline, toasts. */
(() => {
  const $ = (s, r = document) => r.querySelector(s); const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const gras = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const dateCourte = (iso) => iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  const relatif = (iso) => { if (!iso) return null; const s = Math.max(0, Math.round((Date.now() - new Date(iso)) / 1000)); return s < 60 ? 'il y a ' + s + ' s' : s < 3600 ? 'il y a ' + Math.round(s / 60) + ' min' : s < 86400 ? 'il y a ' + Math.round(s / 3600) + ' h' : 'il y a ' + Math.round(s / 86400) + ' j'; };
  const classeEtat = (l) => /^⏸/.test(l || '') ? 'toi-attend' : /^⛔/.test(l || '') ? 'bloque' : /^⏳/.test(l || '') ? 'attente' : /^✅/.test(l || '') ? 'termine' : /^▶/.test(l || '') ? 'en-cours' : '';
  const icone = (l) => (String(l || '').match(/^(⏸|⛔|⏳|✅|▶)/) || ['', '·'])[1];
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  let periode = 60, restant = 60, enCours = false, version = {}, campagnesInfo = [], releveLe = null, filtres = { hote: null, role: null, attend: false }, filtreJournal = 'tous', chatsCourants = [];

  // Jeton de session : porté par l’URL ouverte depuis AIDE, gardé pour la session de l’onglet, retiré de la barre d’adresse.
  const params = new URLSearchParams(location.search); if (params.get('jeton')) { sessionStorage.setItem('jeton', params.get('jeton')); history.replaceState(null, '', location.pathname); }
  const jeton = () => sessionStorage.getItem('jeton') || '';

  // ---------- préférences ----------
  const racine = document.documentElement; const THEMES = ['auto', 'clair', 'sombre'];
  racine.dataset.theme = localStorage.getItem('theme') || 'auto'; racine.dataset.densite = localStorage.getItem('densite') || 'normale';
  const libelleTheme = () => { $('#theme').textContent = { auto: '◐', clair: '☀', sombre: '☾' }[racine.dataset.theme]; $('#theme').title = 'Thème : ' + racine.dataset.theme + ' (cliquer pour changer)'; };
  $('#theme').addEventListener('click', () => { racine.dataset.theme = THEMES[(THEMES.indexOf(racine.dataset.theme) + 1) % 3]; localStorage.setItem('theme', racine.dataset.theme); libelleTheme(); }); libelleTheme();
  $('#densite').addEventListener('click', () => { racine.dataset.densite = racine.dataset.densite === 'compacte' ? 'normale' : 'compacte'; localStorage.setItem('densite', racine.dataset.densite); });
  for (const b of $$('[data-aller]')) b.addEventListener('click', () => { const c = $(b.dataset.aller); if (c) { c.scrollIntoView({ block: 'start' }); const f = c.querySelector('button, input, select, textarea'); if (f && b.dataset.aller === '#panneau') f.focus(); } });
  document.addEventListener('keydown', (e) => { if (e.target.matches('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return; if (e.key === 'r') { e.preventDefault(); rafraichir(true); } if (e.key === 'a') { e.preventDefault(); $('#aller-actions').click(); } });
  $('#relever').addEventListener('click', () => rafraichir(true));
  for (const b of $$('.onglets [data-onglet]')) b.addEventListener('click', () => { for (const x of $$('.onglets [data-onglet]')) { x.classList.toggle('actif', x === b); x.setAttribute('aria-selected', x === b); } for (const o of $$('.onglet')) o.classList.toggle('actif', o.dataset.onglet === b.dataset.onglet); if (b.dataset.onglet === 'journal') chargerJournal(); });

  function markdown(t) {
    const lignes = String(t || '').split('\n'); let html = '', table = [];
    const videTable = () => { if (!table.length) return; const rows = table.filter((r) => !/^\|\s*:?-{2,}/.test(r)).map((r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())); html += '<table><thead><tr>' + rows[0].map((c) => '<th>' + gras(c) + '</th>').join('') + '</tr></thead><tbody>' + rows.slice(1).map((r) => '<tr>' + r.map((c) => '<td>' + gras(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>'; table = []; };
    for (const l of lignes) { if (/^\|/.test(l)) { table.push(l); continue; } videTable(); if (!l.trim()) continue; html += '<p>' + gras(l) + '</p>'; }
    videTable(); return html;
  }
  function bandeau(texte, attente) { const b = $('#bandeau'); if (!texte) { b.hidden = true; return; } b.hidden = false; b.textContent = texte; b.className = 'bandeau' + (attente ? ' attente' : ''); }
  let minuteurToast = null;
  function toast(texte, ok) { const t = $('#toast'); t.hidden = false; t.className = 'toast ' + (ok ? 'ok' : 'refus'); t.textContent = texte; clearTimeout(minuteurToast); minuteurToast = setTimeout(() => { t.hidden = true; }, 6000); }
  // Confirmation inline, à la place des boîtes natives : une barre Oui / Non insérée après le conteneur du bouton.
  function confirmer(texte, apres) { return new Promise((ok) => { const ancien = apres.parentElement.querySelector('.confirm'); if (ancien) ancien.remove(); const c = el('<div class="confirm" role="alertdialog"><span>' + esc(texte) + '</span><button type="button" class="primaire">Oui</button><button type="button">Non</button></div>'); const [oui, non] = c.querySelectorAll('button'); oui.addEventListener('click', () => { c.remove(); ok(true); }); non.addEventListener('click', () => { c.remove(); ok(false); }); apres.after(c); oui.focus(); }); }

  // ---------- actions ----------
  async function agir(corps, bouton) {
    if (!jeton()) { montrer({ ok: false, refus: 'JETON ABSENT', message: 'ouvre le tableau depuis AIDE ($dev tableau)' }, corps.action); return null; }
    if (bouton) { bouton.disabled = true; bouton.dataset.texte = bouton.textContent; bouton.textContent = '…'; }
    try {
      const r = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Jeton': jeton() }, body: JSON.stringify(corps) });
      const j = await r.json(); montrer(j, corps.action); if (j.ok) restant = 1; chargerJournal(); return j;
    } catch (e) { montrer({ ok: false, refus: 'SERVEUR INJOIGNABLE', message: e.message }, corps.action); return null; }
    finally { if (bouton) { bouton.disabled = false; bouton.textContent = bouton.dataset.texte; } }
  }
  function montrer(j, action) {
    toast((j.ok ? '✅ ' : '⛔ ') + action + (j.ok ? ' : fait' : ' : ' + j.refus), j.ok);
    const d = $('#resultat'); d.hidden = false; d.className = 'resultat ' + (j.ok ? 'ok' : 'refus');
    d.innerHTML = '<strong>' + esc(action) + '</strong> · ' + (j.ok ? '✅ fait' : '⛔ ' + esc(j.refus) + ' — ' + esc(j.message)) + ' <span class="badge">' + new Date().toLocaleTimeString('fr-FR') + '</span>' + (j.ok && j.resultat !== undefined ? '<details><summary>détail</summary><pre>' + esc(JSON.stringify(j.resultat, null, 2)) + '</pre></details>' : '');
  }
  async function chargerJournal() {
    try { const j = await fetch('/api/journal').then((x) => x.json()); const lignes = (j.journal || []).filter((l) => filtreJournal === 'tous' || (filtreJournal === 'ok' ? l.ok : !l.ok)); $('#journal').innerHTML = lignes.map((l) => '<li><span class="' + (l.ok ? 'ok' : 'refus') + '">' + (l.ok ? '✅' : '⛔') + '</span> <span class="quand">' + dateCourte(l.le) + '</span><strong>' + esc(l.action) + '</strong> ' + esc(Object.entries(l.params || {}).filter(([k, v]) => k !== 'action' && v !== undefined && v !== '').map(([k, v]) => k + '=' + String(v).slice(0, 40)).join(' ')) + (l.ok ? '' : ' — ' + esc(l.refus) + ' : ' + esc(l.message)) + '</li>').join('') || '<li class="vide">Aucune action' + (filtreJournal !== 'tous' ? ' de ce type' : '') + '.</li>'; } catch {}
  }
  for (const b of $$('[data-journal]')) b.addEventListener('click', () => { filtreJournal = b.dataset.journal; for (const x of $$('[data-journal]')) x.classList.toggle('actif', x === b); chargerJournal(); });
  const bouton = (texte, corps, { classe = '', question = null } = {}) => { const b = el('<button type="button"' + (classe ? ' class="' + classe + '"' : '') + '>' + esc(texte) + '</button>'); b.addEventListener('click', async () => { if (question && !(await confirmer(question, b.parentElement))) return; agir(corps, b); }); return b; };

  function boutonsCampagne(c) {
    const info = campagnesInfo.find((x) => x.id === c.campagne) || {}; const div = el('<div class="boutons"></div>');
    if (c.statut === 'en_cours') div.append(bouton('⏸ Pause', { action: 'pause', campagne: c.campagne }, { question: 'Mettre ' + c.campagne + ' en pause ? Son chat ne sera plus relancé par le réveil.' }));
    if (c.statut === 'en_pause') div.append(bouton('▶ Reprendre', { action: 'reprendre', campagne: c.campagne }, { question: 'Reprendre ' + c.campagne + ' ? Son chat est relancé aussitôt.' }));
    if (c.statut === 'en_cours' && !info.chat) div.append(bouton('💬 Créer le chat', { action: 'chat', campagne: c.campagne }, { question: 'Créer le chat autonome de ' + c.campagne + ' sur atelier ?' }));
    if (info.hote_livraison === 'local' && !info.livraison_par_paul) { const b = el('<button type="button" class="danger">🚚 GO de livraison</button>'); b.addEventListener('click', () => panneauLivraison(c.campagne, div)); div.append(b); }
    return div;
  }
  async function panneauLivraison(campagne, apres) {
    const ancien = apres.parentElement.querySelector('.go-livraison'); if (ancien) ancien.remove();
    const j = await agir({ action: 'livraison-info', campagne }); if (!j || !j.ok) return;
    const info = j.resultat; const p = el('<div class="go-livraison"></div>');
    if (!info.plan_texte) { p.innerHTML = '<span class="vide">Aucun plan de livraison présenté pour cette campagne.</span>'; apres.after(p); return; }
    p.innerHTML = '<div class="plan">' + esc(info.plan_texte) + '</div>' + (info.livraison?.go_le ? '<span class="vide">GO déjà enregistré le ' + dateCourte(info.livraison.go_le) + (info.livraison.utilise ? ', utilisé' : '') + '.</span>' : '') + '<label>Recopie au moins 8 caractères de l’empreinte sha256 du plan (donnée par AIDE ou le chat de livraison) <input placeholder="empreinte" maxlength="64"></label>';
    const b = el('<button type="button" class="danger">Enregistrer le GO</button>'); const annuler = el('<button type="button">Fermer</button>'); annuler.addEventListener('click', () => p.remove());
    b.addEventListener('click', async () => { const emp = p.querySelector('input').value.trim(); if (!emp) return; if (!(await confirmer('Enregistrer le GO de livraison de ' + campagne + ' sur l’empreinte ' + emp + ' ? La livraison sera ensuite jouée depuis le poste par $dev livrer.', b.parentElement))) return; agir({ action: 'livraison-go', campagne, empreinte: emp, plan: info.livraison?.plan || '' }, b).then((r) => { if (r && r.ok) p.remove(); }); });
    const bs = el('<div class="boutons"></div>'); bs.append(b, annuler); p.append(bs); apres.after(p);
  }

  // ---------- rendu ----------
  function afficherPoint(r) {
    const p = r.point; if (!p) return; releveLe = r.releve_le;
    const actions = p.actions_paul || []; const toi = $('#toi'); toi.classList.toggle('urgent', actions.length > 0); toi.classList.toggle('calme', actions.length === 0);
    $('#actions-paul').innerHTML = actions.length ? actions.map((a) => '<li>' + esc(a.action) + ' <span class="issues">' + esc((a.issues || []).join(', ')) + (a.campagne ? ' · ' + esc(a.campagne) : '') + '</span></li>').join('') : '<li class="vide">Rien ne t’attend.</li>';
    $('#ligne-point').textContent = actions.length ? '' : p.ligne_etat || '';
    const eg = $('#etat-global'); eg.textContent = p.ligne_etat || ''; eg.className = 'etat-global ' + classeEtat(p.ligne_etat);
    $('#c-toi').textContent = actions.length; $('#c-toi').parentElement.classList.toggle('alerte', actions.length > 0);
    const camps = p.campagnes || []; $('#c-campagnes').textContent = camps.filter((c) => c.statut === 'en_cours').length; $('#nb-campagnes').textContent = camps.length ? camps.length + (camps.length > 1 ? ' campagnes' : ' campagne') : '';
    const conteneur = $('#liste-campagnes'); conteneur.innerHTML = '';
    for (const c of camps) {
      const pct = c.total ? Math.round(100 * (c.closes || 0) / c.total) : 0; const e = c.estimation || {}; const fourchette = (f) => Array.isArray(f) ? (f[0] === f[1] ? f[0] + ' h' : f[0] + ' à ' + f[1] + ' h') : 'non mesurable';
      const art = el('<article class="campagne"></article>');
      art.innerHTML = '<div class="nom"><span class="pastille ' + classeEtat(c.ligne_etat) + '" title="' + esc(c.statut) + '">' + icone(c.ligne_etat) + '</span><span class="texte" title="' + esc(c.campagne) + '">' + esc(c.campagne) + '</span><small>' + esc(c.mode || '') + ' · ' + esc(c.statut || '') + '</small></div>'
        + '<div class="progres"><div class="barre"><i style="width:' + pct + '%"></i></div><span>' + (c.closes || 0) + '/' + (c.total || 0) + ' · ' + pct + ' %</span></div>'
        + '<div class="estimation">clôtures 24 h : ' + (c.closes_24h || 0) + ' · temps restant : ' + fourchette(e.si_actions_faites) + (e.fiabilite ? ' (' + esc(e.fiabilite) + ')' : '') + (c.places ? ' · places ' + c.places.occupees + '/' + c.places.max : '') + '</div>'
        + '<div class="etat ' + classeEtat(c.ligne_etat) + '">' + esc(c.ligne_etat || '') + '</div>' + (c.bloc ? '<details><summary>bloc d’état</summary><p class="bloc">' + gras(c.bloc) + '</p></details>' : '');
      art.append(boutonsCampagne(c)); conteneur.append(art);
    }
    if (!camps.length) conteneur.innerHTML = '<p class="vide">Aucune campagne en cours.</p>';
    const arrets = camps.flatMap((c) => (c.arrets || []).map((a) => ({ ...a, campagne: c.campagne })));
    const qui = { paul: '👤 Toi', agents: '🤖 agents', poste: '🪟 poste', env: '🌐 environnement' };
    $('#nb-blocages').textContent = arrets.length || ''; $('#liste-blocages').innerHTML = arrets.length ? arrets.map((a) => '<li><span class="qui">' + (qui[a.attend] || esc(a.attend || 'à qualifier')) + '</span><span><strong>' + esc(a.issue || a.linear_id || '') + '</strong> · ' + esc(a.campagne) + ' — ' + esc(a.quoi || a.cause || '') + '</span></li>').join('') : '<li class="vide">Aucun.</li>';
    const R = p.ressources || {}; const dl = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('');
    $('#ressources').innerHTML = dl({ 'hôte': R.hote, 'RAM libre': R.ram_libre_gio !== undefined ? R.ram_libre_gio + ' Gio' : null, 'disque libre': R.disque_libre_gio !== undefined ? R.disque_libre_gio + ' Gio' + (R.disque_seuil_gio ? ' (seuil ' + R.disque_seuil_gio + ')' : '') : null, 'charge 1 min': R.charge_1min !== undefined ? R.charge_1min + (R.coeurs ? ' pour ' + R.coeurs + ' cœurs' : '') : null, 'attente CPU 60 s': R.pression_cpu_60s !== undefined ? R.pression_cpu_60s + ' %' : null, 'sauvegarde': R.volume?.sauvegarde ? R.volume.sauvegarde.resultat + ' (' + R.volume.sauvegarde.le + ')' : null }) || '<dt class="vide">non relevées</dt><dd></dd>';
    const A = p.abonnement || {}; const rz = (iso) => iso ? 'remise à zéro ' + dateCourte(iso) : '';
    $('#abonnement').innerHTML = dl({ 'Anthropic': A.anthropic ? A.anthropic.pct + ' % (compte ' + A.anthropic.compte + ', ' + rz(A.anthropic.remise) + ')' : null, 'vitesse': A.vitesse_pt_h !== undefined && A.vitesse_pt_h !== null ? A.vitesse_pt_h + ' pt/h' : null, 'Codex': A.codex ? A.codex.pct + ' % (' + rz(A.codex.remise) + ')' : null, 'Fable': A.fable_pct !== null && A.fable_pct !== undefined ? A.fable_pct + ' %' : null, 'fournisseur': A.mode ? A.mode + (A.effectif && A.effectif !== A.mode ? ' → ' + A.effectif : '') : null, 'conseil': A.conseil }) || '<dt class="vide">non relevé</dt><dd></dd>';
    const sel = $('#f-compte select'); sel.innerHTML = (A.comptes || []).map((c) => '<option value="' + esc(c.id) + '"' + (c.actif ? ' selected' : '') + '>' + esc(c.compte) + ' · ' + c.pct + ' %' + (c.actif ? ' (actif)' : '') + '</option>').join('') || '<option value="">aucun compte relevé</option>';
    $('#rendu').innerHTML = markdown(p.rendu);
    document.title = (actions.length ? '⏸ ' + actions.length + ' à toi' : icone(p.ligne_etat) + ' ' + camps.filter((c) => c.statut === 'en_cours').length + ' en cours') + ' · $dev';
  }

  function afficherChats(r) {
    chatsCourants = r.chats || []; const chats = chatsCourants;
    $('#nb-chats').textContent = chats.length + (r.atelier_injoignable ? ' · atelier injoignable, registre du poste seulement' : '');
    $('#c-attendent').textContent = chats.filter((c) => /^⏸/.test(c.ligne_etat || '')).length; $('#c-attendent').parentElement.classList.toggle('alerte', chats.some((c) => /^⏸/.test(c.ligne_etat || '')));
    const roles = [...new Set(chats.map((c) => c.role).filter(Boolean))]; const hotes = [...new Set(chats.map((c) => c.hote))];
    const f = $('#filtres'); f.innerHTML = '';
    const filtre = (texte, actif, surClic) => { const b = el('<button type="button" class="filtre' + (actif ? ' actif' : '') + '">' + esc(texte) + '</button>'); b.addEventListener('click', () => { surClic(); afficherChats(r); }); f.append(b); };
    filtre('⏸ m’attend', filtres.attend, () => { filtres.attend = !filtres.attend; });
    for (const h of hotes) filtre(h, filtres.hote === h, () => { filtres.hote = filtres.hote === h ? null : h; });
    for (const ro of roles) filtre(ro, filtres.role === ro, () => { filtres.role = filtres.role === ro ? null : ro; });
    const visibles = chats.filter((c) => (!filtres.attend || /^⏸/.test(c.ligne_etat || '')) && (!filtres.hote || c.hote === filtres.hote) && (!filtres.role || c.role === filtres.role));
    const poids = (c) => /^⏸/.test(c.ligne_etat || '') ? 0 : /^⛔/.test(c.ligne_etat || '') ? 1 : c.ligne_etat ? 2 : 3;
    const groupes = new Map(); const cleDe = (c) => (c.ligne_etat ? c.hote + ' · ' + (c.dossier || 'sans dossier') : c.hote + ' · sans ligne d’état');
    for (const cle of [...new Set(visibles.map(cleDe))].sort((a, b) => (/sans ligne/.test(a) ? 1 : 0) - (/sans ligne/.test(b) ? 1 : 0) || a.localeCompare(b))) groupes.set(cle, visibles.filter((c) => cleDe(c) === cle).sort((a, b) => poids(a) - poids(b) || String(a.titre).localeCompare(String(b.titre))));
    const liste = $('#liste-chats'); liste.innerHTML = '';
    const rendreChat = (c) => { const d = el('<div class="chat' + (/^⏸/.test(c.ligne_etat || '') ? ' attend' : '') + '"></div>'); const pastille = (c.titre.match(/^(\S+)/) || ['', '·'])[1];
      d.innerHTML = '<div class="role" title="' + esc(c.role || '') + '">' + esc(pastille) + '</div><div class="titre-chat">' + esc(c.titre.replace(/^\S+\s*/, '')) + (c.statut !== 'actif' ? '<small>' + esc(c.statut) + '</small>' : '') + '</div><div class="ligne-chat ' + classeEtat(c.ligne_etat) + '" title="cliquer pour déplier">' + (c.ligne_etat ? esc(c.ligne_etat) : '<span class="nr">non relevée</span>') + '</div><div class="relevee">' + (c.ligne_etat_le ? 'relevée ' + relatif(c.ligne_etat_le) + ' · ' + dateCourte(c.ligne_etat_le) : '') + '</div>';
      d.querySelector('.ligne-chat').addEventListener('click', (e) => e.currentTarget.classList.toggle('ouverte'));
      if (c.hote === 'atelier') { const bs = el('<div class="boutons"></div>'); bs.append(bouton('↻ Relancer', { action: 'relancer-chat', chat: c.chat_id }, { question: 'Relancer ce chat sur atelier ?' })); d.append(bs); }
      return d; };
    for (const [cle, lot] of groupes) {
      if (/sans ligne/.test(cle)) { const det = el('<details class="repli"><summary>' + esc(cle.split(' · ')[0]) + ' (' + lot.length + ') · sans ligne d’état relevée</summary></details>'); for (const c of lot) det.append(rendreChat(c)); liste.append(det); continue; }
      const g = el('<div class="groupe-chats"><h3>' + esc(cle) + ' <span class="badge">' + lot.length + '</span></h3></div>'); for (const c of lot) g.append(rendreChat(c)); liste.append(g);
    }
    if (!visibles.length) liste.innerHTML = '<p class="vide">' + (chats.length ? 'Aucun chat ne correspond aux filtres.' : 'Aucun chat ouvert au registre.') + '</p>';
  }

  function preparerFormulaires() {
    $('#f-lancer select[name=commande]').innerHTML = (version.commandes_lanceur || []).map((c) => '<option>' + esc(c) + '</option>').join('');
    $('#f-lancer select[name=projet]').innerHTML = '<option value="">(aucun)</option>' + (version.projets || []).map((p) => '<option>' + esc(p) + '</option>').join('');
    $('#sans-jeton').hidden = !!jeton(); if (!jeton()) for (const b of $$('#panneau button:not([data-onglet]):not([data-journal])')) { b.disabled = true; b.title = 'Jeton de session absent : ouvre le tableau depuis AIDE'; }
    $('#f-lancer').addEventListener('submit', (e) => { e.preventDefault(); const f = new FormData(e.target); agir({ action: 'lancer', commande: f.get('commande'), args: f.get('args'), projet: f.get('projet') || undefined, fiche: f.get('fiche'), nouveau: !!f.get('nouveau') }, e.submitter).then((r) => { if (r && r.ok) e.target.reset(); }); });
    $('#f-decision').addEventListener('submit', async (e) => { e.preventDefault(); const f = new FormData(e.target); if (!(await confirmer('Inscrire cette décision au journal de chaque campagne en cours ?', e.submitter))) return; agir({ action: 'decision-globale', texte: f.get('texte') }, e.submitter).then((r) => { if (r && r.ok) e.target.reset(); }); });
    $('#f-compte').addEventListener('submit', (e) => { e.preventDefault(); const f = new FormData(e.target); if (!f.get('compte')) return; agir({ action: 'abonnement-compte', compte: f.get('compte') }, e.submitter); });
    $('#f-menage').addEventListener('submit', (e) => { e.preventDefault(); agir({ action: 'menage' }, e.submitter).then((r) => { $('#menage-appliquer').disabled = !(r && r.ok); }); });
    $('#menage-appliquer').addEventListener('click', async (e) => { if (!(await confirmer('Appliquer les actions sûres du dernier ménage (archivages, rangements ; jamais de suppression) ?', e.target.parentElement))) return; agir({ action: 'menage', appliquer: true }, e.target).then(() => { $('#menage-appliquer').disabled = true; }); });
  }

  async function rafraichir(force = false) {
    if (enCours) return; enCours = true; $('#fraicheur').textContent = 'relevé en cours…'; if (force) restant = periode;
    try {
      const [v, p, c, k] = await Promise.all([fetch('/api/version').then((x) => x.json()), fetch('/api/point').then((x) => x.json()), fetch('/api/chats').then((x) => x.json()), fetch('/api/campagnes').then((x) => x.json())]);
      version = v; $('#version').textContent = 'v' + v.version; periode = Number(v.rafraichissement_s) || 60; campagnesInfo = k.campagnes || [];
      afficherPoint(p); afficherChats(c);
      const erreurs = [p.erreur ? 'point : ' + p.erreur : null, c.erreur ? 'chats : ' + c.erreur : null, k.erreur ? 'campagnes : ' + k.erreur : null, c.atelier_injoignable ? 'ATELIER INJOIGNABLE — ' + c.atelier_injoignable : null].filter(Boolean);
      bandeau(erreurs.length ? erreurs.join(' · ') + (p.point ? ' (derniers chiffres conservés)' : '') : '', !!p.point);
    } catch (e) { bandeau('Serveur du tableau injoignable : ' + e.message + ' — relancer node pilote.mjs tableau servir', false); }
    restant = periode; enCours = false; horloge();
  }
  function horloge() { $('#fraicheur').innerHTML = (releveLe ? 'relevé ' + esc(relatif(releveLe)) : 'pas encore relevé') + '<br><span class="sep"> · </span>prochain dans ' + restant + ' s'; $('#liseret').style.width = (100 * (periode - restant) / periode) + '%'; }
  setInterval(() => { restant -= 1; if (restant <= 0) rafraichir(); else if (!enCours) horloge(); }, 1000);
  fetch('/api/version').then((x) => x.json()).then((v) => { version = v; preparerFormulaires(); chargerJournal(); rafraichir(); }).catch(() => { preparerFormulaires(); bandeau('Serveur du tableau injoignable — relancer node pilote.mjs tableau servir', false); });
})();

