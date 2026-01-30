import React, { useState } from 'react';
import { AppSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onStartAutomation: (inputHandle: any, outputHandle: any) => void;
  isAutomationActive: boolean;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSave, onStartAutomation, isAutomationActive }) => {
  const [localSettings, setLocalSettings] = React.useState<AppSettings>(settings);
  const [activeTab, setActiveTab] = useState<'api' | 'style' | 'glossary' | 'automation'>('api');
  
  // Glossary local state
  const [newTermKey, setNewTermKey] = useState('');
  const [newTermVal, setNewTermVal] = useState('');

  // Automation Handles (Temporary state before passing to App)
  const [inputHandle, setInputHandle] = useState<any>(null);
  const [outputHandle, setOutputHandle] = useState<any>(null);

  React.useEffect(() => {
    setLocalSettings(settings);
  }, [settings, isOpen]);

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

  const pickInputFolder = async () => {
    try {
        // @ts-ignore - File System Access API
        const handle = await window.showDirectoryPicker();
        setInputHandle(handle);
    } catch (e) { console.error(e); }
  };

  const pickOutputFolder = async () => {
    try {
        // @ts-ignore
        const handle = await window.showDirectoryPicker();
        setOutputHandle(handle);
    } catch (e) { console.error(e); }
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
                <button onClick={() => setActiveTab('glossary')} className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-all ${activeTab === 'glossary' ? 'bg-white dark:bg-slate-700 shadow text-blue-600' : 'text-slate-500'}`}>Sözlük</button>
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
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            Gemini API Anahtarları (Her satıra bir adet)
                        </label>
                        <div className="relative">
                            <textarea
                                className="w-full h-24 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono resize-none"
                                value={localSettings.apiKeys.join('\n')}
                                onChange={(e) => handleChange('apiKeys', e.target.value.split('\n').map(k => k.trim()).filter(k => k !== ''))}
                                placeholder="AIzaSy...&#10;AIzaSy..."
                            />
                            <div className="absolute top-2 right-2 px-2 py-1 bg-slate-200 dark:bg-slate-700 rounded text-xs text-slate-600 dark:text-slate-300">
                                {localSettings.apiKeys.length} Anahtar
                            </div>
                        </div>
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
                                : "Mevcut satır çevrilirken AI'ya önceki ve sonraki satırları gösterir."
                            }
                        </p>
                    </div>
                </div>
            )}

            {/* GLOSSARY TAB */}
            {activeTab === 'glossary' && (
                <div className="h-full flex flex-col">
                    <p className="text-sm text-slate-500 mb-4">Bu kelimeler AI tarafından çevrilirken öncelikli olarak kullanılır veya hiç çevrilmez.</p>
                    
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

                    <div className="flex-1 border border-slate-200 dark:border-slate-700 rounded-lg overflow-y-auto min-h-[200px] p-2 bg-slate-50 dark:bg-slate-900">
                        {Object.entries(localSettings.glossary).length === 0 && (
                            <div className="text-center text-slate-400 mt-10">Sözlük boş.</div>
                        )}
                        {Object.entries(localSettings.glossary).map(([key, val]) => (
                            <div key={key} className="flex justify-between items-center p-2 border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-white dark:hover:bg-slate-800 rounded">
                                <span className="text-sm font-mono"><span className="text-blue-500">{key}</span> <span className="text-slate-400">→</span> <span className="text-green-500">{val}</span></span>
                                <button onClick={() => removeGlossaryTerm(key)} className="text-slate-400 hover:text-red-500">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* AUTOMATION TAB */}
            {activeTab === 'automation' && (
                <div className="space-y-6">
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
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
                                        <span>Klasör Seçildi: {String(inputHandle.name)}</span>
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
                                        <span>Klasör Seçildi: {String(outputHandle.name)}</span>
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

                    <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded text-xs text-amber-800 dark:text-amber-200">
                        ⚠️ Bu özellik tarayıcınızın "Dosya Sistemi Erişim API"sini kullanır. Sekme kapatılırsa izleme durur.
                    </div>

                    <button
                        onClick={handleStartAutomation}
                        disabled={!inputHandle || !outputHandle || isAutomationActive}
                        className={`w-full py-3 rounded font-bold transition-all ${isAutomationActive ? 'bg-green-100 text-green-700 cursor-default' : (!inputHandle || !outputHandle) ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg'}`}
                    >
                        {isAutomationActive ? 'OTOMASYON AKTİF ✅' : 'OTOMASYONU BAŞLAT ▶️'}
                    </button>
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