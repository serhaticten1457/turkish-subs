import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SubtitleFile, AppSettings, SubtitleCue, TimeCode, ProjectStats, TMDBContext } from './types';
import { parseSubtitleFile, serializeSubtitleFile } from './utils/parser';
import { adjustTime } from './utils/time';
import { translateText, translateBatch, refineText, extractGlossaryFromText, analyzeIdioms } from './services/gemini';
import { searchTMDB, formatTMDBContext } from './services/tmdb';
import { saveDraftToDB, loadDraftFromDB, clearDraftFromDB } from './utils/db';
import CueList from './components/CueList';
import SettingsModal from './components/SettingsModal';

const DEFAULT_SETTINGS: AppSettings = {
  apiKeys: [],
  tmdbApiKey: '',
  translatorModel: 'gemini-2.5-flash-latest', // Default to Flash for higher rate limits
  editorModel: 'gemini-2.5-flash-latest', // Use Flash for editing too to save quota
  delayBetweenRequests: 1000,
  maxRetries: 3,
  batchSize: 1, // Start safe
  translationStyle: 'standard',
  glossary: {},
  contextWindowSize: 2 // Default enabled
};

// Smart Cache for common words (Client-side lightweight cache)
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
  action: 'retry' | 'stop' | 'skip';
  message: string;
  delay: number;
}

const analyzeError = (error: any): ErrorAction => {
  // Handle various error structures (Nested Google API errors)
  let msg = '';
  let status = error.status || 0;

  if (error.response?.data?.error) {
      msg = error.response.data.error.message;
      status = error.response.data.error.code || status;
  } else if (error.error) {
      // Structure: {"error":{"code":429,"message":"..."}}
      msg = error.error.message;
      status = error.error.code || status;
  } else if (error.message) {
      msg = error.message;
  } else {
      try {
          msg = JSON.stringify(error);
      } catch {
          msg = 'Unknown error';
      }
  }
  
  msg = (msg || '').toLowerCase();

  if (status === 429 || msg.includes('429') || msg.includes('quota') || msg.includes('exhausted') || msg.includes('resource_exhausted')) {
    // 429 Quota Exceeded needs a long cooldown or a stop
    return { action: 'retry', message: '⚠️ Kota Aşıldı (429): Bekleniyor...', delay: 30000 };
  }
  if (status === 401 || status === 403 || msg.includes('api key') || msg.includes('unauthenticated')) {
    return { action: 'stop', message: '⛔ Yetki Hatası: API Anahtarı geçersiz.', delay: 0 };
  }
  if (status >= 500 || msg.includes('unavailable') || msg.includes('timeout') || msg.includes('network')) {
    return { action: 'retry', message: '☁️ Sunucu Hatası: Tekrar deneniyor...', delay: 5000 };
  }
  if (msg.includes('blocked') || msg.includes('safety') || msg.includes('recitation')) {
    return { action: 'skip', message: '🛡️ Güvenlik Filtresi: Satır atlandı.', delay: 500 };
  }
  
  return { action: 'skip', message: `❌ Hata: ${msg.slice(0, 60)}...`, delay: 1000 };
};

function App() {
  // Theme State
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
  
  // Settings
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('subtitle-studio-settings');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            const merged = { ...DEFAULT_SETTINGS, ...parsed };
            if (!merged.apiKeys) {
                const keys = [];
                if (parsed.translatorApiKey) keys.push(parsed.translatorApiKey);
                if (parsed.editorApiKey && parsed.editorApiKey !== parsed.translatorApiKey) keys.push(parsed.editorApiKey);
                merged.apiKeys = keys;
            }
            return merged;
        } catch(e) { return DEFAULT_SETTINGS; }
    }
    return DEFAULT_SETTINGS;
  });
  
  // Internal Translation Memory (Runtime Only)
  const [translationMemory, setTranslationMemory] = useState<Map<string, string>>(new Map());

  // Context Data
  const [tmdbContext, setTmdbContext] = useState<TMDBContext | null>(null);
  
  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isFindReplaceOpen, setIsFindReplaceOpen] = useState(false);

  // Processing
  const [processing, setProcessing] = useState(false);
  const [processingQueue, setProcessingQueue] = useState<string[]>([]);
  const [activeProcessingCueId, setActiveProcessingCueId] = useState<string | null>(null);
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);
  
  // Auto-save & Automation
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // --- AUTOMATION STATE ---
  const [watchHandles, setWatchHandles] = useState<{input: any, output: any} | null>(null);
  const [processedFileNames, setProcessedFileNames] = useState<Set<string>>(new Set());
  const processedFileNamesRef = useRef(processedFileNames);
  useEffect(() => { processedFileNamesRef.current = processedFileNames; }, [processedFileNames]);

  // Tools
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [isDualExport, setIsDualExport] = useState(false);
  const [analyzingGlossary, setAnalyzingGlossary] = useState(false);

  // Refs
  const activeFile = files.find(f => f.id === activeFileId) || null;
  const processingRef = useRef(processing);
  processingRef.current = processing;
  
  const filesRef = useRef(files);
  useEffect(() => { filesRef.current = files; }, [files]);
  
  // Key Rotation Ref
  const keyIndexRef = useRef(0);

  // Find & Replace State
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [useRegex, setUseRegex] = useState(false);

  // --- Theme Logic ---
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  // Helper: Round-Robin Key Selector
  const getApiKey = useCallback(() => {
      if (!settings.apiKeys || settings.apiKeys.length === 0) return '';
      const key = settings.apiKeys[keyIndexRef.current % settings.apiKeys.length];
      keyIndexRef.current++;
      return key;
  }, [settings.apiKeys]);

  const addLog = useCallback((message: string) => {
      const time = new Date().toLocaleTimeString();
      setLogs(prev => [`[${time}] ${message}`, ...prev].slice(0, 100)); 
  }, []);

  // --- Initialization & Restore ---
  useEffect(() => {
    const checkRestore = async () => {
        try {
            // Check LocalStorage first (Fast)
            const localData = localStorage.getItem('subtitle_draft_autosave');
            if (localData) {
                 setRestoreAvailable(true);
                 return;
            }

            // Check IndexedDB (Backup)
            const dbData = await loadDraftFromDB();
            if (dbData && Array.isArray(dbData) && dbData.length > 0) {
                setRestoreAvailable(true);
            }
        } catch (e) {
            console.error("Failed to check restore availability", e);
        }
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
            
            // Populate Processed Names for Automation to check duplicates if re-enabled
            const names = new Set(dataToRestore.map(f => f.name));
            setProcessedFileNames(names);

            // Hydrate Memory
            const mem = new Map<string, string>();
            dataToRestore.forEach(f => f.cues.forEach(c => {
                if (c.status === 'completed' && c.translatedText) {
                    mem.set(c.originalText.trim(), c.translatedText);
                }
            }));
            setTranslationMemory(mem);
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

  // --- Auto-Save Logic (10s Interval) ---
  useEffect(() => {
      if (files.length > 0) {
          setHasUnsavedChanges(true);
      }
  }, [files]);

  useEffect(() => {
    const intervalId = setInterval(async () => {
      // Check if we have files and unsaved changes
      if (filesRef.current.length > 0 && hasUnsavedChanges) {
          setSaveStatus('saving');
          try {
              try {
                  const serialized = JSON.stringify(filesRef.current);
                  localStorage.setItem('subtitle_draft_autosave', serialized);
              } catch (lsError) {
                  console.warn("LocalStorage quota exceeded, relying on DB.");
              }

              await saveDraftToDB(filesRef.current);
              
              setLastSaved(new Date());
              setSaveStatus('saved');
              setHasUnsavedChanges(false);
          } catch (error) {
              setSaveStatus('error');
              addLog("⚠️ Otomatik kayıt hatası");
          }
      }
    }, 10000); // 10 Seconds Interval

    return () => clearInterval(intervalId);
  }, [hasUnsavedChanges, addLog]);


  // --- WATCH FOLDER LOGIC (Polling) ---
  useEffect(() => {
      if (!watchHandles || !watchHandles.input) return;

      const pollInterval = setInterval(async () => {
          try {
              // @ts-ignore
              for await (const entry of watchHandles.input.values()) {
                  if (entry.kind === 'file' && (entry.name.endsWith('.srt') || entry.name.endsWith('.vtt'))) {
                      // Check if already processed
                      if (processedFileNamesRef.current.has(entry.name)) continue;

                      // New File Detected!
                      addLog(`⚡ OTOMASYON: Yeni dosya algılandı -> ${entry.name}`);
                      setProcessedFileNames(prev => new Set(prev).add(entry.name));

                      const fileData = await entry.getFile();
                      // Parse and add to system
                      // Re-using processFiles logic partially
                      try {
                         const parsed = await parseSubtitleFile(fileData);
                         // MARK AS AUTOMATED
                         parsed.isAutomated = true; 
                         parsed.autoSavedToDisk = false;
                         
                         // Add to files state
                         setFiles(prev => {
                             const exists = prev.find(f => f.name === parsed.name);
                             if (exists) return prev; // Safety double check
                             return [...prev, parsed];
                         });

                         // Auto Queue
                         // We need a small delay for state to settle or use functional update in next tick
                         // For simplicity, we just need to queue the cues.
                         // But `addToQueue` relies on `files` state which isn't updated yet in this scope.
                         
                         // Workaround: We manually construct the queue addition
                         const cueIds = parsed.cues.map(c => c.originalId);
                         setProcessingQueue(prevQ => [...new Set([...prevQ, ...cueIds])]);
                         setProcessing(true); // START ENGINE
                         
                         if (!activeFileId) setActiveFileId(parsed.id);

                      } catch(e) {
                          addLog(`❌ Ayrıştırma hatası: ${entry.name}`);
                      }
                  }
              }
          } catch (e) {
              console.error("Watch polling error", e);
              addLog("⚠️ İzleme klasörüne erişilemiyor.");
          }
      }, 5000); // Poll every 5 seconds

      return () => clearInterval(pollInterval);
  }, [watchHandles, addLog, activeFileId]);

  // --- AUTOMATED WRITE TO DISK ---
  useEffect(() => {
      // Check for files that are Automated, Completed, but Not Saved to Disk
      const checkAutoSave = async () => {
          if (!watchHandles || !watchHandles.output) return;

          for (const file of files) {
              if (file.isAutomated && !file.autoSavedToDisk && file.progress === 100) {
                  // Ready to save!
                  try {
                      const format = file.name.endsWith('.vtt') ? 'vtt' : 'srt';
                      const content = serializeSubtitleFile(file, format, false); // No dual language for auto
                      
                      // Write to output handle
                      // @ts-ignore
                      const newFileHandle = await watchHandles.output.getFileHandle(`TR_${file.name}`, { create: true });
                      // @ts-ignore
                      const writable = await newFileHandle.createWritable();
                      await writable.write(content);
                      await writable.close();

                      addLog(`💾 OTOMATİK KAYIT: TR_${file.name}`);

                      // Mark as saved so we don't write again
                      setFiles(prev => prev.map(f => f.id === file.id ? { ...f, autoSavedToDisk: true } : f));

                  } catch (e) {
                      console.error("Auto write failed", e);
                      addLog(`❌ Yazma hatası: ${file.name}`);
                  }
              }
          }
      };

      if (files.length > 0 && watchHandles) {
          checkAutoSave();
      }
  }, [files, watchHandles, addLog]);


  // --- File Logic ---
  const processFiles = async (fileList: FileList) => {
    const newFiles: SubtitleFile[] = [];
    for (let i = 0; i < fileList.length; i++) {
      try {
        const file = fileList[i];
        if (file.name.endsWith('.srt') || file.name.endsWith('.vtt')) {
             const parsed = await parseSubtitleFile(file);
             newFiles.push(parsed);
             addLog(`📥 Yüklendi: ${file.name}`);
             
             // Try Auto-Detect Context (Only for the first file to avoid spam)
             if (i === 0 && settings.tmdbApiKey && !tmdbContext) {
                 const nameClean = file.name.replace(/\.(srt|vtt)$/i, '').replace(/[\.\_]/g, ' ').replace(/\d{4}.*/, '').trim();
                 addLog(`🎬 TMDB Otomatik Arama: ${nameClean}`);
                 const ctx = await searchTMDB(nameClean, settings.tmdbApiKey);
                 if (ctx) {
                     setTmdbContext(ctx);
                     addLog(`✅ Bağlam Bulundu: ${ctx.title}`);
                 }
             }
        }
      } catch (err) { alert(`Hata: ${fileList[i].name}`); }
    }
    if (newFiles.length > 0) {
        setFiles(prev => [...prev, ...newFiles]);
        if (!activeFileId) setActiveFileId(newFiles[0].id);
    }
  };

  const handleManualTmdbSearch = async () => {
      if (!settings.tmdbApiKey) {
          alert("Ayarlardan TMDB API Key giriniz.");
          return;
      }
      const query = prompt("Film veya Dizi Adı:");
      if (!query) return;

      addLog(`🔎 TMDB Aranıyor: ${query}`);
      const ctx = await searchTMDB(query, settings.tmdbApiKey);
      if (ctx) {
          setTmdbContext(ctx);
          addLog(`✅ Bağlam Ayarlandı: ${ctx.title} (${ctx.release_date?.substring(0,4)})`);
      } else {
          alert("Bulunamadı.");
      }
  };

  const handleAddToGlossary = (sourceTerm: string, targetTerm: string) => {
      if (!sourceTerm || !targetTerm) return;
      
      setSettings(prev => ({
          ...prev,
          glossary: { ...prev.glossary, [sourceTerm]: targetTerm }
      }));
      addLog(`📖 Sözlüğe Eklendi: "${sourceTerm}" -> "${targetTerm}"`);
  };

  const generateProjectGlossary = async () => {
      const apiKey = getApiKey();
      if (files.length === 0 || !apiKey) {
          alert("Dosya yok veya API Key eksik.");
          return;
      }
      
      setAnalyzingGlossary(true);
      addLog("🔍 TÜM PROJE Analiz Ediliyor... (Sezon Modu)");
      
      let fullProjectText = "";
      files.forEach(f => {
          fullProjectText += `\n--- DOSYA: ${f.name} ---\n`;
          fullProjectText += f.cues.slice(0, 500).map(c => c.originalText).join('\n');
      });

      try {
          const glossary = await extractGlossaryFromText(fullProjectText, apiKey, settings.translatorModel);
          setSettings(prev => ({ ...prev, glossary: { ...prev.glossary, ...glossary } }));
          addLog(`✅ PROJE SÖZLÜĞÜ OLUŞTURULDU: ${Object.keys(glossary).length} terim eklendi.`);
          setIsSettingsOpen(true);
      } catch (e) {
          addLog("❌ Proje analizi hatası.");
      } finally {
          setAnalyzingGlossary(false);
      }
  };

  const generateGlossary = async () => {
      const apiKey = getApiKey();
      if (!activeFile || !apiKey) {
          alert("Dosya seçili değil veya API Key eksik.");
          return;
      }
      
      setAnalyzingGlossary(true);
      addLog(`🔍 Sözlük Analizi: ${activeFile.name}`);
      
      const fileText = activeFile.cues.map(c => c.originalText).join('\n');

      try {
          const glossary = await extractGlossaryFromText(fileText, apiKey, settings.translatorModel);
          setSettings(prev => ({ ...prev, glossary: { ...prev.glossary, ...glossary } }));
          addLog(`✅ SÖZLÜK GÜNCELLENDİ: ${Object.keys(glossary).length} terim eklendi.`);
          setIsSettingsOpen(true);
      } catch (e) {
          addLog("❌ Analiz hatası.");
      } finally {
          setAnalyzingGlossary(false);
      }
  };

  // --- Processing Queue ---
  const processNext = useCallback(async () => {
    if (!processingRef.current || processingQueue.length === 0) {
        setProcessing(false);
        setActiveProcessingCueId(null);
        if (processingRef.current) addLog("✅ Kuyruk tamamlandı.");
        return;
    }

    if (consecutiveErrors > 10) {
        setProcessing(false);
        setActiveProcessingCueId(null);
        alert("⚠️ Kritik Hata: Çok fazla başarısız deneme. İşlem durduruldu.");
        setConsecutiveErrors(0);
        return;
    }

    const apiKey = getApiKey();
    if (!apiKey) {
        setProcessing(false);
        alert("API Anahtarı eksik.");
        setIsSettingsOpen(true);
        return;
    }

    const contextStr = tmdbContext ? formatTMDBContext(tmdbContext) : "";
    const firstId = processingQueue[0];
    const file = files.find(f => f.cues.some(c => c.originalId === firstId));
    
    if (!file) {
        setProcessingQueue(q => q.slice(1));
        setActiveProcessingCueId(null);
        return;
    }

    const batchSize = settings.batchSize || 1;
    const batchCandidates: string[] = [];
    
    for (let i = 0; i < processingQueue.length; i++) {
        const qId = processingQueue[i];
        const isInFile = file.cues.some(c => c.originalId === qId);
        if (isInFile && batchCandidates.length < batchSize) {
             batchCandidates.push(qId);
        } else {
            break;
        }
    }

    const batchCues = batchCandidates.map(id => file.cues.find(c => c.originalId === id)!);
    setActiveProcessingCueId(batchCues[0].originalId);

    setFiles(prev => prev.map(f => f.id !== file.id ? f : { 
        ...f, 
        cues: f.cues.map(c => batchCandidates.includes(c.originalId) ? { ...c, status: 'translating' } : c)
    }));

    try {
        let results: string[] = [];
        
        // --- BATCH MODE ---
        if (batchSize > 1 && batchCues.length > 1) {
            const textsToTranslate = batchCues.map(c => c.originalText);
            
            results = await translateBatch(
                textsToTranslate,
                apiKey,
                settings.translatorModel,
                settings.translationStyle,
                settings.glossary,
                contextStr
            );
            
            if (results.length !== batchCues.length) throw new Error("Batch translation size mismatch");
            
            setFiles(prev => prev.map(f => {
                if (f.id !== file.id) return f;
                const newCues = f.cues.map(c => {
                    const idx = batchCandidates.indexOf(c.originalId);
                    if (idx !== -1) {
                        // Store in Memory
                        setTranslationMemory(prevMem => new Map(prevMem).set(c.originalText.trim(), results[idx]));
                        return { ...c, translatedText: results[idx], refinedText: results[idx], status: 'completed' as const };
                    }
                    return c;
                });
                const completed = newCues.filter(c => c.status === 'completed').length;
                return { ...f, cues: newCues, progress: Math.round((completed / newCues.length) * 100) };
            }));

        } else {
            // --- SINGLE MODE ---
            const cue = batchCues[0];
            const cueIndex = file.cues.findIndex(c => c.originalId === cue.originalId);
            const cleanOriginal = cue.originalText.trim();
            const lowerOriginal = cleanOriginal.toLowerCase().replace(/[^\w\s]/gi, '');

            let translated = "";
            let skippedAI = false;

            // 1. Check Exact Glossary Match
            if (settings.glossary[cleanOriginal]) {
                 translated = settings.glossary[cleanOriginal];
                 skippedAI = true;
                 addLog(`📖 Sözlük kullanıldı: ${cleanOriginal}`);
            } 
            // 2. Check Translation Memory (Exact Sentence Match from Previous)
            else if (translationMemory.has(cleanOriginal)) {
                 translated = translationMemory.get(cleanOriginal)!;
                 skippedAI = true;
                 addLog(`🧠 Hafıza kullanıldı: ${cleanOriginal}`);
            }
            // 3. Check Common Word Cache
            else if (COMMON_WORD_CACHE[lowerOriginal]) {
                 translated = COMMON_WORD_CACHE[lowerOriginal];
                 skippedAI = true;
            } 
            // 4. Ask AI
            else {
                 // Sliding Window Logic
                 const windowSize = settings.contextWindowSize ?? 2;
                 const prevLines = windowSize > 0 
                    ? file.cues.slice(Math.max(0, cueIndex - windowSize), cueIndex).map(c => c.originalText)
                    : [];
                 const nextLines = windowSize > 0
                    ? file.cues.slice(cueIndex + 1, cueIndex + 1 + windowSize).map(c => c.originalText)
                    : [];

                 translated = await translateText(cue.originalText, prevLines, nextLines, apiKey, settings.translatorModel, settings.translationStyle, settings.glossary, contextStr);
            }

            let final = translated;
            // Refinement Step (Skip if skippedAI or too short)
            if (!skippedAI && translated.length > 10 && settings.editorModel) {
                 updateCue(file.id, cue.originalId, { translatedText: translated, status: 'refining' });
                 await new Promise(r => setTimeout(r, 100));
                 final = await refineText(translated, cue.originalText, getApiKey() || apiKey, settings.editorModel);
            }
            
            // Save to Memory
            setTranslationMemory(prev => new Map(prev).set(cleanOriginal, final));
            
            updateCue(file.id, cue.originalId, { translatedText: translated, refinedText: final, status: 'completed' });
        }

        setConsecutiveErrors(0);
        setProcessingQueue(q => q.filter(id => !batchCandidates.includes(id)));
        setTimeout(() => setActiveProcessingCueId(null), settings.delayBetweenRequests);

    } catch (error: any) {
        setConsecutiveErrors(prev => prev + 1);
        const errorInfo = analyzeError(error);

        // CIRCUIT BREAKER with Multi-Key Awareness
        if (consecutiveErrors >= 3 && errorInfo.message.includes('429')) {
             setProcessing(false);
             setActiveProcessingCueId(null);
             setConsecutiveErrors(0);
             addLog("⛔ HIZ SINIRI AŞILDI: İşlem durduruldu.");
             alert("Kota doldu veya hız sınırı aşıldı.\n\nLütfen 1 dakika bekleyin veya farklı bir API anahtarı kullanın.");
             return;
        }

        if (settings.batchSize > 1) {
            const oldSize = settings.batchSize;
            setSettings(prev => ({ ...prev, batchSize: 1 }));
            addLog(`📉 Hız Sınırı: Paket boyutu minimuma indirildi (${oldSize} -> 1)`);
            // Force delay if batch was too big
            errorInfo.delay = 5000;
        }

        // FAST FAILOVER: If we have multiple keys and it's a rate limit, retry almost immediately
        if (settings.apiKeys.length > 1 && errorInfo.message.includes('429')) {
             errorInfo.delay = 1000;
             addLog("⚡ Kota dolu, sonraki anahtara geçiliyor...");
        }
        
        addLog(errorInfo.message);
        
        setFiles(prev => prev.map(f => f.id !== file.id ? f : {
            ...f,
            cues: f.cues.map(c => batchCandidates.includes(c.originalId) ? { ...c, status: 'error' as const, errorMessage: errorInfo.message } : c)
        }));

        if (errorInfo.action === 'stop') {
            setProcessing(false);
            setActiveProcessingCueId(null);
            alert(errorInfo.message);
        } else if (errorInfo.action === 'skip') {
            setProcessingQueue(q => q.filter(id => !batchCandidates.includes(id)));
            setTimeout(() => setActiveProcessingCueId(null), errorInfo.delay);
        } else {
            setTimeout(() => setActiveProcessingCueId(null), errorInfo.delay);
        }
    }
  }, [files, processingQueue, settings, addLog, getApiKey, tmdbContext, consecutiveErrors, translationMemory]);

  useEffect(() => {
      if (processing && !activeProcessingCueId && processingQueue.length > 0) processNext();
  }, [processing, processingQueue, activeProcessingCueId, processNext]);

  // --- Helpers ---
  const updateCueStatus = (fileId: string, cueId: string, status: SubtitleCue['status']) => {
    setFiles(prev => prev.map(f => f.id !== fileId ? f : { ...f, cues: f.cues.map(c => c.originalId === cueId ? { ...c, status } : c) }));
  };
  const updateCue = (fileId: string, cueId: string, data: Partial<SubtitleCue>) => {
    setFiles(prev => prev.map(f => {
        if (f.id !== fileId) return f;
        const newCues = f.cues.map(c => c.originalId === cueId ? { ...c, ...data } : c);
        const progress = Math.round((newCues.filter(c => c.status === 'completed').length / newCues.length) * 100);
        return { ...f, cues: newCues, progress };
    }));
  };
  const addToQueue = (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (!file) return;
    const pendingCues = file.cues.filter(c => c.status === 'pending' || c.status === 'error').map(c => c.originalId);
    setProcessingQueue(prev => [...new Set([...prev, ...pendingCues])]);
    setProcessing(true);
    addLog(`▶️ Başlatıldı: ${file.name}`);
  };

  const manualUpdateCue = (cueId: string, text: string, type: 'translated' | 'refined') => {
    if (!activeFileId) return;
    const data = type === 'refined' ? { refinedText: text, isLocked: true } : { translatedText: text, isLocked: true };
    updateCue(activeFileId, cueId, data);
    
    // Also update memory manually if user edits a cue
    const file = files.find(f => f.id === activeFileId);
    const cue = file?.cues.find(c => c.originalId === cueId);
    if(cue) {
        setTranslationMemory(prev => new Map(prev).set(cue.originalText.trim(), text));
    }
  };

  const retryCue = (cueId: string) => {
    if (!activeFileId) return;
    updateCueStatus(activeFileId, cueId, 'pending');
    setProcessingQueue(prev => [...prev, cueId]);
    setProcessing(true);
  };

  const handleIdiomAnalysis = async (cueId: string) => {
      const apiKey = getApiKey();
      if (!activeFileId || !apiKey) {
          alert("API Anahtarı eksik.");
          return;
      }

      const file = files.find(f => f.id === activeFileId);
      const cue = file?.cues.find(c => c.originalId === cueId);
      
      if (!file || !cue) return;

      updateCueStatus(activeFileId, cueId, 'analyzing_idioms');
      
      try {
          const idioms = await analyzeIdioms(cue.originalText, apiKey, settings.editorModel);
          if (idioms.length > 0) {
              updateCue(activeFileId, cueId, { idioms, status: 'translated' }); 
              addLog(`✨ ${idioms.length} deyim bulundu.`);
          } else {
               updateCue(activeFileId, cueId, { status: 'translated' });
               addLog("ℹ️ Deyim bulunamadı.");
          }
      } catch (e) {
          updateCue(activeFileId, cueId, { status: 'error' });
          addLog("❌ Deyim analizi hatası.");
      }
  };

  const exportFile = (file: SubtitleFile, format: 'srt' | 'vtt') => {
    const content = serializeSubtitleFile(file, format, isDualExport);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const suffix = isDualExport ? '_DUAL' : '_TR';
    link.download = `${file.name.replace(/\.(srt|vtt)$/i, '')}${suffix}.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addLog(`💾 Dışa aktarıldı: ${file.name}`);
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
                  if (regex.test(text)) {
                      newText = text.replace(regex, replaceText);
                      count++;
                  }
              } catch (e) { alert("Geçersiz Regex"); return cue; }
          } else {
              if (text.includes(findText)) {
                  newText = text.split(findText).join(replaceText);
                  count++;
              }
          }
          
          return newText !== text ? { ...cue, refinedText: newText, isLocked: true } : cue;
      });

      if (count > 0) {
          setFiles(prev => prev.map(f => f.id === activeFile.id ? { ...f, cues: newCues } : f));
          addLog(`🔄 ${count} değişiklik yapıldı.`);
          setIsFindReplaceOpen(false);
      } else {
          alert("Eşleşme bulunamadı.");
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

  // --- Render ---
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans relative">
      <SettingsModal 
         isOpen={isSettingsOpen} 
         onClose={() => setIsSettingsOpen(false)} 
         settings={settings} 
         onSave={(s) => { setSettings(s); setIsSettingsOpen(false); }} 
         onStartAutomation={(input, output) => {
             setWatchHandles({ input, output });
             addLog("🤖 OTOMASYON BAŞLATILDI: Dosyalar izleniyor...");
         }}
         isAutomationActive={!!watchHandles}
      />
      
      {restoreAvailable && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[60] bg-blue-600 text-white px-6 py-3 rounded-lg shadow-2xl flex items-center gap-4 border border-blue-400">
              <span className="font-medium">⚠️ Taslak bulundu.</span>
              <div className="flex gap-2">
                  <button onClick={restoreDraft} className="bg-white text-blue-600 px-3 py-1 rounded text-sm font-bold">Kurtar</button>
                  <button onClick={discardDraft} className="bg-blue-700 text-white px-3 py-1 rounded text-sm">Sil</button>
              </div>
          </div>
      )}

      {isStatsOpen && activeFile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-2xl w-96 border border-slate-200 dark:border-slate-800">
                  <h3 className="text-xl font-bold mb-4 text-slate-800 dark:text-white">Proje İstatistikleri</h3>
                  <div className="space-y-3">
                      <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                          <span className="text-slate-500">Dosya:</span>
                          <span className="font-mono">{activeFile.name}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                          <span className="text-slate-500">Toplam Satır:</span>
                          <span className="font-mono">{getStats().totalLines}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                          <span className="text-slate-500">Kelime Sayısı:</span>
                          <span className="font-mono">{getStats().totalWords}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                          <span className="text-slate-500">Tamamlanan:</span>
                          <span className="font-mono text-green-500">{getStats().completedLines}</span>
                      </div>
                      <div className="flex justify-between pt-2">
                          <span className="text-slate-500">Kalan Süre (Tahmini):</span>
                          <span className="font-mono text-blue-500">{Math.ceil(getStats().estimatedTimeRemaining / 60)} dk</span>
                      </div>
                  </div>
                  <button onClick={() => setIsStatsOpen(false)} className="mt-6 w-full py-2 bg-slate-100 dark:bg-slate-800 rounded hover:bg-slate-200 dark:hover:bg-slate-700">Kapat</button>
              </div>
          </div>
      )}

      {isFindReplaceOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-2xl w-96 border border-slate-200 dark:border-slate-800">
                  <h3 className="text-lg font-bold mb-4">Bul ve Değiştir</h3>
                  <input className="w-full mb-3 p-2 bg-slate-50 dark:bg-slate-800 border rounded" placeholder="Aranan..." value={findText} onChange={e => setFindText(e.target.value)} />
                  <input className="w-full mb-3 p-2 bg-slate-50 dark:bg-slate-800 border rounded" placeholder="Yeni Değer..." value={replaceText} onChange={e => setReplaceText(e.target.value)} />
                  <label className="flex items-center gap-2 mb-4 text-sm text-slate-500">
                      <input type="checkbox" checked={useRegex} onChange={e => setUseRegex(e.target.checked)} /> Regex Kullan
                  </label>
                  <div className="flex gap-2">
                      <button onClick={handleFindReplace} className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700">Tümünü Değiştir</button>
                      <button onClick={() => setIsFindReplaceOpen(false)} className="flex-1 bg-slate-200 dark:bg-slate-800 py-2 rounded hover:bg-slate-300">İptal</button>
                  </div>
              </div>
          </div>
      )}

      <div className={`w-64 bg-slate-100 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col`}>
        <div className="p-4 border-b border-slate-200 dark:border-slate-800">
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Altyazı Stüdyosu</h1>
          <p className="text-xs text-slate-500">Ultimate Edition v2.0</p>
        </div>
        {watchHandles && (
            <div className="bg-blue-50 dark:bg-blue-900/10 p-2 text-center text-xs text-blue-600 dark:text-blue-400 font-bold border-b border-blue-100 dark:border-blue-900/50">
                ⚡ OTOMASYON AKTİF
            </div>
        )}
        <div className="p-4 space-y-2">
            <label className="block w-full cursor-pointer bg-blue-600 hover:bg-blue-700 text-white text-center py-2 rounded text-sm font-medium shadow-sm transition-colors">
                <span>+ Dosya Yükle</span>
                <input type="file" className="hidden" multiple accept=".srt,.vtt" onChange={(e) => e.target.files && processFiles(e.target.files)} />
            </label>
            
            <label className="block w-full cursor-pointer bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-center py-2 rounded text-sm font-medium transition-colors border border-slate-300 dark:border-slate-700">
                <span className="flex items-center justify-center gap-2">
                   📂 Klasör Yükle
                </span>
                {/* @ts-ignore */}
                <input type="file" className="hidden" multiple webkitdirectory="" directory="" onChange={(e) => e.target.files && processFiles(e.target.files)} />
            </label>

            {files.length > 0 && (
                 <button 
                    onClick={generateProjectGlossary}
                    disabled={analyzingGlossary}
                    className={`w-full text-xs py-2 rounded flex items-center justify-center gap-1 border border-purple-200 dark:border-purple-900 ${analyzingGlossary ? 'bg-purple-100 text-purple-800' : 'bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-slate-800 dark:text-purple-400 dark:hover:bg-slate-700'}`}
                 >
                    {analyzingGlossary ? <span className="animate-spin">⏳</span> : <span>✨</span>}
                    Proje Sözlüğü Oluştur
                 </button>
            )}
        </div>
        <div className="flex-1 overflow-y-auto px-2 space-y-1">
            {files.map(file => (
                <div key={file.id} onClick={() => setActiveFileId(file.id)} className={`p-3 rounded cursor-pointer border text-sm relative transition-all ${activeFileId === file.id ? 'bg-white dark:bg-slate-800 border-blue-400 shadow-sm' : 'border-transparent hover:bg-slate-200 dark:hover:bg-slate-800/50'}`}>
                    <div className="font-medium truncate pr-6 flex items-center gap-1">
                        {file.isAutomated && <span title="Otomatik Yüklendi">⚡</span>}
                        {file.name}
                    </div>
                    <div className="flex justify-between items-center mt-2">
                        <div className="text-xs text-slate-500">{file.cues.length} satır</div>
                        <div className="text-xs font-bold text-blue-600">{file.progress}%</div>
                    </div>
                    <div className="absolute bottom-0 left-0 h-1 bg-blue-500 transition-all duration-500 rounded-b" style={{ width: `${file.progress}%` }}></div>
                </div>
            ))}
        </div>
        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
             <button onClick={() => setIsSettingsOpen(true)} className="flex items-center gap-2 text-sm w-full p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                Ayarlar & Otomasyon
             </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-950">
         <div className="h-12 border-b border-slate-200 dark:border-slate-800 flex items-center px-4 justify-between bg-white dark:bg-slate-900">
             <div className="flex gap-2">
                 <button onClick={() => setIsFindReplaceOpen(true)} className="p-1.5 text-xs bg-slate-100 dark:bg-slate-800 rounded hover:bg-slate-200 flex items-center gap-1" title="Bul ve Değiştir">
                     <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                     <span>Bul/Değiştir</span>
                 </button>
                 <button onClick={generateGlossary} className="p-1.5 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200 flex items-center gap-1" title="Sözlük Oluştur (Tek Dosya)">
                     <span>📚 Sözlük Çıkar (Tek)</span>
                 </button>
                 <button onClick={handleManualTmdbSearch} className={`p-1.5 text-xs rounded hover:opacity-80 flex items-center gap-1 ${tmdbContext ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`} title="TMDB'den Konu ve Karakter Çek">
                     <span>🎬 Bağlam {tmdbContext ? `(${tmdbContext.title})` : '(TMDB)'}</span>
                 </button>
             </div>

             <div className="flex items-center gap-4">
                 <div className="flex items-center gap-1.5 transition-all duration-300">
                    {saveStatus === 'saving' && (
                        <>
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></div>
                            <span className="text-[10px] font-medium text-amber-600 dark:text-amber-500">Kaydediliyor...</span>
                        </>
                    )}
                    {saveStatus === 'saved' && lastSaved && (
                        <>
                             <svg className="w-3 h-3 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            <span className="text-[10px] font-medium text-slate-400">Kaydedildi</span>
                        </>
                    )}
                    {saveStatus === 'error' && (
                        <>
                            <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                            <span className="text-[10px] font-medium text-red-500">Kaydedilemedi</span>
                        </>
                    )}
                 </div>

                 <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block"></div>

                 <button 
                    onClick={toggleTheme} 
                    className={`p-2 rounded-lg transition-colors ${theme === 'dark' ? 'bg-slate-800 text-yellow-400 hover:bg-slate-700' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
                    title={theme === 'dark' ? 'Gündüz Modu' : 'Gece Modu'}
                 >
                    {theme === 'dark' ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                    ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                    )}
                 </button>
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

      <div className="w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 p-6 flex flex-col gap-6 shadow-xl z-10">
        <div>
            <h3 className="text-xs uppercase font-bold text-slate-400 mb-4 tracking-wider">KONTROL PANELİ</h3>
            {activeFile && (
                <>
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
                <div className="flex gap-2 mt-3">
                    <button onClick={() => setIsStatsOpen(true)} className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 rounded text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200">📊 İSTATİSTİK</button>
                </div>
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