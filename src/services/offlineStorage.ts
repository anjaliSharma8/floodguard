import type { CommunityReport } from '../types';
import type { SosSubmissionRequest } from './sosService';

export type OfflineDatasetId =
  | 'roads'
  | 'shelters'
  | 'hospitals'
  | 'emergency-facilities'
  | 'waterways'
  | 'historical-floods'
  | 'rainfall';

export interface OfflineDatasetRecord {
  id: OfflineDatasetId;
  savedAt: string;
  sourceUpdatedAt?: string;
  recordCount: number | null;
  sizeBytes: number;
  data: unknown;
}

export interface PendingReportPayload {
  clientRequestId: string;
  ownerUserId: string;
  report: Pick<
    CommunityReport,
    'locationName' | 'lat' | 'lng' | 'reportType' | 'description' | 'severity'
  > & { roadId?: string };
  createdAt: string;
  lastError?: string;
}

export interface PendingSosPayload {
  request: SosSubmissionRequest;
  createdAt: string;
}

interface EncryptedRecord {
  id: string;
  createdAt: string;
  iv: number[];
  ciphertext: number[];
}

interface StoredCryptoKey {
  id: 'offline-queue-key';
  key: CryptoKey;
}

export interface OfflineStorageSummary {
  datasets: OfflineDatasetRecord[];
  pendingReportCount: number;
  pendingSosCount: number;
  usageBytes: number | null;
  quotaBytes: number | null;
}

const DB_NAME = 'sanketsetu-offline';
const DB_VERSION = 1;
const DATASETS_STORE = 'datasets';
const REPORTS_STORE = 'pending-reports';
const SOS_STORE = 'pending-sos';
const KEYS_STORE = 'keys';

const DOWNLOADS: Array<{ id: OfflineDatasetId; url: string }> = [
  { id: 'roads', url: '/api/roads' },
  { id: 'shelters', url: '/api/shelters' },
  { id: 'hospitals', url: '/api/hospitals' },
  { id: 'emergency-facilities', url: '/api/emergency-facilities' },
  { id: 'waterways', url: '/api/waterways' },
  { id: 'historical-floods', url: '/api/historical-floods' },
  { id: 'rainfall', url: '/api/rainfall' }
];

let encryptionKeyPromise: Promise<CryptoKey> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('This browser does not support offline storage.'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DATASETS_STORE)) {
        database.createObjectStore(DATASETS_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(REPORTS_STORE)) {
        database.createObjectStore(REPORTS_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(SOS_STORE)) {
        database.createObjectStore(SOS_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(KEYS_STORE)) {
        database.createObjectStore(KEYS_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open offline storage.'));
    request.onblocked = () => reject(new Error('Offline storage is blocked by another open app version.'));
  });
}

function transact<T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDatabase().then(database => new Promise<T>((resolve, reject) => {
    let result: T;
    let settled = false;
    const transaction = database.transaction(storeName, mode);
    const request = operation(transaction.objectStore(storeName));

    request.onsuccess = () => {
      result = request.result;
    };
    request.onerror = () => {
      if (!settled) {
        settled = true;
        reject(request.error || new Error(`Offline storage request failed in ${storeName}.`));
      }
    };
    transaction.oncomplete = () => {
      database.close();
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };
    transaction.onerror = () => {
      database.close();
      if (!settled) {
        settled = true;
        reject(transaction.error || new Error(`Offline storage transaction failed in ${storeName}.`));
      }
    };
    transaction.onabort = () => {
      database.close();
      if (!settled) {
        settled = true;
        reject(transaction.error || new Error(`Offline storage transaction was aborted in ${storeName}.`));
      }
    };
  }));
}

function requireEncryption(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Secure offline request storage is unavailable in this browser context.');
  }
  return globalThis.crypto.subtle;
}

function getEncryptionKey(): Promise<CryptoKey> {
  if (!encryptionKeyPromise) {
    encryptionKeyPromise = (async () => {
      const subtle = requireEncryption();
      const stored = await transact<StoredCryptoKey | undefined>(
        KEYS_STORE,
        'readonly',
        store => store.get('offline-queue-key')
      );
      if (stored) return stored.key;

      const key = await subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
      await transact<IDBValidKey>(KEYS_STORE, 'readwrite', store =>
        store.put({ id: 'offline-queue-key', key } satisfies StoredCryptoKey)
      );
      return key;
    })().catch(error => {
      encryptionKeyPromise = null;
      throw error;
    });
  }
  return encryptionKeyPromise;
}

async function encryptRecord<T>(id: string, createdAt: string, value: T): Promise<EncryptedRecord> {
  const subtle = requireEncryption();
  const key = await getEncryptionKey();
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return {
    id,
    createdAt,
    iv: Array.from(iv),
    ciphertext: Array.from(new Uint8Array(ciphertext))
  };
}

async function decryptRecord<T>(record: EncryptedRecord): Promise<T> {
  const subtle = requireEncryption();
  const key = await getEncryptionKey();
  const plaintext = await subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(record.iv) },
    key,
    new Uint8Array(record.ciphertext)
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

function countRecords(value: unknown): number | null {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') {
    const object = value as { segments?: unknown; nodes?: unknown };
    if (Array.isArray(object.segments)) return object.segments.length;
    if (object.nodes && typeof object.nodes === 'object') return Object.keys(object.nodes).length;
  }
  return null;
}

function byteSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function sourceTimestamp(id: OfflineDatasetId, value: unknown): string | undefined {
  if (id === 'roads' && value && typeof value === 'object') {
    const lastUpdated = (value as { lastUpdated?: unknown }).lastUpdated;
    return typeof lastUpdated === 'string' ? lastUpdated : undefined;
  }
  if (id === 'rainfall' && value && typeof value === 'object') {
    const lastSuccessfulUpdate = (value as { lastSuccessfulUpdate?: unknown }).lastSuccessfulUpdate;
    return typeof lastSuccessfulUpdate === 'string' ? lastSuccessfulUpdate : undefined;
  }
  return undefined;
}

export async function saveOfflineDataset(
  id: OfflineDatasetId,
  data: unknown,
  savedAt: string = new Date().toISOString()
): Promise<OfflineDatasetRecord> {
  const record: OfflineDatasetRecord = {
    id,
    savedAt,
    sourceUpdatedAt: sourceTimestamp(id, data),
    recordCount: countRecords(data),
    sizeBytes: byteSize(data),
    data
  };
  await transact<IDBValidKey>(DATASETS_STORE, 'readwrite', store => store.put(record));
  return record;
}

export function getOfflineDataset(id: OfflineDatasetId): Promise<OfflineDatasetRecord | undefined> {
  return transact<OfflineDatasetRecord | undefined>(DATASETS_STORE, 'readonly', store => store.get(id));
}

export function getOfflineDatasets(): Promise<OfflineDatasetRecord[]> {
  return transact<OfflineDatasetRecord[]>(DATASETS_STORE, 'readonly', store => store.getAll());
}

export async function downloadOfflineData(): Promise<{ saved: OfflineDatasetRecord[]; errors: string[] }> {
  const saved: OfflineDatasetRecord[] = [];
  const errors: string[] = [];

  for (const dataset of DOWNLOADS) {
    try {
      const response = await fetch(dataset.url, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) {
        throw new Error(`${dataset.url} returned HTTP ${response.status}`);
      }
      const data: unknown = await response.json();
      saved.push(await saveOfflineDataset(dataset.id, data));
    } catch (error) {
      errors.push(
        `${dataset.id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return { saved, errors };
}

export async function getOfflineStorageSummary(): Promise<OfflineStorageSummary> {
  const [datasets, pendingReportCount, pendingSosCount] = await Promise.all([
    getOfflineDatasets(),
    transact<number>(REPORTS_STORE, 'readonly', store => store.count()),
    transact<number>(SOS_STORE, 'readonly', store => store.count())
  ]);
  const estimate = await navigator.storage?.estimate?.();
  return {
    datasets,
    pendingReportCount,
    pendingSosCount,
    usageBytes: estimate?.usage ?? null,
    quotaBytes: estimate?.quota ?? null
  };
}

export async function savePendingReport(payload: PendingReportPayload): Promise<void> {
  const record = await encryptRecord(payload.clientRequestId, payload.createdAt, payload);
  await transact<IDBValidKey>(REPORTS_STORE, 'readwrite', store => store.put(record));
}

export async function getPendingReports(): Promise<PendingReportPayload[]> {
  const records = await transact<EncryptedRecord[]>(REPORTS_STORE, 'readonly', store => store.getAll());
  return Promise.all(records.map(record => decryptRecord<PendingReportPayload>(record)));
}

export function deletePendingReport(clientRequestId: string): Promise<undefined> {
  return transact<undefined>(REPORTS_STORE, 'readwrite', store => store.delete(clientRequestId));
}

export async function savePendingSos(payload: PendingSosPayload): Promise<void> {
  const record = await encryptRecord(payload.request.idempotencyKey, payload.createdAt, payload);
  await transact<IDBValidKey>(SOS_STORE, 'readwrite', store => store.put(record));
}

export async function getPendingSos(): Promise<PendingSosPayload[]> {
  const records = await transact<EncryptedRecord[]>(SOS_STORE, 'readonly', store => store.getAll());
  return Promise.all(records.map(record => decryptRecord<PendingSosPayload>(record)));
}
