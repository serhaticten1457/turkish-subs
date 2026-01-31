import React, { useState, useEffect } from 'react';
import { AppSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onStartAutomation: (inputHandle: any, outputHandle: any) => void;
  onAnalyzeProject: () => void; // New prop for triggering analysis
  isAutomationActive: boolean;
  isAnalyzing: boolean; // Loading state for analysis
}

// Minimal interface for File System Access API Handle
interface DirectoryHandleWrapper {
    name: string;
    kind: 'file' | 'directory';
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSave, onStartAutomation, onAnalyzeProject, isAutomationActive, isAnalyzing }) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [activeTab, setActiveTab] = useState<'api' | 'style' | 'glossary' | 'automation'>('api');
  const [isIframe, setIsIframe] = useState(false);
  
  // Glossary local state
  const [newTermKey, setNewTermKey] = useState('');
  const [newTermVal, setNewTermVal] = useState('');

  // Automation Handles (Temporary state before passing to App)
  const [inputHandle, setInputHandle] = useState<DirectoryHandleWrapper | null>(null);
  const [outputHandle, setOutputHandle] = useState<DirectoryHandleWrapper | null>(null);

  React.useEffect(() => {
    setLocalSettings(settings);
  }, [settings, isOpen]);

  useEffect(() => {
      // Detect Iframe to prevent File System Access errors proactively
      try {
          if (window.self !== window.top) {
              setIsIframe(true);
          }
      } catch (e) {
          // If access is blocked by CORS, it's definitely an iframe
          setIsIframe(true);
      }
  }, []);

  if (!isOpen) return null;

  const handleChange = (field: keyof AppSettings, value: any) => {
    setLocalSettings(prev => ({ ...prev, [field]: value }));
  };

  const addGlossaryTerm = () => {
      if (newTermKey && newTermVal) {
          const updated = { ...localSettings.glossary, [newTermKey]: newTermVal };
          setLocalSettings(prev => ({ ...prev, glossary: updated }));
          setNewTermKey('');
          setNewTermVal('');
      }
  };

  const removeGlossaryTerm = (key: string) => {
      const updated = { ...localSettings.glossary };
      delete updated[key];
      setLocalSettings(prev => ({ ...prev, glossary: updated }));
  };

  const checkFileSystemSupport = () => {
      // @ts-ignore
      if (!window.showDirectoryPicker) {
          alert("⚠️ Tarayıcınız veya bağlantınız bu özelliği desteklemiyor.\n\nKlasör seçimi (File System Access API) sadece HTTPS bağlantılarda veya 'localhost' üzerinde çalışır.\n\nEğer IP adresi (192.168.x.x) ile bağlanıyorsanız, tarayıcı güvenlik sebebiyle bu özelliği engeller.");
          return false;
      }
      return true;
  };

  const handleFileSystemError = (e: any) => {
      console.error("File System Error:", e);
      
      // Handle user cancellation silently
      if (e.name === 'AbortError') return;

      const msg = e.message || e.toString();
      
      // Handle Iframe/Cross-origin restriction
      if (msg.includes('Cross origin sub frames') || msg.includes('SecurityError') || msg.includes('Frame is not allowed')) {
          alert("⚠️ ERİŞİM ENGELİ (IFRAME)\n\nBu özellik (Otomasyon/Klasör Seçimi) CasaOS veya Dashboard arayüzü içinde gömülü çalışırken tarayıcı tarafından engellenmektedir.\n\nÇÖZÜM:\nLütfen bu uygulamayı 'Yeni Sekmede' açın.\n\n(Dashboard üzerindeki ikona sağ tıklayıp 'Yeni Sekmede Aç' diyebilir veya doğrudan IP:Port adresine gidebilirsiniz.)");
      } else {
          alert("Klasör seçilemedi: " + msg);
      }
  };

  const pickInputFolder = async () => {
    if (isIframe) {
        alert("Erişim Engeli: Lütfen uygulamayı yeni sekmede açın.");
        return;
    }
    if (!checkFileSystemSupport()) return;
    try {
        const handle = await (window as any).showDirectoryPicker();
        setInputHandle(handle as DirectoryHandleWrapper);
    } catch (e) { handleFileSystemError(e); }
  };

  const pickOutputFolder = async () => {
    if (isIframe) {
        alert("Erişim Engeli: Lütfen uygulamayı yeni sekmede açın.");
        return;
    }
    if (!checkFileSystemSupport()) return;
    try {
        const handle = await (window as any).showDirectoryPicker();
        setOutputHandle(handle as DirectoryHandleWrapper);
    } catch (e) { handleFileSystemError(e); }
  };

  const handleStartAutomation = () => {
      if(inputHandle && outputHandle) {
          onStartAutomation(inputHandle, outputHandle);
          onClose(); // Close modal to show dashboard
      }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Ayarlar & Tercihler</h2>
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                <button onClick={() => setActiveTab('api')} className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all ${activeTab === 'api' ? 'bg-white dark:bg-slate-700 shadow text-blue-600' : 'text-slate-500'}`}>API & Hız</button>
                <button onClick={() => setActiveTab('style')} className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all ${activeTab === 'style' ? 'bg-white dark:bg-slate-700 shadow text-blue-600' : 'text-slate-500'}`}>Tarz</button>
                <button onClick={() => setActiveTab('glossary')} className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all ${activeTab === 'glossary' ? 'bg-white dark:bg-slate-700 shadow text-blue-600' : 'text-slate-500'}`}>Sözlük & Tutarlılık</button>
                <button onClick={() => setActiveTab('automation')} className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all ${activeTab === 'automation' ? 'bg-white dark:bg-slate-700 shadow text-blue-600' : 'text-slate-500'}`}>Otomasyon</button>
            </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
            
            {/* API TAB */}
            {activeTab === 'api' && (
                <div className="space-y-6">
                    {/* Speed Presets */}
                    <div className="bg-slate-100 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                         <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                            🚀 Hız ve Kalite Modu
                         </h3>
                         <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                             <button
                                onClick={() => {
                                    handleChange('batchSize', 1);
                                    handleChange('delayBetweenRequests', 1000);
                                    handleChange('contextWindowSize', 2);
                                }}
                                className={`p-3 rounded-lg border text-left transition-all ${localSettings.batchSize === 1 ? 'bg-white dark:bg-slate-800 border-green-500 ring-1 ring-green-500 shadow-sm' : 'border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800'}`}
                             >
                                 <div className={`font-bold text-xs mb-1 ${localSettings.batchSize === 1 ? 'text-green-600' : 'text-slate-600 dark:text-slate-400'}`}>KALİTE ODAKLI</div>
                                 <div className="text-xs text-slate-500">Tek tek çevirir. Maksimum bağlam.</div>
                             </button>

                             <button
                                onClick={() => {
                                    handleChange('batchSize', 5);
                                    handleChange('delayBetweenRequests', 500);
                                    handleChange('contextWindowSize', 0); // Context is tricky in batch
                                }}
                                className={`p-3 rounded-lg border text-left transition-all ${localSettings.batchSize === 5 ? 'bg-white dark:bg-slate-800 border-blue-500 ring-1 ring-blue-500 shadow-sm' : 'border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800'}`}
                             >
                                 <div className={`font-bold text-xs mb-1 ${localSettings.batchSize === 5 ? 'text-blue-600' : 'text-slate-600 dark:text-slate-400'}`}>DENGELİ (5x)</div>
                                 <div className="text-xs text-slate-500">5 satırlık paketler. Ortalama hız.</div>
                             </button>

                             <button
                                onClick={() => {
                                    handleChange('batchSize', 20);
                                    handleChange('delayBetweenRequests', 0);
                                    handleChange('contextWindowSize', 0);
                                }}
                                className={`p-3 rounded-lg border text-left transition-all ${localSettings.batchSize === 20 ? 'bg-white dark:bg-slate-800 border-amber-500 ring-1 ring-amber-500 shadow-sm' : 'border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800'}`}
                             >
                                 <div className={`font-bold text-xs mb-1 ${localSettings.batchSize === 20 ? 'text-amber-600' : 'text-slate-600 dark:text-slate-400'}`}>TURBO (20x)</div>
                                 <div className="text-xs text-slate-500">Maksimum hız. Bağlam analizi yok.</div>
                             </button>
                         </div>
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-2">
                             <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                Gemini API Anahtarları (Her satıra bir adet)
                            </label>
                            <div className={`text-[10px] font-bold px-2 py-0.5 rounded border ${localSettings.apiKeys.length > 0 ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' : 'bg-red-100 text-red-700 border-red-200'}`}>
                                {localSettings.apiKeys.length} Anahtar Yüklü
                            </div>
                        </div>
                        
                        <div className="relative">
                            <textarea
                                className="w-full h-24 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono resize-none"
                                value={localSettings.apiKeys.join('\n')}
                                onChange={(e) => handleChange('apiKeys', e.target.value.split('\n').map(k => k.trim()).filter(k => k !== ''))}
                                placeholder="AIzaSy...&#10;AIzaSy..."
                            />
                        </div>

                        {/* Load Balancing Strategy Selector */}
                        <div className="mt-3 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 p-2 rounded border border-slate-200 dark:border-slate-700">
                             <label className="text-xs font-bold text-slate-600 dark:text-slate-400 ml-1">
                                 Yük Dengeleme Stratejisi:
                             </label>
                             <select
                                 value={localSettings.keySelectionStrategy || 'sequential'}
                                 onChange={(e) => handleChange('keySelectionStrategy', e.target.value)}
                                 className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-xs px-2 py-1 outline-none focus:border-blue-500"
                             >
                                 <option value="sequential">Sıralı (Round Robin)</option>
                                 <option value="random">Rastgele (Random)</option>
                             </select>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">
                            Birden fazla anahtar girildiğinde kullanım şeklini belirler. "Sıralı" mod adil dağılım sağlar, "Rastgele" mod çakışmaları azaltabilir.
                        </p>
                    </div>

                    <div>
                         <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">TMDB API Key (Konusal Bağlam İçin)</label>
                         <input 
                            type="password"
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            value={localSettings.tmdbApiKey}
                            onChange={(e) => handleChange('tmdbApiKey', e.target.value)}
                            placeholder="Opsiyonel: The Movie Database API Key"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">Eğer girilirse, altyazı dosya isminden filmi bulup konusunu ve karakterlerini AI'ya iletir. Bu çeviri kalitesini artırır.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Hızlı Çeviri (Satır Sayısı)</label>
                            <select 
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm font-bold text-blue-600"
                                value={localSettings.batchSize}
                                onChange={(e) => handleChange('batchSize', parseInt(e.target.value))}
                            >
                                <option value="1">1 Satır (En Yüksek Kalite)</option>
                                <option value="3">3 Satır (Dengeli)</option>
                                <option value="5">5 Satır (Hızlı)</option>
                                <option value="10">10 Satır (Çok Hızlı)</option>
                                <option value="20">20 Satır (Turbo)</option>
                            </select>
                            <p className="text-[10px] text-slate-500 mt-1">Tek seferde AI'ya gönderilecek satır sayısı.</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">İstek Gecikmesi (ms)</label>
                            <input 
                                type="number"
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm"
                                value={localSettings.delayBetweenRequests}
                                onChange={(e) => handleChange('delayBetweenRequests', parseInt(e.target.value))}
                            />
                            <p className="text-[10px] text-slate-500 mt-1">Rate Limit aşımını önlemek için bekleme süresi.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Çeviri Modeli</label>
                            <select 
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm"
                                value={localSettings.translatorModel}
                                onChange={(e) => handleChange('translatorModel', e.target.value)}
                            >
                                <option value="gemini-2.5-flash-latest">Gemini 2.5 Flash</option>
                                <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
                                <option value="gemini-3-pro-preview">Gemini 3 Pro</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Editör Modeli</label>
                            <select 
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm"
                                value={localSettings.editorModel}
                                onChange={(e) => handleChange('editorModel', e.target.value)}
                            >
                                <option value="gemini-3-pro-preview">Gemini 3 Pro</option>
                                <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {/* STYLE TAB */}
            {activeTab === 'style' && (
                <div className="space-y-6">
                    <div>
                         <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Çeviri Tarzı</label>
                         <div className="grid grid-cols-2 gap-3">
                             {['standard', 'netflix', 'anime', 'documentary'].map((style) => (
                                 <button
                                    key={style}
                                    onClick={() => handleChange('translationStyle', style)}
                                    className={`
                                        p-4 rounded-lg border text-left transition-all
                                        ${localSettings.translationStyle === style 
                                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500' 
                                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-400'}
                                    `}
                                 >
                                     <div className="font-bold capitalize text-slate-800 dark:text-slate-200">{style}</div>
                                     <div className="text-xs text-slate-500 mt-1">
                                         {style === 'standard' && 'Dengeli, genel kullanım.'}
                                         {style === 'netflix' && 'Akıcı, doğal, deyimsel.'}
                                         {style === 'anime' && 'Jargon korumalı, duygusal.'}
                                         {style === 'documentary' && 'Resmi, öğretici dil.'}
                                     </div>
                                 </button>
                             ))}
                         </div>
                    </div>

                    <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
                        <label className="flex items-center justify-between mb-2">
                             <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Bağlam Penceresi (Satır Sayısı)</span>
                             <span className={`text-xs font-bold px-2 py-0.5 rounded ${localSettings.contextWindowSize && localSettings.contextWindowSize > 0 ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>
                                 {localSettings.contextWindowSize ? `${localSettings.contextWindowSize} Önce / ${localSettings.contextWindowSize} Sonra` : 'Kapalı'}
                             </span>
                        </label>
                        <div className="flex items-center gap-4">
                            <input 
                                type="range" 
                                min="0" 
                                max="5" 
                                step="1"
                                className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700 accent-blue-600"
                                value={localSettings.contextWindowSize || 0}
                                disabled={localSettings.batchSize > 1}
                                onChange={(e) => handleChange('contextWindowSize', parseInt(e.target.value))}
                            />
                            <div className="w-8 text-center text-sm font-bold text-slate-600 dark:text-slate-400">
                                {localSettings.contextWindowSize || 0}
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-2">
                            {localSettings.batchSize > 1 
                                ? <span className="text-amber-600">⚠️ Toplu çeviri modunda bağlam penceresi devre dışıdır.</span>
                                : <span>Mevcut satır çevrilirken AI'ya önceki ve sonraki satırları gösterir.</span>
                            }
                        </p>
                    </div>
                </div>
            )}

            {/* GLOSSARY TAB */}
            {activeTab === 'glossary' && (
                <div className="h-full flex flex-col gap-6">
                    {/* 1. Quick Add Manual Term */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <p className="text-sm text-slate-500">Bu kelimeler AI tarafından çevrilirken öncelikli olarak kullanılır.</p>
                            <button 
                                onClick={onAnalyzeProject}
                                disabled={isAnalyzing}
                                className={`
                                    text-[10px] px-3 py-1.5 rounded font-bold uppercase tracking-wider flex items-center gap-1 transition-all
                                    ${isAnalyzing ? 'bg-purple-100 text-purple-600 cursor-wait' : 'bg-purple-600 text-white hover:bg-purple-700 shadow-md'}
                                `}
                            >
                                {isAnalyzing ? <span className="animate-spin">⏳</span> : <span>🪄</span>}
                                {isAnalyzing ? 'Analiz Ediliyor...' : 'Mevcut Dosyalardan Analiz Et'}
                            </button>
                        </div>
                        
                        <div className="flex gap-2 mb-4">
                            <input 
                                className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-sm"
                                placeholder="Kaynak (örn: John)"
                                value={newTermKey}
                                onChange={(e) => setNewTermKey(e.target.value)}
                            />
                            <input 
                                className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-sm"
                                placeholder="Hedef (örn: John)"
                                value={newTermVal}
                                onChange={(e) => setNewTermVal(e.target.value)}
                            />
                            <button 
                                onClick={addGlossaryTerm}
                                className="bg-green-600 text-white px-4 rounded hover:bg-green-700"
                            >
                                Ekle
                            </button>
                        </div>

                        <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-y-auto max-h-[200px] p-2 bg-slate-50 dark:bg-slate-900">
                            {Object.entries(localSettings.glossary).length === 0 && (
                                <div className="text-center text-slate-400 py-6">Sözlük boş.</div>
                            )}
                            {Object.entries(localSettings.glossary).map(([key, val]) => (
                                <div key={key} className="flex justify-between items-center p-2 border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-white dark:hover:bg-slate-800 rounded">
                                    <span className="text-sm font-mono"><span className="text-blue-500">{key}</span> <span className="text-slate-400">→</span> <span className="text-green-500">{String(val)}</span></span>
                                    <button onClick={() => removeGlossaryTerm(key)} className="text-slate-400 hover:text-red-500">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 2. Style Guide & Consistency Rules */}
                    <div className="flex-1 flex flex-col">
                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                             Proje Stil Rehberi & Karakter Analizi
                        </label>
                        <textarea
                            className="flex-1 min-h-[150px] w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none font-mono leading-relaxed"
                            value={localSettings.styleGuide || ""}
                            onChange={(e) => handleChange('styleGuide', e.target.value)}
                            placeholder="Otomatik analiz ile doldurulabilir veya elle yazılabilir.&#10;&#10;Örn:&#10;- John karakteri 'Siz' dilini kullanmalı.&#10;- Winterfell terimi çevrilmemeli.&#10;- Genel ton melankolik olmalı."
                        />
                        <p className="text-[10px] text-slate-500 mt-2">Bu notlar, dizi/sezon boyunca tutarlılığı sağlamak için her çeviri isteğinde AI'ya "Sistem Talimatı" olarak gönderilir.</p>
                    </div>
                </div>
            )}

            {/* AUTOMATION TAB */}
            {activeTab === 'automation' && (
                <div className="space-y-6">
                    {/* Iframe Warning Banner */}
                    {isIframe && (
                        <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 rounded-r-lg shadow-sm">
                            <div className="flex">
                                <div className="flex-shrink-0">
                                    <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                    </svg>
                                </div>
                                <div className="ml-3">
                                    <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                                        Erişim Kısıtlaması (Iframe Modu)
                                    </h3>
                                    <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                                        <p>
                                            Bu uygulama şu anda CasaOS veya başka bir panel içinde gömülü çalışıyor.
                                            Tarayıcı güvenlik kuralları gereği, "Klasör Seçimi" gibi dosya sistemi özellikleri bu modda çalışmaz.
                                        </p>
                                        <p className="mt-2 font-bold">
                                            Otomasyonu kullanmak için uygulamayı yeni sekmede açmalısınız.
                                        </p>
                                    </div>
                                    <div className="mt-4">
                                        <button
                                            type="button"
                                            onClick={() => window.open(window.location.href, '_blank')}
                                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-bold rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                                        >
                                            Uygulamayı Yeni Sekmede Aç ↗
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className={isIframe ? "opacity-50 pointer-events-none grayscale blur-[1px] transition-all" : ""}>
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800 mb-6">
                            <h3 className="font-bold text-blue-800 dark:text-blue-300 flex items-center gap-2">
                                 <span className="animate-pulse">⚡</span> İzleme Modu (Watch Folder)
                            </h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                                Bir "Giriş" klasörü belirleyin. Bu klasöre attığınız her altyazı otomatik olarak:
                            </p>
                            <ul className="list-disc list-inside text-sm text-slate-600 dark:text-slate-400 mt-1 ml-2 space-y-1">
                                <li>Algılanır ve yüklenir.</li>
                                <li>Çevrilir (Mevcut API ayarlarıyla).</li>
                                <li>"Çıkış" klasörüne kaydedilir (.srt/.vtt).</li>
                            </ul>
                        </div>

                        <div className="space-y-4">
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Giriş Klasörü (Kaynak)</label>
                                <button 
                                    onClick={pickInputFolder}
                                    className={`w-full p-3 rounded border border-dashed flex items-center justify-center gap-2 transition-all ${inputHandle ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700' : 'border-slate-300 hover:border-blue-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}
                                >
                                    {inputHandle ? (
                                        <>
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                            <span>Klasör Seçildi: {inputHandle.name}</span>
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                                            <span>Giriş Klasörü Seç...</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Çıkış Klasörü (Hedef)</label>
                                <button 
                                    onClick={pickOutputFolder}
                                    className={`w-full p-3 rounded border border-dashed flex items-center justify-center gap-2 transition-all ${outputHandle ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700' : 'border-slate-300 hover:border-blue-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}
                                >
                                    {outputHandle ? (
                                        <>
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                            <span>Klasör Seçildi: {outputHandle.name}</span>
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                                            <span>Çıkış Klasörü Seç...</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {!isIframe && (
                            <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded text-xs text-amber-800 dark:text-amber-200">
                                ⚠️ Bu özellik (Otomasyon) tarayıcınızın güvenlik kısıtlamaları nedeniyle sadece HTTPS veya Localhost üzerinde çalışır.
                            </div>
                        )}

                        <button
                            onClick={handleStartAutomation}
                            disabled={!inputHandle || !outputHandle || isAutomationActive}
                            className={`w-full py-3 mt-4 rounded font-bold transition-all ${isAutomationActive ? 'bg-green-100 text-green-700 cursor-default' : (!inputHandle || !outputHandle) ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg'}`}
                        >
                            {isAutomationActive ? 'OTOMASYON AKTİF ✅' : 'OTOMASYONU BAŞLAT ▶️'}
                        </button>
                    </div>
                </div>
            )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 bg-slate-50 dark:bg-slate-900/50 rounded-b-xl">
          <button 
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            İptal
          </button>
          <button 
            onClick={() => onSave(localSettings)}
            className="px-5 py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-lg hover:shadow-blue-500/30 transition-all"
          >
            Ayarları Kaydet
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;