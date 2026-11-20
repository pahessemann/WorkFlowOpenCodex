import React, { useState, useEffect, createContext, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import Composition, * as compositionModule from './composition.jsx';
import { renderSpec } from '../model.mjs';
import Editor from './editor.jsx';
import ExportDialog from './export-dialog.jsx';
import ContextMenu from './context-menu.jsx';
import './review.css';
const SpecContext=createContext(null);
function Zone({id,children,inline=false,members=[]}) {
 const {spec,openEditor,openMenu}=useContext(SpecContext);
 const [hovered,setHovered]=useState(id);
 const targetId=e=>members.find(m=>e.target.closest(m.selector))?.id||id;
 const z=spec.zones.find(z=>z.id===hovered);if(!z)throw Error(`Zone inconnue : ${id}`);
 const option=z.options.find(o=>o.id===z.selected);
 function menu(e){e.preventDefault();e.stopPropagation();const ids=targetId(e)!==id?[targetId(e)]:[];let el=e.target.closest('[data-proto-zone]');while(el){if(!ids.includes(el.dataset.protoZone))ids.push(el.dataset.protoZone);el=el.parentElement?.closest('[data-proto-zone]')}if(!ids.includes(id))ids.push(id);const r=e.currentTarget.getBoundingClientRect();openMenu({ids,x:e.clientX||r.left,y:e.clientY||r.top})}
 return <div className={`proto-zone${inline?" proto-zone-inline":""}`} data-proto-zone={id} tabIndex={0} onMouseOver={e=>setHovered(targetId(e))} onContextMenu={menu} onKeyDown={e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10'))menu(e)}}><button type="button" className="proto-label" aria-haspopup="dialog" onClick={e=>{e.stopPropagation();openEditor(hovered)}}>{option.component} · {hovered} ✎</button>{children}</div>;
}
function App() {
 const [editing,setEditing]=useState(null);
 const [exporting,setExporting]=useState(false);
 const [contextMenu,setContextMenu]=useState(null);
 const [spec,setSpec]=useState(null),[dirty,setDirty]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{fetch('/__prototype').then(r=>r.json()).then(s=>{if(s.error) throw Error(s.error);setSpec(s)}).catch(e=>setMessage(e.message))},[]);
 useEffect(()=>{const warn=e=>{if(dirty){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[dirty]);
 function update(id,fn){setSpec(s=>({...s,zones:s.zones.map(z=>z.id===id?fn(z):z)}));setDirty(true);setMessage('Modifications non enregistrées.')}
 async function save(action){setBusy(true);try{const r=await fetch('/__prototype',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({spec,action})});const result=await r.json();if(!r.ok)throw Error(result.error);setSpec(result.spec);setDirty(false);setMessage(result.snapshot?`Révision conservée : revisions/${result.snapshot}/issue.md. Transmettre ces fichiers au chef de projet pour publication de l’issue.`:'Sauvegardé sur disque.');return true}catch(e){setMessage(e.message);return false}finally{setBusy(false)}}
 async function closeEditor(){if(busy)return;if(!dirty||await save('save'))setEditing(null)}
 if(!spec)return <p>{message||'Chargement…'}</p>;

 return <><main onContextMenu={e=>{e.preventDefault();setContextMenu({ids:[],x:e.clientX,y:e.clientY})}}><SpecContext.Provider value={{spec,openEditor:setEditing,openMenu:setContextMenu}}><Composition spec={renderSpec(spec)} Zone={Zone}/></SpecContext.Provider></main>{contextMenu&&<ContextMenu menu={contextMenu} spec={spec} busy={busy} save={()=>{setContextMenu(null);save('save')}} prepare={()=>{setContextMenu(null);setMessage('');setExporting(true)}} close={()=>setContextMenu(null)} edit={id=>{setContextMenu(null);setEditing(id)}}/>}{editing&&<Editor zone={spec.zones.find(z=>z.id===editing)} update={fn=>update(editing,fn)} close={closeEditor} busy={busy} message={message} Preview={compositionModule.OptionPreview}/>}{exporting&&<ExportDialog spec={spec} busy={busy} message={message} close={()=>{if(!busy)setExporting(false)}} confirm={()=>save('validate')}/>} {!editing&&!exporting&&message&&<aside className="proto-notice" role="status">{message}<button aria-label="Masquer le message" onClick={()=>setMessage('')}>×</button></aside>}</>;
}
createRoot(document.getElementById('root')).render(<App/>);
