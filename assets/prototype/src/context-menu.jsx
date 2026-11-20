import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
export default function ContextMenu({menu,spec,close,edit,save,prepare,busy}) {
 const ref=useRef(null);
 useEffect(()=>{
  const previous=document.activeElement,el=ref.current;
  const r=el.getBoundingClientRect();el.style.left=Math.max(8,Math.min(menu.x,innerWidth-r.width-8))+'px';el.style.top=Math.max(8,Math.min(menu.y,innerHeight-r.height-8))+'px';
  el.querySelector('button')?.focus();
  const outside=e=>{if(!el.contains(e.target))close()};
  const escape=e=>{if(e.key==='Escape'){e.preventDefault();close()}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);previous?.focus()};
 },[]);
 return createPortal(<div ref={ref} className="proto-context-menu" role="menu" aria-label="Éditer les composants" onContextMenu={e=>e.preventDefault()} onKeyDown={e=>{const buttons=[...ref.current.querySelectorAll('button')];const i=buttons.indexOf(document.activeElement);if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();buttons[(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus()}if(e.key==='Tab')close()}}>
 {menu.ids.map(id=>{const z=spec.zones.find(z=>z.id===id);if(!z)return null;const o=z.options.find(o=>o.id===z.selected);return <button role="menuitem" key={id} onClick={()=>edit(id)}>Éditer {o.component}<small>{id}</small></button>})}<hr/><button role="menuitem" disabled={busy} onClick={save}>Enregistrer le prototype</button><button role="menuitem" disabled={busy} onClick={prepare}>Valider et préparer l’issue</button></div>,document.body);
}
