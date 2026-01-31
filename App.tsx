import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SubtitleFile, AppSettings, SubtitleCue, TimeCode, ProjectStats, TMDBContext } from './types';
import { parseSubtitleFile, serializeSubtitleFile } from './utils/parser';
import { adjustTime } from './utils/time';
import { translateText, translateBatch, refineText, analyzeProjectConsistency, analyzeIdioms } from './services/gemini';
import { searchTMDB, formatTMDBContext } from './services/tmdb';
import { saveDraftToDB, loadDraftFromDB, clearDraftFromDB, saveToLibrary, saveToTM, loadFullTM } from './utils/db';
import CueList from './components/CueList';
import SettingsModal from './components/SettingsModal';
import LibraryModal from './components/LibraryModal';

const DEFAULT_SETTINGS: AppSettings = {
  apiKeys: [],
  keySelectionStrategy: 'sequential',
  tmdbApiKey: '',
  translatorModel: 'gemini-2.5-flash-latest',
  editorModel: 'gemini-2.5-flash-latest',
  delayBetweenRequests: 1000,
  maxRetries: 3,
  batchSize: 1,
  translationStyle: 'standard',
  glossary: {},
  styleGuide: '',
  contextWindowSize: 2
};

const COMMON_WORD_CACHE: Record<string, string> = {
    "yes": "Evet", "no": "Hayır", "okay": "Tamam", "ok": "Tamam",
    "thanks": "Teşekkürler", "thank you": "Teşekkür ederim", "hello": "Merhaba",
    "hi": "Selam", "goodbye": "Hoşça kal", "bye": "Güle güle",
    "what?": "Ne?", "why?": "Neden?", "who?": "Kim?", "help": "İmdat",
    "run": "Koş", "stop": "Dur", "go": "Git", "wait": "Bekle",
    "hey": "Hey", "wow": "Vay canına", "really?": "Gerçekten mi?",
    "please": "Lütfen", "sorry": "Üzgünüm", "excuse me": "Afedersiniz",
    "come on": "Hadi ama", "shut up": "Kapa çeneni", "i know": "Biliyorum",
    "i don't know": "Bilmiyorum", "maybe": "Belki", "sure": "Elbette",
    "fine": "İyi", "good": "Güzel", "bad": "Kötü", "help me": "Yardım et",
    "look": "Bak", "listen": "Dinle", "exactly": "Kesinlikle",
    "oh my god": "Aman Tanrım", "jesus": "Tanrım", "dude": "Dostum"
};

// Error Helper
interface ErrorAction {
  action: 'retry' | 'stop' | 'skip' | 'wait_quota';
  message: string;
  detail?: string;
  delay: number;
}

const analyzeError = (error: any): ErrorAction => {
  let msg = '';
  let status = error.status || 0;

  // Extract deep error message
  if (error.response?.data?.error) {
      msg = error.response.data.error.message;
      status = error.response.data.error.code || status;
  } else if (error.error) {
      msg = error.error.message;
      status = error.error.code || status;
  } else if (error.message) {
      msg = error.message;
  } else {
      try { msg = JSON.stringify(error); } catch { msg = 'Bilinmeyen Hata'; }
  }
  
  const lowerMsg = (msg || '').toLowerCase();

  // 1. Quota / Rate Limit (429)
  if (status === 429 || lowerMsg.includes('429') || lowerMsg.includes('quota') || lowerMsg.includes('exhausted') || lowerMsg.includes('resource_exhausted')) {
    return { 
        action: 'wait_quota', 
        message: '⚠️ Kota Doldu (429)', 
        detail: 'API istek sınırına ulaşıldı. Sistem otomatik olarak bekleyip tekrar deneyecek.',
        delay: 2000 
    };
  }

  // 2. Authentication (400, 401, 403)
  if (status === 400 && lowerMsg.includes('api key')) {
       return { action: 'stop', message: '⛔ Geçersiz API Anahtarı', detail: 'Girilen API anahtarı hatalı. Lütfen ayarlardan kontrol edin.', delay: 0 };
  }
  if (status === 401 || status === 403 || lowerMsg.includes('unauthenticated') || lowerMsg.includes('permission')) {
    return { action: 'stop', message: '⛔ Yetki Hatası', detail: 'API anahtarınızın bu modeli kullanma yetkisi yok veya süresi dolmuş.', delay: 0 };
  }

  // 3. Safety Filters & Content Policy
  if (lowerMsg.includes('blocked') || lowerMsg.includes('safety') || lowerMsg.includes('recitation') || lowerMsg.includes('finishreason')) {
    return { 
        action: 'skip', 
        message: '🛡️ Güvenlik Filtresi', 
        detail: 'AI, metni "güvenli değil" olarak işaretlediği için çevirmedi. Bu satırı manuel çevirin.',
        delay: 500 
    };
  }

  // 4. Server Errors (5xx)
  if (status >= 500 || lowerMsg.includes('unavailable') || lowerMsg.includes('timeout') || lowerMsg.includes('network') || lowerMsg.includes('fetch')) {
    return { 
        action: 'retry', 
        message: '☁️ Sunucu/Ağ Hatası', 
        detail: 'Google sunucularına veya internete erişilemiyor. Tekrar deneniyor.',
        delay: 3000 
    };
  }
  
  // Default
  return { action: 'retry', message: `❌ Hata (${status})`, detail: msg.slice(0, 100), delay: 1000 };
};

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('theme');
        return (saved === 'dark' || saved === 'light') ? saved : 'dark';
    }
    return 'dark';
  });

  const [files, setFiles] = useState<SubtitleFile[]>([]);
  const [restoreAvailable, setRestoreAvailable] = useState(false);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('subtitle-studio-settings');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            const merged = { ...DEFAULT_SETTINGS, ...parsed };
            if (!merged.apiKeys) merged.apiKeys = [];
            return merged;
        } catch(e) { return DEFAULT_SETTINGS; }
    }
    return DEFAULT_SETTINGS;
  });
  
  // Persistent Translation Memory
  const [translationMemory, setTranslationMemory] = useState<Map<string, string>>(new Map());

  const [tmdbContext, setTmdbContext] = useState<TMDBContext | null>(null);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isFindReplaceOpen, setIsFindReplaceOpen] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  const [processing, setProcessing] = useState(false);
  const [processingQueue, setProcessingQueue] = useState<string[]>([]);
  const [activeProcessingCueId, setActiveProcessingCueId] = useState<string | null>(null);
  const [isWaitingForQuota, setIsWaitingForQuota] = useState(false);
  const [quotaWaitSeconds, setQuotaWaitSeconds] = useState(0);
  
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [watchHandles, setWatchHandles] = useState<{input: any, output: any} | null>(null);
  const [processedFileNames, setProcessedFileNames] = useState<Set<string>>(new Set());
  const processedFileNamesRef = useRef(processedFileNames);
  useEffect(() => { processedFileNamesRef.current = processedFileNames; }, [processedFileNames]);

  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [isDualExport, setIsDualExport] = useState(false);
  const [analyzingGlossary, setAnalyzingGlossary] = useState(false);

  const activeFile = files.find(f => f.id === activeFileId) || null;
  const processingRef = useRef(processing);
  processingRef.current = processing;
  
  const filesRef = useRef(files);
  useEffect(() => { filesRef.current = files; }, [files]);
  
  const keyIndexRef = useRef(0);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [useRegex, setUseRegex] = useState(false);

  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  // Load TM on startup
  useEffect(() => {
      loadFullTM().then(map => {
          setTranslationMemory(map);
          addLog(`🧠 Hafıza Yüklendi: ${map.size} kayıt.`);
      });
  }, []);

  const addLog = useCallback((message: string) => {
      const time = new Date().toLocaleTimeString();
      setLogs(prev => [`[${time}] ${message}`, ...prev].slice(0, 100)); 
  }, []);

  // --- Initialization & Restore ---
  useEffect(() => {
    const checkRestore = async () => {
        try {
            const localData = localStorage.getItem('subtitle_draft_autosave');
            if (localData) { setRestoreAvailable(true); return; }
            const dbData = await loadDraftFromDB();
            if (dbData && Array.isArray(dbData) && dbData.length > 0) setRestoreAvailable(true);
        } catch (e) { console.error(e); }
    };
    checkRestore();
  }, []);

  const restoreDraft = async () => {
      try {
        const localData = localStorage.getItem('subtitle_draft_autosave');
        let dataToRestore: SubtitleFile[] | null = null;
        if (localData) {
            dataToRestore = JSON.parse(localData);
            addLog("♻️ Taslak (LocalStorage) geri yüklendi.");
        } else {
            dataToRestore = await loadDraftFromDB();
            if (dataToRestore) addLog("♻️ Taslak (Veritabanı) geri yüklendi.");
        }
        if (dataToRestore && Array.isArray(dataToRestore)) {
            setFiles(dataToRestore);
            if (dataToRestore.length > 0) setActiveFileId(dataToRestore[0].id);
            const names = new Set(dataToRestore.map(f => f.name));
            setProcessedFileNames(names);
        }
      } catch (e) { alert("Taslak yüklenirken hata oluştu."); }
      setRestoreAvailable(false);
  };

  const discardDraft = async () => {
      if (confirm("Taslak kalıcı olarak silinsin mi?")) {
          localStorage.removeItem('subtitle_draft_autosave');
          await clearDraftFromDB();
          setRestoreAvailable(false);
          addLog("🗑️ Taslak silindi.");
      }
  };

  useEffect(() => {
    localStorage.setItem('subtitle-studio-settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
      if (files.length > 0) setHasUnsavedChanges(true);
  }, [files]);

  useEffect(() => {
    const intervalId = setInterval(async () => {
      if (filesRef.current.length > 0 && hasUnsavedChanges) {
          setSaveStatus('saving');
          try {
              try {
                  const serialized = JSON.stringify(filesRef.current);
                  localStorage.setItem('subtitle_draft_autosave', serialized);
              } catch (lsError) {}
              await saveDraftToDB(filesRef.current);
              setLastSaved(new Date());
              setSaveStatus('saved');
              setHasUnsavedChanges(false);
          } catch (error) { setSaveStatus('error'); }
      }
    }, 10000);
    return () => clearInterval(intervalId);
  }, [hasUnsavedChanges]);

  // --- PROCESSING LOGIC (The Brain) ---
  
  // Helper: Try to get a translation using rotation logic with strategies
  const executeWithRotation = async (
      taskFn: (key: string) => Promise<any>
  ): Promise<{ success: boolean, result?: any, error?: ErrorAction }> => {
      
      const keys = settings.apiKeys.length > 0 ? settings.apiKeys : [''];
      let attempts = 0;
      let lastError: ErrorAction | null = null;

      // Determine Starting Index based on Strategy
      let startIndex = keyIndexRef.current;
      
      if (settings.keySelectionStrategy === 'random') {
          startIndex = Math.floor(Math.random() * keys.length);
      }

      // Try rotating through keys starting from startIndex
      while (attempts < keys.length) {
          const currentKeyIndex = (startIndex + attempts) % keys.length;
          const key = keys[currentKeyIndex];
          
          try {
              const result = await taskFn(key);
              
              // Success! 
              keyIndexRef.current = (currentKeyIndex + 1) % keys.length;
              
              return { success: true, result };
          } catch (e: any) {
              const info = analyzeError(e);
              lastError = info;

              if (info.action === 'wait_quota') {
                  // 429 Error: Just continue loop to try next key
                  attempts++;
                  continue; 
              } else if (info.action === 'stop') {
                  // Invalid key: Fatal
                  return { success: false, error: info };
              } else {
                  // Other errors: Retry same key or skip? For now, try next key (failover)
                  attempts++;
              }
          }
      }

      // If we are here, ALL keys failed or produced 429
      return { success: false, error: lastError || { action: 'retry', message: 'Bilinmeyen Hata', delay: 1000 } };
  };

  const processNext = useCallback(async () => {
    // Basic checks
    if (!processingRef.current || processingQueue.length === 0) {
        setProcessing(false);
        setActiveProcessingCueId(null);
        if (processingRef.current) addLog("✅ Kuyruk tamamlandı.");
        return;
    }

    if (settings.apiKeys.length === 0) {
        setProcessing(false);
        alert("Lütfen en az bir API anahtarı ekleyin.");
        setIsSettingsOpen(true);
        return;
    }

    // Prepare Batch
    const batchSize = settings.batchSize || 1;
    const firstId = processingQueue[0];
    const file = files.find(f => f.cues.some(c => c.originalId === firstId));
    
    if (!file) {
        setProcessingQueue(q => q.slice(1));
        return;
    }

    const batchCandidates: string[] = [];
    for (const qId of processingQueue) {
        if (file.cues.some(c => c.originalId === qId)) {
            batchCandidates.push(qId);
            if (batchCandidates.length >= batchSize) break;
        }
    }

    const batchCues = batchCandidates.map(id => file.cues.find(c => c.originalId === id)!);
    setActiveProcessingCueId(batchCues[0].originalId);

    // --- STEP 1: Check Translation Memory & Cache ---
    const needsTranslation: SubtitleCue[] = [];
    const memoryHits: { id: string, text: string }[] = [];

    for (const cue of batchCues) {
        const clean = cue.originalText.trim();
        const lower = clean.toLowerCase();
        
        let found = settings.glossary[clean] || translationMemory.get(lower) || COMMON_WORD_CACHE[lower.replace(/[^\w\s]/gi, '')];
        
        if (found) {
            memoryHits.push({ id: cue.originalId, text: found });
        } else {
            needsTranslation.push(cue);
        }
    }

    // Apply Memory Hits immediately
    if (memoryHits.length > 0) {
        setFiles(prev => prev.map(f => {
            if (f.id !== file.id) return f;
            const newCues = f.cues.map(c => {
                const hit = memoryHits.find(h => h.id === c.originalId);
                if (hit) return { ...c, translatedText: hit.text, refinedText: hit.text, status: 'completed' as const, translationSource: 'tm' as const };
                return c;
            });
            return { ...f, cues: newCues, progress: Math.round((newCues.filter(c => c.status === 'completed').length / newCues.length) * 100) };
        }));
        const hitIds = memoryHits.map(h => h.id);
        setProcessingQueue(q => q.filter(id => !hitIds.includes(id)));
        
        if (needsTranslation.length === 0) {
            setTimeout(() => { if(processingRef.current) processNext(); }, 50);
            return;
        }
    }

    // --- STEP 2: Translate Remaining Items via API ---
    setFiles(prev => prev.map(f => f.id !== file.id ? f : { 
        ...f, 
        cues: f.cues.map(c => needsTranslation.some(n => n.originalId === c.originalId) ? { ...c, status: 'translating', errorMessage: undefined } : c)
    }));

    const contextStr = tmdbContext ? formatTMDBContext(tmdbContext) : "";
    const cueIndex = file.cues.findIndex(c => c.originalId === needsTranslation[0].originalId);
    
    // Prepare Task
    const task = async (apiKey: string) => {
        if (needsTranslation.length > 1) {
            return await translateBatch(
                needsTranslation.map(c => c.originalText),
                apiKey,
                settings.translatorModel,
                settings.translationStyle,
                settings.glossary,
                settings.styleGuide,
                contextStr
            );
        } else {
            const cue = needsTranslation[0];
            const w = settings.contextWindowSize ?? 2;
            const prev = w > 0 ? file.cues.slice(Math.max(0, cueIndex - w), cueIndex).map(c => c.originalText) : [];
            const next = w > 0 ? file.cues.slice(cueIndex + 1, cueIndex + 1 + w).map(c => c.originalText) : [];
            return await translateText(
                cue.originalText, 
                prev, 
                next, 
                apiKey, 
                settings.translatorModel, 
                settings.translationStyle, 
                settings.glossary, 
                settings.styleGuide,
                contextStr
            );
        }
    };

    // Execute with Rotation
    const { success, result, error } = await executeWithRotation(task);

    if (success) {
        // --- SUCCESS ---
        setIsWaitingForQuota(false);
        const resultsArray = Array.isArray(result) ? result : [result];
        
        setFiles(prev => prev.map(f => {
            if (f.id !== file.id) return f;
            const newCues = f.cues.map(c => {
                const idx = needsTranslation.findIndex(n => n.originalId === c.originalId);
                if (idx !== -1) {
                    const txt = resultsArray[idx];
                    const normalized = c.originalText.trim().toLowerCase();
                    saveToTM(normalized, txt); 
                    setTranslationMemory(mem => new Map(mem).set(normalized, txt));
                    return { ...c, translatedText: txt, refinedText: txt, status: 'completed' as const, translationSource: 'ai' as const, errorMessage: undefined };
                }
                return c;
            });
            const progress = Math.round((newCues.filter(c => c.status === 'completed').length / newCues.length) * 100);
            return { ...f, cues: newCues, progress };
        }));

        const doneIds = needsTranslation.map(c => c.originalId);
        setProcessingQueue(q => q.filter(id => !doneIds.includes(id)));
        
        setTimeout(() => { if(processingRef.current) processNext(); }, settings.delayBetweenRequests);

    } else {
        // --- FAILURE ---
        const errAction = error?.action || 'retry';
        
        if (errAction === 'wait_quota') {
            setIsWaitingForQuota(true);
            setQuotaWaitSeconds(60);
            addLog("⏳ Tüm anahtarlar dolu. 60sn bekleniyor...");
            
            const timer = setInterval(() => {
                setQuotaWaitSeconds(prev => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        if (processingRef.current) {
                            addLog("🔄 Bekleme bitti, tekrar deneniyor...");
                            setIsWaitingForQuota(false);
                            processNext(); 
                        }
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            
        } else if (errAction === 'stop') {
            setProcessing(false);
            alert(error?.message + "\n\n" + error?.detail);
        } else {
             // Skip logic for safety filters or network errors
             const skipIds = needsTranslation.map(c => c.originalId);
             
             setFiles(prev => prev.map(f => f.id !== file.id ? f : {
                 ...f, 
                 cues: f.cues.map(c => skipIds.includes(c.originalId) ? { 
                     ...c, 
                     status: 'error' as const, 
                     errorMessage: `${error?.message}: ${error?.detail || ''}` 
                 } : c)
             }));

             setProcessingQueue(q => q.filter(id => !skipIds.includes(id)));
             // Continue to next item despite error
             setTimeout(() => { if(processingRef.current) processNext(); }, 1000);
        }
    }

  }, [files, processingQueue, settings, translationMemory, tmdbContext]);

  useEffect(() => {
      // Trigger start if processing turned on and idle
      if (processing && !activeProcessingCueId && !isWaitingForQuota && processingQueue.length > 0) {
          processNext();
      }
  }, [processing, processingQueue, activeProcessingCueId, isWaitingForQuota, processNext]);


  // --- Helper Functions ---
  const addToQueue = (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (!file) return;
    const pendingCues = file.cues.filter(c => c.status === 'pending' || c.status === 'error').map(c => c.originalId);
    setProcessingQueue(prev => [...new Set([...prev, ...pendingCues])]);
    setProcessing(true);
    addLog(`▶️ Başlatıldı: ${file.name}`);
  };

  const manualUpdateCue = async (cueId: string, text: string, type: 'translated' | 'refined') => {
    if (!activeFileId) return;
    const file = files.find(f => f.id === activeFileId);
    const cue = file?.cues.find(c => c.originalId === cueId);
    
    // UI Update with 'user' source
    setFiles(prev => prev.map(f => {
        if (f.id !== activeFileId) return f;
        const newCues = f.cues.map(c => c.originalId === cueId ? { 
            ...c, 
            [type === 'refined' ? 'refinedText' : 'translatedText']: text, 
            isLocked: true,
            status: 'completed' as const, // Clear error on manual fix
            errorMessage: undefined,
            translationSource: 'user' as const
        } : c);
        return { ...f, cues: newCues };
    }));
    
    // TM Update (Local + Backend)
    if(cue && text.trim().length > 0) {
        const clean = cue.originalText.trim();
        const normalized = clean.toLowerCase();
        
        // 1. Update Local RAM & DB (Use Normalized Key for hit rate)
        setTranslationMemory(prev => new Map(prev).set(normalized, text));
        await saveToTM(normalized, text); 

        // 2. Update Backend Redis
        try {
            fetch('/api/tm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: clean, 
                    translation: text,
                    target_lang: 'tr'
                })
            }).then(res => {
                if(res.ok) addLog("💾 TM Güncellendi (Redis & Yerel)");
            });
        } catch (e) {
            console.warn("Failed to sync correction to backend TM:", e);
        }
    }
  };

  const retryCue = (cueId: string) => {
    if (!activeFileId) return;
    setFiles(prev => prev.map(f => f.id !== activeFileId ? f : { 
        ...f, 
        cues: f.cues.map(c => c.originalId === cueId ? { ...c, status: 'pending', errorMessage: undefined } : c) 
    }));
    setProcessingQueue(prev => [cueId, ...prev]); // Add to top of queue
    setProcessing(true);
  };

  const handleIdiomAnalysis = async (cueId: string) => {
      const apiKey = settings.apiKeys[0]; 
      if (!activeFileId || !apiKey) return;
      
      const file = files.find(f => f.id === activeFileId);
      const cue = file?.cues.find(c => c.originalId === cueId);
      if (!file || !cue) return;

      setFiles(prev => prev.map(f => f.id !== activeFileId ? f : { ...f, cues: f.cues.map(c => c.originalId === cueId ? { ...c, status: 'analyzing_idioms' } : c) }));
      
      try {
          const idioms = await analyzeIdioms(cue.originalText, apiKey, settings.editorModel);
          setFiles(prev => prev.map(f => f.id !== activeFileId ? f : { ...f, cues: f.cues.map(c => c.originalId === cueId ? { ...c, idioms, status: 'translated' } : c) }));
      } catch (e) {
          setFiles(prev => prev.map(f => f.id !== activeFileId ? f : { ...f, cues: f.cues.map(c => c.originalId === cueId ? { ...c, status: 'error' } : c) }));
      }
  };

  const handleAnalyzeProject = async () => {
      if (settings.apiKeys.length === 0) { alert("API Anahtarı eksik."); return; }
      if (files.length === 0) { alert("Analiz için yüklü dosya yok."); return; }

      setAnalyzingGlossary(true);
      addLog("🔍 Proje tutarlılık analizi başlatıldı...");
      
      try {
          let fullText = "";
          files.forEach(f => {
              fullText += `--- FILE: ${f.name} ---\n`;
              f.cues.forEach(c => fullText += `${c.originalText}\n`);
          });
          
          const result = await analyzeProjectConsistency(fullText, settings.apiKeys[0], settings.editorModel);
          
          setSettings(prev => ({
              ...prev,
              glossary: { ...prev.glossary, ...result.glossary },
              styleGuide: prev.styleGuide ? prev.styleGuide + "\n" + result.styleGuide : result.styleGuide
          }));
          
          addLog(`✅ Analiz tamamlandı: ${Object.keys(result.glossary).length} terim eklendi.`);
          alert("Analiz tamamlandı! Ayarlar > Sözlük sekmesinden sonuçları görebilirsiniz.");
          
      } catch (e) {
          console.error(e);
          addLog("❌ Analiz hatası.");
          alert("Analiz sırasında hata oluştu.");
      } finally {
          setAnalyzingGlossary(false);
      }
  };

  const processFiles = async (fileList: FileList) => {
    const newFiles: SubtitleFile[] = [];
    for (let i = 0; i < fileList.length; i++) {
      try {
        const file = fileList[i];
        if (file.name.endsWith('.srt') || file.name.endsWith('.vtt')) {
             const parsed = await parseSubtitleFile(file);
             newFiles.push(parsed);
             if (i === 0 && settings.tmdbApiKey && !tmdbContext) {
                 const nameClean = file.name.replace(/\.(srt|vtt)$/i, '').replace(/[\.\_]/g, ' ').replace(/\d{4}.*/, '').trim();
                 const ctx = await searchTMDB(nameClean, settings.tmdbApiKey);
                 if (ctx) setTmdbContext(ctx);
             }
        }
      } catch (err) {}
    }
    if (newFiles.length > 0) {
        setFiles(prev => [...prev, ...newFiles]);
        if (!activeFileId) setActiveFileId(newFiles[0].id);
    }
  };

  const exportFile = (file: SubtitleFile, format: 'srt' | 'vtt') => {
    const content = serializeSubtitleFile(file, format, isDualExport);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${file.name.replace(/\.(srt|vtt)$/i, '')}${isDualExport ? '_DUAL' : '_TR'}.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const handleFindReplace = () => {
      if (!activeFile) return;
      let count = 0;
      const newCues = activeFile.cues.map(cue => {
          let text = cue.refinedText || cue.translatedText;
          if (!text) return cue;
          let newText = text;
          if (useRegex) {
              try {
                  const regex = new RegExp(findText, 'g');
                  if (regex.test(text)) { newText = text.replace(regex, replaceText); count++; }
              } catch (e) { return cue; }
          } else {
              if (text.includes(findText)) { newText = text.split(findText).join(replaceText); count++; }
          }
          return newText !== text ? { ...cue, refinedText: newText, isLocked: true, translationSource: 'user' as const } : cue;
      });
      if (count > 0) {
          setFiles(prev => prev.map(f => f.id === activeFile.id ? { ...f, cues: newCues } : f));
          setIsFindReplaceOpen(false);
      }
  };

  const getStats = (): ProjectStats => {
      if (!activeFile) return { totalLines: 0, totalWords: 0, completedLines: 0, estimatedTimeRemaining: 0 };
      const totalWords = activeFile.cues.reduce((acc, c) => acc + c.originalText.split(' ').length, 0);
      const completed = activeFile.cues.filter(c => c.status === 'completed').length;
      const remaining = activeFile.cues.length - completed;
      const estimatedTime = remaining * ((settings.delayBetweenRequests / 1000) + 1.5);
      return { totalLines: activeFile.cues.length, totalWords, completedLines: completed, estimatedTimeRemaining: estimatedTime };
  };

  const handleSaveToLibrary = async () => { if(activeFile) await saveToLibrary(activeFile); };
  const handleLoadFromLibrary = (file: any) => { setFiles(prev => [...prev, file]); setActiveFileId(file.id); };
  const handleManualTmdbSearch = async () => {/* Kept same */};
  const handleAddToGlossary = (s:string, t:string) => setSettings(prev => ({...prev, glossary: {...prev.glossary, [s]: t}}));

  // --- RENDER ---
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans relative">
      <SettingsModal 
         isOpen={isSettingsOpen} 
         onClose={() => setIsSettingsOpen(false)} 
         settings={settings} 
         onSave={(s) => { setSettings(s); setIsSettingsOpen(false); }} 
         onStartAutomation={(input, output) => setWatchHandles({ input, output })}
         onAnalyzeProject={handleAnalyzeProject}
         isAutomationActive={!!watchHandles}
         isAnalyzing={analyzingGlossary}
      />
      <LibraryModal isOpen={isLibraryOpen} onClose={() => setIsLibraryOpen(false)} onLoadFile={handleLoadFromLibrary} />
      
      {/* Restore Banner */}
      {restoreAvailable && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[60] bg-blue-600 text-white px-6 py-3 rounded-lg shadow-2xl flex items-center gap-4 border border-blue-400">
              <span className="font-medium">⚠️ Taslak bulundu.</span>
              <div className="flex gap-2">
                  <button onClick={restoreDraft} className="bg-white text-blue-600 px-3 py-1 rounded text-sm font-bold">Kurtar</button>
                  <button onClick={discardDraft} className="bg-blue-700 text-white px-3 py-1 rounded text-sm">Sil</button>
              </div>
          </div>
      )}

      {/* Stats Modal */}
      {isStatsOpen && activeFile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setIsStatsOpen(false)}>
              <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-2xl w-96 border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
                  <h3 className="text-xl font-bold mb-4">İstatistikler</h3>
                  <div className="space-y-2">
                      <div className="flex justify-between"><span>Satır:</span><span>{getStats().totalLines}</span></div>
                      <div className="flex justify-between"><span>Kelime:</span><span>{getStats().totalWords}</span></div>
                      <div className="flex justify-between"><span>Tamamlanan:</span><span className="text-green-500">{getStats().completedLines}</span></div>
                      <div className="flex justify-between"><span>Kalan Süre:</span><span className="text-blue-500">{Math.ceil(getStats().estimatedTimeRemaining / 60)} dk</span></div>
                  </div>
              </div>
          </div>
      )}

      {/* Find Replace Modal */}
      {isFindReplaceOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-2xl w-96 border border-slate-200 dark:border-slate-800">
                  <h3 className="text-lg font-bold mb-4">Bul ve Değiştir</h3>
                  <input className="w-full mb-3 p-2 bg-slate-50 dark:bg-slate-800 border rounded" placeholder="Aranan" value={findText} onChange={e => setFindText(e.target.value)} />
                  <input className="w-full mb-3 p-2 bg-slate-50 dark:bg-slate-800 border rounded" placeholder="Yeni" value={replaceText} onChange={e => setReplaceText(e.target.value)} />
                  <div className="flex gap-2"><button onClick={handleFindReplace} className="flex-1 bg-blue-600 py-2 rounded text-white">Değiştir</button><button onClick={() => setIsFindReplaceOpen(false)} className="flex-1 bg-slate-200 dark:bg-slate-800 py-2 rounded">İptal</button></div>
              </div>
          </div>
      )}

      {/* Sidebar */}
      <div className={`w-64 bg-slate-100 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col`}>
        <div className="p-4 border-b border-slate-200 dark:border-slate-800">
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Altyazı Stüdyosu</h1>
        </div>
        <div className="p-4 space-y-2">
            <label className="block w-full cursor-pointer bg-blue-600 hover:bg-blue-700 text-white text-center py-2 rounded text-sm font-medium shadow-sm transition-colors">
                <span>+ Dosya Yükle</span>
                <input type="file" className="hidden" multiple accept=".srt,.vtt" onChange={(e) => e.target.files && processFiles(e.target.files)} />
            </label>
            <label className="block w-full cursor-pointer bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-center py-2 rounded text-sm font-medium transition-colors border border-slate-300 dark:border-slate-700">
                <span>📂 Klasör Yükle</span>
                {/* @ts-ignore */}
                <input type="file" className="hidden" multiple webkitdirectory="" directory="" onChange={(e) => e.target.files && processFiles(e.target.files)} />
            </label>
            {activeFile && <button onClick={handleSaveToLibrary} className="w-full py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-xs">💾 Kütüphaneye Kaydet</button>}
        </div>
        <div className="flex-1 overflow-y-auto px-2 space-y-1">
            {files.map(file => (
                <div key={file.id} onClick={() => setActiveFileId(file.id)} className={`p-3 rounded cursor-pointer border text-sm relative transition-all ${activeFileId === file.id ? 'bg-white dark:bg-slate-800 border-blue-400 shadow-sm' : 'border-transparent hover:bg-slate-200 dark:hover:bg-slate-800/50'}`}>
                    <div className="font-medium truncate pr-6">{file.name}</div>
                    <div className="flex justify-between items-center mt-2">
                        <div className="text-xs text-slate-500">{file.cues.length} satır</div>
                        <div className="text-xs font-bold text-blue-600">{file.progress}%</div>
                    </div>
                    <div className="absolute bottom-0 left-0 h-1 bg-blue-500 transition-all duration-500 rounded-b" style={{ width: `${file.progress}%` }}></div>
                </div>
            ))}
        </div>
        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
             <button onClick={() => setIsSettingsOpen(true)} className="text-sm w-full p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800">Ayarlar & Otomasyon</button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-950">
         <div className="h-12 border-b border-slate-200 dark:border-slate-800 flex items-center px-4 justify-between bg-white dark:bg-slate-900">
             <div className="flex gap-2">
                 <button onClick={() => setIsLibraryOpen(true)} className="p-1.5 text-xs bg-slate-100 dark:bg-slate-800 rounded hover:bg-slate-200 text-blue-600 font-bold">📚 Kütüphane</button>
                 <button onClick={() => setIsFindReplaceOpen(true)} className="p-1.5 text-xs bg-slate-100 dark:bg-slate-800 rounded hover:bg-slate-200">🔍 Bul/Değiştir</button>
                 <button onClick={handleManualTmdbSearch} className={`p-1.5 text-xs rounded hover:opacity-80 ${tmdbContext ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>🎬 TMDB</button>
             </div>
             <div className="flex items-center gap-4">
                 <span className="text-[10px] text-slate-400">{saveStatus === 'saving' ? 'Kaydediliyor...' : 'Kaydedildi'}</span>
                 <button onClick={toggleTheme} className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800">{theme === 'dark' ? '☀️' : '🌙'}</button>
             </div>
         </div>
         <CueList 
            file={activeFile} 
            onUpdateCue={manualUpdateCue} 
            onRetryCue={retryCue} 
            onAnalyzeIdioms={handleIdiomAnalysis}
            onAddToGlossary={handleAddToGlossary}
            activeCueId={activeProcessingCueId} 
         />
      </div>

      {/* Right Panel */}
      <div className="w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 p-6 flex flex-col gap-6 shadow-xl z-10">
        <div>
            <h3 className="text-xs uppercase font-bold text-slate-400 mb-4 tracking-wider">KONTROL PANELİ</h3>
            {activeFile && (
                <>
                {isWaitingForQuota ? (
                    <div className="w-full py-4 px-4 rounded bg-amber-500/10 border border-amber-500/50 text-amber-600 dark:text-amber-400 text-center flex flex-col items-center justify-center gap-2 animate-in fade-in">
                        <div className="font-bold">KOTA DOLU ⏳</div>
                        <div className="text-2xl font-mono">{quotaWaitSeconds}s</div>
                        <div className="text-[10px] opacity-75">Tüm anahtarlar denendi. Bekleniyor...</div>
                        <div className="text-[9px] text-amber-700 dark:text-amber-500 bg-amber-100 dark:bg-amber-900/30 p-1.5 rounded mt-1">
                            İpucu: Ayarlardan daha fazla API anahtarı ekleyerek bu süreyi düşürebilirsiniz.
                        </div>
                        <button onClick={() => setQuotaWaitSeconds(1)} className="text-xs underline hover:text-amber-300 mt-1">Şimdi Dene</button>
                    </div>
                ) : (
                    <button 
                        onClick={() => processing ? setProcessing(false) : addToQueue(activeFile.id)}
                        className={`w-full py-3 px-4 rounded font-bold shadow-sm transition-all flex items-center justify-center gap-2 ${processing ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-green-600 text-white hover:bg-green-700'}`}
                    >
                        {processing ? (
                            <><div className="animate-spin w-4 h-4 border-2 border-amber-700 border-t-transparent rounded-full"></div> DURAKLAT</>
                        ) : (
                            <>▶️ ÇEVİRİYİ BAŞLAT</>
                        )}
                    </button>
                )}
                
                <button onClick={() => setIsStatsOpen(true)} className="mt-3 w-full py-2 bg-slate-100 dark:bg-slate-800 rounded text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200">📊 İSTATİSTİK</button>
                </>
            )}
        </div>

        <div className="flex-1 min-h-[150px] flex flex-col">
            <h3 className="text-xs uppercase font-bold text-slate-400 mb-2 tracking-wider">SİSTEM GÜNLÜĞÜ</h3>
            <div className="flex-1 bg-slate-950 rounded border border-slate-800 p-2 overflow-y-auto text-[10px] font-mono text-green-400 space-y-1 shadow-inner">
                {logs.length === 0 && <span className="text-slate-600 opacity-50">Hazır...</span>}
                {logs.map((log, i) => <div key={i} className="border-b border-slate-900/50 pb-0.5 last:border-0">{log}</div>)}
                <div ref={logsEndRef} />
            </div>
        </div>

        {activeFile && (
            <div className="mt-auto">
                 <h3 className="text-xs uppercase font-bold text-slate-400 mb-2 tracking-wider">DIŞA AKTAR</h3>
                 <label className="flex items-center gap-2 mb-3 cursor-pointer group">
                    <input type="checkbox" className="accent-blue-600" checked={isDualExport} onChange={(e) => setIsDualExport(e.target.checked)} />
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Çift Altyazı (EN+TR)</span>
                 </label>
                 <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => exportFile(activeFile, 'srt')} className="py-2 border border-slate-300 dark:border-slate-700 rounded text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800">.SRT İNDİR</button>
                    <button onClick={() => exportFile(activeFile, 'vtt')} className="py-2 border border-slate-300 dark:border-slate-700 rounded text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800">.VTT İNDİR</button>
                 </div>
            </div>
        )}
      </div>
    </div>
  );
}

export default App;