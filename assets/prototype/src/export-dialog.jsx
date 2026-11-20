import React, { useEffect, useRef, useState } from 'react';
export default function ExportDialog({spec,busy,message,close,confirm}) {
 const ref=useRef(null),[approved,setApproved]=useState(false),[done,setDone]=useState(false);
 useEffect(()=>{const previous=document.activeElement;ref.current.showModal();return()=>previous?.focus()},[]);
 return <dialog className="proto-editor" ref={ref} aria-labelledby="proto-export-title" onCancel={e=>{e.preventDefault();close()}}><div className="proto-editor-body">
 <header><h2 id="proto-export-title">Préparer l’issue de réalisation</h2><button disabled={busy} onClick={close} aria-label="Fermer">×</button></header>
 <p>{spec.title} · Révision {spec.revision}</p><p>{spec.library.package}@{spec.library.version} · {spec.library.theme}</p>
 <p>Enregistrer une révision du prototype et générer les consignes pour le développeur. La publication de l’issue reste effectuée par le chef de projet.</p>
 {spec.blockers.length>0&&<p>Blocages : {spec.blockers.join(' ; ')}</p>}
 <label><input type="checkbox" disabled={busy||done} checked={approved} onChange={e=>setApproved(e.target.checked)}/> Je valide cette composition et ses commentaires.</label>
 <p role="status">{message}</p><footer><button disabled={busy} onClick={close}>Fermer</button><button disabled={busy||done||!approved||spec.blockers.length>0} onClick={async()=>{if(await confirm())setDone(true)}}>{busy?'Enregistrement…':done?'Consignes générées':'Enregistrer et générer les consignes'}</button></footer>
 </div></dialog>;
}
