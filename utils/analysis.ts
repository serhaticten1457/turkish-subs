import { SubtitleCue } from './types';

export interface CueHealth {
  status: 'green' | 'yellow' | 'red';
  reasons: string[];
  cps: number;
}

export const analyzeCueHealth = (cue: SubtitleCue): CueHealth => {
  const text = cue.refinedText || cue.translatedText || "";
  if (!text) return { status: 'green', reasons: [], cps: 0 };

  const reasons: string[] = [];
  let status: 'green' | 'yellow' | 'red' = 'green';

  // 1. Calculate Duration (seconds)
  const durationMs = cue.endTime.totalMilliseconds - cue.startTime.totalMilliseconds;
  const durationSec = durationMs / 1000;

  // 2. Character Limit Check (Standard: 42 chars per line)
  const lines = text.split('\n');
  const maxLineLength = Math.max(...lines.map(l => l.length));
  
  if (maxLineLength > 42) {
    status = 'red';
    reasons.push(`Satır uzunluğu sınırı aşıldı (${maxLineLength}/42)`);
  }

  // 3. Reading Speed (CPS - Characters Per Second)
  // Standard: 15-20 excellent, 20-25 fast, >25 too fast
  // We exclude whitespace for a fairer calculation in some standards, but usually inclusive.
  const charCount = text.length; 
  const cps = durationSec > 0 ? parseFloat((charCount / durationSec).toFixed(1)) : 0;

  if (cps > 25) {
    status = status === 'red' ? 'red' : 'yellow';
    reasons.push(`Okuma hızı çok yüksek (${cps} k/s)`);
  }

  // 4. Hallucination / Consistency Check (Basic Heuristic)
  // If translation is 3x longer than original or extremely short compared to long audio
  const originalLen = cue.originalText.length;
  if (originalLen > 10 && charCount < 3) {
      status = 'red';
      reasons.push('Çeviri şüpheli derecede kısa (Halüsinasyon?)');
  }
  if (originalLen > 0 && charCount > originalLen * 4) {
      // Turkish is agglutinative but 4x is suspicious
      status = 'yellow'; 
      reasons.push('Çeviri orijinalden çok daha uzun.');
  }

  return { status, reasons, cps };
};