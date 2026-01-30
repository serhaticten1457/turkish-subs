import React, { useRef, useEffect, useState } from 'react';
import { SubtitleCue, SubtitleFile, Idiom } from '../types';
import { formatTimeCode } from '../utils/time';
import { analyzeCueHealth } from '../utils/analysis';

interface CueListProps {
  file: SubtitleFile | null;
  onUpdateCue: (cueId: string, text: string, type: 'translated' | 'refined') => void;
  onRetryCue: (cueId: string) => void;
  onAnalyzeIdioms: (cueId: string) => void;
  onAddToGlossary: (source: string, target: string) => void;
  activeCueId: string | null;
}

const CueList: React.FC<CueListProps> = ({ file, onUpdateCue, onRetryCue, onAnalyzeIdioms, onAddToGlossary, activeCueId }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hoveredCueId, setHoveredCueId] = useState<string | null>(null);
  const [activeIdiomId, setActiveIdiomId] = useState<string | null>(null);
  
  // Selection State
  const [selection, setSelection] = useState<{ text: string, x: number, y: number } | null>(null);
  const [glossaryTarget, setGlossaryTarget] = useState("");

  useEffect(() => {
    if (activeCueId && scrollRef.current) {
        const el = document.getElementById(`cue-${activeCueId}`);
        if (el) {
             el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
  }, [activeCueId]);

  useEffect(() => {
      const handleSelectionChange = () => {
          const sel = window.getSelection();
          // Only show if selection is within a source text element and non-empty
          if (sel && sel.toString().trim().length > 0 && sel.anchorNode?.parentElement?.closest('.group\\/source')) {
              const range = sel.getRangeAt(0);
              const rect = range.getBoundingClientRect();
              setSelection({
                  text: sel.toString().trim(),
                  x: rect.left + (rect.width / 2),
                  y: rect.top
              });
          } else {
             // Don't clear immediately if typing in the popup
             // handled by click outside logic
          }
      };

      document.addEventListener('mouseup', handleSelectionChange);
      return () => document.removeEventListener('mouseup', handleSelectionChange);
  }, []);

  // Handle clicking outside idiom popover and selection popup
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
        setActiveIdiomId(null);
        if (!(e.target as HTMLElement).closest('.glossary-popup')) {
             setSelection(null);
             setGlossaryTarget("");
        }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleIdiomOptionClick = (e: React.MouseEvent, cue: SubtitleCue, optionText: string) => {
      e.stopPropagation();
      const current = cue.refinedText || cue.translatedText || "";
      if (!current) {
          onUpdateCue(cue.originalId, optionText, 'translated');
      } else {
          onUpdateCue(cue.originalId, optionText, 'translated'); 
      }
      setActiveIdiomId(null);
  };

  const confirmAddToGlossary = () => {
      if (selection && glossaryTarget) {
          onAddToGlossary(selection.text, glossaryTarget);
          setSelection(null);
          setGlossaryTarget("");
      }
  };

  const renderSourceTextWithIdioms = (cue: SubtitleCue) => {
      if (!cue.idioms || cue.idioms.length === 0) return cue.originalText;

      let parts: React.ReactNode[] = [];
      const text = cue.originalText;
      const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`(${cue.idioms.map(i => escapeRegExp(i.phrase)).join('|')})`, 'gi');
      
      const splitText = text.split(pattern);

      return splitText.map((part, index) => {
          const matchedIdiom = cue.idioms?.find(i => i.phrase.toLowerCase() === part.toLowerCase());
          
          if (matchedIdiom) {
              const uniqueId = `${cue.originalId}-${matchedIdiom.phrase}-${index}`;
              const isOpen = activeIdiomId === uniqueId;

              return (
                  <span key={index} className="relative inline-block">
                      <span 
                          className="cursor-pointer text-blue-600 dark:text-blue-400 border-b-2 border-dashed border-blue-400/50 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded px-0.5 transition-colors font-medium"
                          onClick={(e) => {
                              e.stopPropagation();
                              setActiveIdiomId(isOpen ? null : uniqueId);
                          }}
                          title={matchedIdiom.meaning}
                      >
                          {part}
                      </span>
                      {isOpen && (
                          <div className="absolute z-50 left-0 mt-2 w-72 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden text-left ring-1 ring-black/5" onClick={e => e.stopPropagation()}>
                              <div className="bg-slate-50 dark:bg-slate-900/50 p-2 border-b border-slate-100 dark:border-slate-700">
                                  <div className="text-[10px] uppercase font-bold text-slate-400">Anlam</div>
                                  <div className="text-xs text-slate-700 dark:text-slate-300 italic">{matchedIdiom.meaning}</div>
                              </div>
                              <div className="p-1 flex flex-col gap-1 max-h-60 overflow-y-auto">
                                  {/* Localized Option */}
                                  <button onClick={(e) => handleIdiomOptionClick(e, cue, matchedIdiom.options.localized)} className="w-full text-left p-2 hover:bg-green-50 dark:hover:bg-green-900/20 rounded group transition-colors border border-transparent hover:border-green-100 dark:hover:border-green-800">
                                      <div className="text-[10px] text-green-600 font-bold mb-0.5 flex justify-between">
                                          YERELLEŞTİRİLMİŞ (Önerilen)
                                          <span className="opacity-0 group-hover:opacity-100">Seç</span>
                                      </div>
                                      <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{matchedIdiom.options.localized}</div>
                                  </button>

                                  {/* Literal Option */}
                                  <button onClick={(e) => handleIdiomOptionClick(e, cue, matchedIdiom.options.literal)} className="w-full text-left p-2 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded group transition-colors border border-transparent hover:border-amber-100 dark:hover:border-amber-800">
                                      <div className="text-[10px] text-amber-600 font-bold mb-0.5">KELİMESİ KELİMESİNE</div>
                                      <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{matchedIdiom.options.literal}</div>
                                  </button>

                                  {/* Explanatory Option */}
                                  <button onClick={(e) => handleIdiomOptionClick(e, cue, matchedIdiom.options.explanatory)} className="w-full text-left p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded group transition-colors border border-transparent hover:border-blue-100 dark:hover:border-blue-800">
                                      <div className="text-[10px] text-blue-600 font-bold mb-0.5">AÇIKLAYICI</div>
                                      <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{matchedIdiom.options.explanatory}</div>
                                  </button>
                              </div>
                          </div>
                      )}
                  </span>
              );
          }
          return <span key={index}>{part}</span>;
      });
  };

  if (!file) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center bg-slate-50 dark:bg-slate-950">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 mb-6 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <h2 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-2">Editör Boş</h2>
        <p className="max-w-md mx-auto">Başlamak için sol panelden bir dosya seçin veya sürükleyip bırakarak yeni bir altyazı yükleyin.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-100 dark:bg-slate-950 px-4 py-6" ref={scrollRef}>
      {/* Quick Glossary Popup */}
      {selection && (
          <div 
             className="fixed z-50 bg-slate-800 text-white p-2 rounded-lg shadow-xl glossary-popup flex flex-col gap-2 border border-slate-700"
             style={{ left: selection.x, top: selection.y - 80, transform: 'translateX(-50%)' }}
             onMouseDown={e => e.stopPropagation()}
          >
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sözlüğe Ekle</div>
              <div className="flex items-center gap-2">
                  <div className="font-mono text-xs bg-slate-900 px-1.5 py-1 rounded text-blue-400 max-w-[100px] truncate" title={selection.text}>{selection.text}</div>
                  <span className="text-slate-500">→</span>
                  <input 
                      autoFocus
                      className="bg-slate-900 border border-slate-600 rounded px-1.5 py-1 text-xs text-white outline-none w-24 focus:border-blue-500"
                      placeholder="Çeviri..."
                      value={glossaryTarget}
                      onChange={e => setGlossaryTarget(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && confirmAddToGlossary()}
                  />
                  <button onClick={confirmAddToGlossary} className="text-green-400 hover:text-green-300">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </button>
              </div>
          </div>
      )}

      <div className="max-w-5xl mx-auto space-y-3">
        {file.cues.map((cue) => {
          const isActive = activeCueId === cue.originalId;
          const isError = cue.status === 'error';
          const health = analyzeCueHealth(cue);
          
          let borderColorClass = "border-slate-200 dark:border-slate-800";
          let healthColorClass = "bg-green-500";
          
          if (health.status === 'red') healthColorClass = "bg-red-500";
          if (health.status === 'yellow') healthColorClass = "bg-yellow-500";
          
          if (isActive) borderColorClass = "border-blue-500 ring-1 ring-blue-500";
          if (isError) borderColorClass = "border-red-500";

          const currentText = cue.refinedText || cue.translatedText || "";
          const ghostText = (cue.refinedText && cue.translatedText !== cue.refinedText) ? cue.translatedText : null;
          const showGhost = hoveredCueId === cue.originalId && ghostText;

          return (
            <div 
              key={cue.originalId} 
              id={`cue-${cue.originalId}`}
              onMouseEnter={() => setHoveredCueId(cue.originalId)}
              onMouseLeave={() => setHoveredCueId(null)}
              className={`
                relative flex bg-white dark:bg-slate-900 rounded-lg border shadow-sm transition-all duration-200
                ${borderColorClass}
              `}
            >
              {/* Health Bar (Left Edge) */}
              <div 
                className={`w-1.5 rounded-l-lg flex-shrink-0 ${healthColorClass} opacity-80`} 
                title={health.reasons.join('\n') || 'Durum: Mükemmel'}
              />

              {/* ID & Time (Left Sidebar) */}
              <div className="w-24 flex-shrink-0 p-3 flex flex-col justify-center border-r border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-[10px] font-mono text-slate-500">
                <div className="font-bold mb-1 text-slate-700 dark:text-slate-300">#{cue.id}</div>
                <div>{formatTimeCode(cue.startTime, 'srt').split(',')[0]}</div>
                <div className="opacity-50 text-[9px] mx-auto">▼</div>
                <div>{formatTimeCode(cue.endTime, 'srt').split(',')[0]}</div>
                {health.cps > 0 && (
                     <div className={`mt-2 font-bold ${health.status === 'red' ? 'text-red-500' : (health.status === 'yellow' ? 'text-yellow-600' : 'text-green-600')}`}>
                         {health.cps} cps
                     </div>
                )}
              </div>

              {/* Content Area (Split View) */}
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-slate-800">
                
                {/* Source Text */}
                <div className="relative p-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap select-text group/source cursor-text">
                    {/* Idiom Analysis Button (Visible on Hover or if processing) */}
                    <div className="absolute top-1 right-1 opacity-0 group-hover/source:opacity-100 transition-opacity z-10">
                        <button 
                            onClick={() => onAnalyzeIdioms(cue.originalId)}
                            disabled={cue.status === 'analyzing_idioms'}
                            className={`p-1 rounded shadow-sm text-[10px] font-bold flex items-center gap-1 ${cue.status === 'analyzing_idioms' ? 'bg-purple-100 text-purple-700 cursor-wait' : 'bg-slate-100 hover:bg-purple-100 text-slate-500 hover:text-purple-600'}`}
                            title="Deyim ve Kültürel Analiz Yap"
                        >
                            {cue.status === 'analyzing_idioms' ? (
                                <span className="animate-spin">✨</span>
                            ) : (
                                <span>🪄</span>
                            )}
                        </button>
                    </div>
                    {renderSourceTextWithIdioms(cue)}
                </div>

                {/* Target Text (Editable) */}
                <div className="relative p-3 bg-white dark:bg-slate-900 group">
                    
                    {/* "Redo Translation" Button (Top Right) */}
                    {(cue.status === 'completed' || cue.status === 'translated' || cue.status === 'refining') && !isError && (
                        <div className={`absolute top-2 right-2 z-20 transition-all duration-200 transform ${isActive || hoveredCueId === cue.originalId ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1 pointer-events-none'}`}>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRetryCue(cue.originalId);
                                }}
                                className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 hover:bg-blue-100 border border-slate-200 hover:border-blue-300 text-slate-600 hover:text-blue-600 dark:bg-slate-800 dark:hover:bg-blue-900/30 dark:border-slate-700 dark:hover:border-blue-700 dark:text-slate-400 dark:hover:text-blue-300 rounded text-[10px] font-bold shadow-sm transition-all"
                                title="Sadece bu satırı yeniden çevir"
                            >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                <span>Yeniden Çevir</span>
                            </button>
                        </div>
                    )}
                    
                    {/* Instant Diff / Ghost Text Overlay */}
                    {showGhost && (
                        <div className="absolute top-0 left-0 w-full p-3 pointer-events-none z-10">
                             <div className="text-xs text-slate-400/60 font-mono mb-1 select-none">AI İlk Çeviri:</div>
                             <div className="text-sm text-slate-400/50 line-through decoration-slate-400/30 whitespace-pre-wrap">
                                 {ghostText}
                             </div>
                        </div>
                    )}

                    {cue.status === 'pending' || cue.status === 'translating' ? (
                       <div className="h-full flex flex-col items-center justify-center text-xs text-slate-400 gap-2 min-h-[60px]">
                           {cue.status === 'translating' ? (
                               <>
                                <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-200 border-t-blue-500"></div>
                                <span>AI Çeviriyor...</span>
                               </>
                           ) : (
                               <span>Sırada...</span>
                           )}
                       </div>
                    ) : (
                        <textarea
                            className={`
                                w-full h-full bg-transparent resize-none focus:outline-none 
                                text-sm leading-relaxed rounded pt-6 /* pt-6 for redo button space */
                                ${isError ? 'text-red-600' : 'text-slate-900 dark:text-slate-100'}
                                placeholder-slate-300 dark:placeholder-slate-700
                            `}
                            style={{ minHeight: '3.5rem' }}
                            value={currentText}
                            onChange={(e) => onUpdateCue(cue.originalId, e.target.value, cue.refinedText ? 'refined' : 'translated')}
                            placeholder="Çeviri..."
                        />
                    )}

                    {/* Action & Status Icons */}
                    <div className="absolute bottom-1 right-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm rounded px-1">
                        {isError && (
                            <span className="text-[10px] text-red-500 font-bold uppercase">HATA</span>
                        )}
                    </div>
                </div>
              </div>

              {/* Warnings Tooltip Area (Only if issues exist) */}
              {health.status !== 'green' && (
                  <div className="absolute -right-2 top-0 bottom-0 w-1 flex flex-col justify-center items-center overflow-visible z-20 group-hover:w-auto">
                      <div className="hidden group-hover:flex absolute right-4 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-[10px] py-1 px-2 rounded whitespace-nowrap shadow-lg flex-col gap-0.5 items-end">
                          {health.reasons.map((r, i) => (
                              <span key={i} className={health.status === 'red' ? 'text-red-200' : 'text-yellow-200'}>{r}</span>
                          ))}
                      </div>
                      <div className={`w-2 h-2 rounded-full ${health.status === 'red' ? 'bg-red-500 animate-pulse' : 'bg-yellow-500'}`}></div>
                  </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CueList;