// Client minimal de l'app-server Codex de l'hôte (socket unix, protocole JSON-RPC sur WebSocket).
// Utilisé pour ouvrir et relancer les chats d'orchestration sur atelier, poste éteint.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export async function connecter(cfg) {
  if (cfg.appServerFactice) return connecterFactice(cfg);
  if (!cfg.appServerSocket || !fs.existsSync(cfg.appServerSocket)) throw new Error('socket app-server absent : ' + cfg.appServerSocket);
  const { default: WebSocket } = await import(pathToFileURL(cfg.appServerWebSocketModule).href);
  const ws = new WebSocket('ws+unix://' + cfg.appServerSocket + ':/', { handshakeTimeout: 5000, maxPayload: 64 * 1024 * 1024 });
  await new Promise((ok, ko) => { ws.once('open', ok); ws.once('error', ko); });
  let seq = 0; const attente = new Map();
  ws.on('message', (m) => { let x; try { x = JSON.parse(m.toString()); } catch { return; }
    if (x.id !== undefined && attente.has(x.id)) { const p = attente.get(x.id); attente.delete(x.id); clearTimeout(p.t); x.error ? p.ko(new Error(x.error.message)) : p.ok(x.result); }
    else if (x.id !== undefined && x.method) ws.send(JSON.stringify({ id: x.id, error: { code: -32000, message: 'décision humaine non déléguée à ce transport' } })); });
  const call = (method, params = {}, delai = 30000) => new Promise((ok, ko) => { const id = ++seq; const t = setTimeout(() => { attente.delete(id); ko(new Error('délai app-server : ' + method)); }, delai); attente.set(id, { ok, ko, t }); ws.send(JSON.stringify({ id, method, params })); });
  await call('initialize', { clientInfo: { name: 'pilote-dev', version: '2.2' }, capabilities: { experimentalApi: true } });
  ws.send(JSON.stringify({ method: 'initialized' }));
  return { call, fermer: () => ws.close() };
}


// App-server factice (évaluations) : enregistre les appels dans cfg.appServerFactice, rend des identifiants déterministes.
export function connecterFactice(cfg) {
  const f = cfg.appServerFactice; const lire = () => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const call = async (method, params = {}) => {
    fs.appendFileSync(f, JSON.stringify({ method, params }) + '\n');
    if (method === 'thread/start') return { thread: { id: 'factice-' + lire().filter((x) => x.method === 'thread/start').length } };
    if (method === 'turn/start') return { turn: { id: 'tour-' + lire().length } };
    if (method === 'thread/read') return { thread: { id: params.threadId, name: 'factice', status: { type: 'idle' }, turns: [{ id: 't0', status: 'completed', items: [{ type: 'agentMessage', text: cfg.appServerFacticeMessage || 'ok' }] }] } };
    return {};
  };
  return { call, fermer: () => {} };
}

