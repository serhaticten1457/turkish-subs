import { SubtitleCue, SubtitleFile } from './types';
import { parseTimeCode, formatTimeCode } from './time';

// Polyfill for crypto.randomUUID in insecure contexts (HTTP)
const generateUUID = (): string => {
  // Check if crypto.randomUUID is supported and available
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
  } catch(e) {}
  
  // Fallback for insecure contexts (HTTP on LAN)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export const parseSubtitleFile = async (file: File): Promise<SubtitleFile> => {
  const text = await file.text();
  const isVtt = file.name.endsWith('.vtt');
  const cues: SubtitleCue[] = [];
  
  // Normalized line endings
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  
  let currentCue: Partial<SubtitleCue> = {};
  let state: 'index' | 'time' | 'text' = isVtt ? 'time' : 'index'; // VTT often skips index
  let textBuffer: string[] = [];

  // Regex helpers
  // SRT: 00:00:20,000 --> 00:00:24,400
  // VTT: 00:00:20.000 --> 00:00:24.400
  const timeRegex = /(\d{1,2}:\d{2}:\d{2}[.,]\d{3})\s-->\s(\d{1,2}:\d{2}:\d{2}[.,]\d{3})/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line === 'WEBVTT') continue;
    if (line === '') {
      if (currentCue.startTime && textBuffer.length > 0) {
        cues.push({
            id: currentCue.id || cues.length + 1,
            originalId: generateUUID(),
            startTime: currentCue.startTime!,
            endTime: currentCue.endTime!,
            originalText: textBuffer.join('\n'),
            translatedText: '',
            refinedText: '',
            status: 'pending',
            isLocked: false,
        } as SubtitleCue);
        currentCue = {};
        textBuffer = [];
        state = isVtt ? 'time' : 'index';
      }
      continue;
    }

    if (state === 'index') {
      if (/^\d+$/.test(line)) {
        currentCue.id = parseInt(line, 10);
        state = 'time';
      } else if (line.includes('-->')) {
          // Sometimes index is missing, jump to time
          state = 'time';
          i--; 
      }
      continue;
    }

    if (state === 'time') {
      const match = line.match(timeRegex);
      if (match) {
        currentCue.startTime = parseTimeCode(match[1], isVtt ? 'vtt' : 'srt');
        currentCue.endTime = parseTimeCode(match[2], isVtt ? 'vtt' : 'srt');
        state = 'text';
      } else {
          // If we expected time but got something else, maybe it's text (malformed file)
          // or we are in VTT where cue ID is optional before time
          if(!currentCue.id && !isVtt) {
              // try to parse as id
          }
      }
      continue;
    }

    if (state === 'text') {
      textBuffer.push(line);
    }
  }

  // Flush last cue
  if (currentCue.startTime && textBuffer.length > 0) {
    cues.push({
        id: currentCue.id || cues.length + 1,
        originalId: generateUUID(),
        startTime: currentCue.startTime!,
        endTime: currentCue.endTime!,
        originalText: textBuffer.join('\n'),
        translatedText: '',
        refinedText: '',
        status: 'pending',
        isLocked: false,
    } as SubtitleCue);
  }

  return {
    id: generateUUID(),
    name: file.name,
    cues,
    progress: 0,
    status: 'idle'
  };
};

export const serializeSubtitleFile = (file: SubtitleFile, format: 'srt' | 'vtt', dualLanguage: boolean = false): string => {
  let output = format === 'vtt' ? 'WEBVTT\n\n' : '';
  
  file.cues.forEach((cue, index) => {
    // Determine translation text: Refined > Translated > (Empty)
    const translation = cue.refinedText || cue.translatedText || "";
    
    // Determine final content based on Dual Language setting
    let finalText = "";
    if (dualLanguage && translation) {
        // Original on top, Translation below
        finalText = `${cue.originalText}\n${translation}`;
    } else {
        // Use translation if available, otherwise fallback to original to prevent empty cues
        finalText = translation || cue.originalText;
    }
    
    if (format === 'srt') {
      output += `${index + 1}\n`;
    }
    
    output += `${formatTimeCode(cue.startTime, format)} --> ${formatTimeCode(cue.endTime, format)}\n`;
    output += `${finalText}\n\n`;
  });
  
  return output;
};