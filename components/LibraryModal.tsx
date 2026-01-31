import React, { useState, useEffect } from 'react';
import { loadLibrary, deleteFromLibrary, LibraryItem } from '../utils/db';
import { serializeSubtitleFile } from '../utils/parser';

interface LibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadFile: (file: LibraryItem) => void;
}

const LibraryModal: React.FC<LibraryModalProps> = ({ isOpen, onClose, onLoadFile }) => {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
        refreshLibrary();
    }
  }, [isOpen]);

  const refreshLibrary = async () => {
      setLoading(true);
      const data = await loadLibrary();
      // Sort by savedAt descending (newest first)
      data.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
      setItems(data);
      setLoading(false);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if(confirm('Bu dosyayı kütüphaneden kalıcı olarak silmek istediğinize emin misiniz?')) {
          await deleteFromLibrary(id);
          refreshLibrary();
      }
  };

  const handleDownload = (item: LibraryItem, format: 'srt' | 'vtt', e: React.MouseEvent) => {
      e.stopPropagation();
      const content = serializeSubtitleFile(item, format, false);
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `[Kütüphane] ${item.name.replace(/\.(srt|vtt)$/i, '')}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[80vh]">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
             <div>
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    📚 Çeviri Kütüphanesi
                </h2>
                <p className="text-sm text-slate-500">Tamamlanan projeleriniz burada arşivlenir.</p>
             </div>
             <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
                 <svg className="w-6 h-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
             </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-slate-50 dark:bg-slate-950">
            {loading ? (
                <div className="flex justify-center p-10 text-slate-500">Yükleniyor...</div>
            ) : items.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-10 text-slate-400">
                    <svg className="w-16 h-16 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                    <p>Kütüphane boş.</p>
                    <p className="text-sm mt-2">Tamamlanan işlerinizi sol paneldeki "Kütüphaneye Kaydet" butonu ile buraya ekleyebilirsiniz.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {items.map(item => (
                        <div key={item.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 hover:shadow-lg transition-shadow group relative">
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="font-bold text-slate-800 dark:text-slate-200 truncate pr-8" title={item.name}>{item.name}</h3>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={(e) => handleDownload(item, 'srt', e)}
                                        className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-600 font-bold"
                                    >
                                        SRT
                                    </button>
                                    <button 
                                        onClick={(e) => handleDelete(item.id, e)}
                                        className="text-slate-400 hover:text-red-500"
                                        title="Sil"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                </div>
                            </div>
                            
                            <div className="text-xs text-slate-500 space-y-1 mb-4">
                                <div>📅 Kayıt: {new Date(item.savedAt).toLocaleString()}</div>
                                <div>📝 Satır: {item.cues.length}</div>
                                <div className="text-green-600 font-medium">✅ Tamamlandı</div>
                            </div>

                            <button 
                                onClick={() => { onClose(); onLoadFile(item); }}
                                className="w-full py-2 text-sm bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded border border-slate-200 dark:border-slate-700 transition-colors"
                            >
                                Editöre Yükle / Düzenle
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default LibraryModal;