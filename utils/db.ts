import { SubtitleFile } from './types';

const DB_NAME = 'SubtitleStudioDB';
const DB_VERSION = 3; // Version bumped to add 'translation_memory'

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
        reject(new Error("Tarayıcınız IndexedDB desteklemiyor."));
        return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Draft Store
      if (!db.objectStoreNames.contains('drafts')) {
        db.createObjectStore('drafts');
      }

      // Library Store
      if (!db.objectStoreNames.contains('library')) {
        db.createObjectStore('library', { keyPath: 'id' });
      }

      // Translation Memory Store (New)
      // Key: Original Text (hash or raw), Value: Translated Text
      if (!db.objectStoreNames.contains('translation_memory')) {
        db.createObjectStore('translation_memory');
      }
    };
  });
};

// --- DRAFT OPERATIONS ---

export const saveDraftToDB = async (data: any): Promise<void> => {
  try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('drafts', 'readwrite');
        const store = transaction.objectStore('drafts');
        const request = store.put(data, 'current_session');

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
  } catch (error) {
      console.error("IndexedDB Save Error:", error);
      throw error;
  }
};

export const loadDraftFromDB = async (): Promise<any> => {
  try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('drafts', 'readonly');
        const store = transaction.objectStore('drafts');
        const request = store.get('current_session');

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
  } catch (error) {
      console.error("IndexedDB Load Error:", error);
      return null;
  }
};

export const clearDraftFromDB = async (): Promise<void> => {
  try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('drafts', 'readwrite');
        const store = transaction.objectStore('drafts');
        const request = store.delete('current_session');

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
  } catch (error) {
       console.error("IndexedDB Clear Error:", error);
  }
};

// --- LIBRARY OPERATIONS ---

export type LibraryItem = SubtitleFile & {
    savedAt: Date;
};

export const saveToLibrary = async (file: SubtitleFile): Promise<void> => {
    try {
        const db = await openDB();
        const item: LibraryItem = { ...file, savedAt: new Date() };
        return new Promise((resolve, reject) => {
            const transaction = db.transaction('library', 'readwrite');
            const store = transaction.objectStore('library');
            const request = store.put(item);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error("Library Save Error:", error);
        throw error;
    }
};

export const loadLibrary = async (): Promise<LibraryItem[]> => {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction('library', 'readonly');
            const store = transaction.objectStore('library');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error("Library Load Error:", error);
        return [];
    }
};

export const deleteFromLibrary = async (id: string): Promise<void> => {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction('library', 'readwrite');
            const store = transaction.objectStore('library');
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error("Library Delete Error:", error);
        throw error;
    }
};

// --- TRANSLATION MEMORY OPERATIONS ---

export const saveToTM = async (original: string, translated: string): Promise<void> => {
    if (!original || !translated) return;
    try {
        const db = await openDB();
        const key = original.trim();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction('translation_memory', 'readwrite');
            const store = transaction.objectStore('translation_memory');
            const request = store.put(translated, key);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error("TM Save Error:", error);
    }
};

export const loadFullTM = async (): Promise<Map<string, string>> => {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction('translation_memory', 'readonly');
            const store = transaction.objectStore('translation_memory');
            // Using cursor is better for large datasets, but getAll is simpler for now
            const request = store.getAllKeys();
            
            request.onsuccess = async () => {
                const keys = request.result as string[];
                const map = new Map<string, string>();
                
                // If TM is huge, we might want to lazy load. For now, let's load all.
                // Doing separate gets might be slow, let's use a cursor approach instead.
                
                const cursorReq = store.openCursor();
                cursorReq.onsuccess = (e) => {
                    const cursor = (e.target as IDBRequest).result;
                    if (cursor) {
                        map.set(cursor.key as string, cursor.value as string);
                        cursor.continue();
                    } else {
                        resolve(map);
                    }
                };
                cursorReq.onerror = () => reject(cursorReq.error);
            };
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error("TM Load Error:", error);
        return new Map();
    }
};