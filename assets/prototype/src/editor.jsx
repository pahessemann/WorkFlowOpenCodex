import React, { useEffect, useRef } from 'react';
import { effectiveOption, commentText } from '../model.mjs';
export default function Editor({zone,update,close,busy,message,Preview}) {
 const dialog=useRef(null);
 useEffect(()=>{const previous=document.activeElement;dialog.current.showModal();return()=>previous?.focus()},[]);
 const option=zone.options.find(o=>o.id===zone.selected);
 const families=new Map();
 for(const v of option.variants||[]){const parts=v.label.split(' · ');const family=v.family ?? (parts.length>1?parts[0]:'');const label=v.choiceLabel ?? (parts.length>1?parts.slice(1).join(' · '):v.label);if(!families.has(family))families.set(family,[]);families.get(family).push({...v,choiceLabel:label.charAt(0).toUpperCase()+label.slice(1)})}
 const variantButton=v=><button key={v.id} disabled={busy} aria-pressed={option.selectedVariant===v.id} onClick={()=>update(z=>({...z,options:z.options.map(o=>o.id===option.id?{...o,selectedVariant:v.id}:o)}))}><strong>{v.choiceLabel}</strong><span>{v.description}</span></button>;

 return <dialog ref={dialog} className="proto-editor" aria-labelledby="proto-editor-title" onCancel={e=>{e.preventDefault();close()}} onClick={e=>{if(e.target===e.currentTarget)close()}}>
 <div className="proto-editor-body"><header><div><small>{zone.id}</small><h2 id="proto-editor-title">Composant et variantes</h2></div><button disabled={busy} onClick={close} aria-label="Enregistrer et fermer">×</button></header>
 <p>{zone.purpose}</p>{zone.options.length > 1 && <><h3 className="proto-category-title" data-category="alternative">Alternatives disponibles</h3><div className="proto-choices" data-category="alternative">
 {zone.options.map(o=><button key={o.id} disabled={busy} aria-pressed={zone.selected===o.id} onClick={()=>update(z=>({...z,selected:o.id}))}><strong>{o.component}</strong><span>{o.rationale}</span></button>)}</div></>}
 {zone.options.length<=1&&<div className="proto-availability" data-category="alternative"><span className="proto-availability-icon" aria-hidden="true">i</span><span><strong>Aucune alternative disponible</strong><small>Ce composant est le seul choix proposé.</small></span></div>}
 {option.variants?.length > 1 && <><h3 className="proto-category-title" data-category="variant">Variantes du composant</h3><div className="proto-variant-families" data-category="variant">{[...families].map(([family,variants])=>family?<fieldset key={family} className="proto-variant-family"><legend>{family}</legend><div className="proto-choices" data-category="variant">{variants.map(variantButton)}</div></fieldset>:<div key="ungrouped" className="proto-choices" data-category="variant">{variants.map(variantButton)}</div>)}</div></>}

 {(!option.variants || option.variants.length<=1)&&<div className="proto-availability" data-category="variant"><span className="proto-availability-icon" aria-hidden="true">i</span><span><strong>Aucune autre variante disponible</strong><small>Ce composant dispose d’une seule configuration.</small></span></div>}
 {Preview&&<section className="proto-option-preview" aria-label="Aperçu du composant choisi"><div className="proto-preview-content"><Preview zoneId={zone.id} option={effectiveOption(option)}/></div></section>}
 <section className="proto-comments"><label htmlFor="proto-comment">Commentaire</label><textarea id="proto-comment" rows={3} disabled={busy} value={commentText(zone)} placeholder="Votre remarque sur ce composant…" onChange={e=>update(z=>({...z,comment:e.target.value}))}/></section>
 <p role="status">{message}</p><footer><span>Le choix est enregistré à la fermeture, y compris avec Échap.</span><button disabled={busy} onClick={close}>{busy?'Enregistrement…':'Enregistrer et fermer'}</button></footer></div></dialog>;
}
