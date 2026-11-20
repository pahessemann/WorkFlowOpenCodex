export const coreVersion = '0.2.0';
export function effectiveOption(option) {
  const variant = option.variants?.find(v => v.id === option.selectedVariant);
  return { ...option, props: { ...option.props, ...variant?.props } };
}
export function renderSpec(spec) {
  return { ...spec, zones: spec.zones.map(z => ({ ...z, options: z.options.map(effectiveOption) })) };
}
export const commentText = z => z.comment ?? z.comments.map(c => c.decision || c.text).join('\n');
const requiredText = (x) => typeof x === 'string' && x.trim().length > 0;
export function validate(s, final = false) {
  if (s.schemaVersion !== 1) throw Error('Schéma inconnu');
  for (const k of ['project', 'page']) if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s[k] || '')) throw Error(`Identifiant ${k} invalide`);
  for (const k of ['title','objective','scope']) if (!requiredText(s[k])) throw Error(`${k} requis`);
  if (!/^(@[a-z0-9-]+\/)?[a-z0-9-]+$/.test(s.library?.package || '') || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(s.library?.version || '')) throw Error('Paquet et version exacte requis');
  for (const k of ['theme','source','storybook']) if (!requiredText(s.library[k])) throw Error(`library.${k} requis`);
  if (!s.shell?.sidebar || !s.shell?.topbar) throw Error('Sidebar et topbar requises');
  for (const k of ['zones','behaviors','states','dataBindings','acceptance','checks','blockers']) if (!Array.isArray(s[k])) throw Error(`${k} doit être une liste`);
  if (!s.zones.length) throw Error('Au moins une zone requise');
  const ids = new Set();
  for (const z of s.zones) {
    if (!requiredText(z.id) || ids.has(z.id)) throw Error('Identifiant de zone absent ou dupliqué'); ids.add(z.id);
    if (!Array.isArray(z.options) || !z.options.length || new Set(z.options.map(o=>o.id)).size !== z.options.length) throw Error('Options manquantes ou dupliquées');
    if (!z.options.some(o=>o.id === z.selected)) throw Error('Sélection inconnue');
    for (const o of z.options) for (const k of ['id','component','import','rationale']) if (!requiredText(o[k])) throw Error(`Option : ${k} requis`);
    for (const o of z.options) if (o.variants !== undefined) {
      if (!Array.isArray(o.variants) || new Set(o.variants.map(v=>v.id)).size!==o.variants.length) throw Error('Variantes invalides');
      if (o.variants.length && !o.variants.some(v=>v.id===o.selectedVariant)) throw Error('Variante inconnue');
      for (const v of o.variants) if (!requiredText(v.id) || !requiredText(v.label) || !v.props || typeof v.props!=='object' || Array.isArray(v.props)) throw Error('Variante incomplète');
    }
    if (!Array.isArray(z.comments)) throw Error('Commentaires requis');
    if (z.comment !== undefined && typeof z.comment !== 'string') throw Error('Commentaire invalide');
  }
  if (final && (s.blockers.length || !s.acceptance.length || !s.checks.length || !s.states.length)) throw Error('Manques, critères, états ou preuves à compléter');
  return s;
}
export function issue(s, id, digest) {
  validate(s, true);
  const list = a => a.map(x=>`- ${x}`).join('\n');
  return `# ${s.title}\n\nRévision validée : ${id}\nEmpreinte des fichiers : ${digest}\nSocle : ${coreVersion}\n\n## Besoin et périmètre\n\n${s.objective}\n\n${s.scope}\n\n## Bibliothèque\n\n${s.library.package}@${s.library.version} — thème ${s.library.theme}\nSource : ${s.library.source}\nStorybook : ${s.library.storybook}\n\n## Cadre\n\nSidebar : ${s.shell.sidebar}\nTopbar : ${s.shell.topbar}\n\n## Composition et décisions\n\n${s.zones.map(z=>{
    const o=effectiveOption(z.options.find(o=>o.id===z.selected));
    return `### ${z.id}\n\n${z.purpose || ''}\nComposant : ${o.component}\nVariante : ${o.variants?.find(v=>v.id===o.selectedVariant)?.label || 'configuration définie'}\nImport : ${o.import}\nChoix : ${o.rationale}\nParamètres :\n\n\`\`\`json\n${JSON.stringify(o.props ?? {},null,2)}\n\`\`\`\n\nCommentaire :\n${commentText(z) || 'Aucun commentaire.'}`;
  }).join('\n\n')}\n\n## Comportements\n\n${list(s.behaviors)}\n\n## États et formats\n\n${list(s.states)}\n\n## Données à raccorder\n\nLes données du prototype sont fictives.\n${list(s.dataBindings)}\n\n## Critères d’acceptation\n\n${list(s.acceptance)}\n\n## Preuves de revue du prototype\n\n${list(s.checks)}\n\n## Consignes développeur\n\nReproduire la composition validée avec les exports du package exact. Raccorder les données et comportements décrits sans recopier les données fictives. Vérifier les critères et les gates du projet. Signaler tout écart avant de substituer un composant.\n\nJoindre l’ensemble des fichiers de cette révision à l’issue. Dans ce dossier : pnpm install --frozen-lockfile puis pnpm dev (accès au registre privé requis). Cette validation ne lance pas le développement et ne publie pas l’issue.\n`;
}
