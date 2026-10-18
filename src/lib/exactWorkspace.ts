import type { Workspace } from '../types';

const DATABASE = 'justaichat-history';
const STORE = 'workspaces';
const KEY = 'active';
let pendingWrite: Promise<void> = Promise.resolve();

function isWorkspace(value: unknown): value is Workspace {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<Workspace>;
  return data.version === 1 && Array.isArray(data.sessions) && data.sessions.length > 0;
}

function openDatabase(name = DATABASE): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('会话存储被其他页面占用'));
  });
}

export async function loadExactWorkspace(): Promise<Workspace | null> {
  if (typeof indexedDB === 'undefined') return null;
  const saved = await readSnapshot(DATABASE);
  return saved || await readSnapshot('singleaichat-history');
}

async function readSnapshot(name: string): Promise<Workspace | null> {
  const db = await openDatabase(name);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readonly');
    const request = transaction.objectStore(STORE).get(KEY);
    transaction.oncomplete = () => { db.close(); resolve(isWorkspace(request.result) ? request.result : null); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
}

function writeSnapshot(snapshot: Workspace): Promise<void> {
  return openDatabase().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put(snapshot, KEY);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  }));
}

export function saveExactWorkspace(workspace: Workspace): Promise<void> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('浏览器不支持 IndexedDB'));
  const snapshot = structuredClone(workspace);
  pendingWrite = pendingWrite.catch(() => {}).then(() => writeSnapshot(snapshot));
  return pendingWrite;
}
