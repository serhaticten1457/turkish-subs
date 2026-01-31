

export interface TimeCode {
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
  totalMilliseconds: number;
}

export interface Idiom {
  phrase: string;
  meaning: string;
  options: {
    literal: string;
    localized: string;
    explanatory: string;
  };
}

export interface SubtitleCue {
  id: number; // The numeric index usually found in SRT
  originalId: string; // Internal unique ID
  startTime: TimeCode;
  endTime: TimeCode;
  originalText: string;
  translatedText: string;
  refinedText: string; // Result of stage 2
  status: 'pending' | 'translating' | 'translated' | 'refining' | 'completed' | 'error' | 'analyzing_idioms';
  translationSource?: 'ai' | 'tm' | 'user' | 'cache'; // Track where the translation came from
  errorMessage?: string;
  isLocked: boolean; // If user manually edited, lock it from auto-updates unless forced
  idioms?: Idiom[]; // Detected idioms
}

export interface SubtitleFile {
  id: string;
  name: string;
  cues: SubtitleCue[];
  progress: number; // 0-100
  status: 'idle' | 'processing' | 'paused' | 'completed' | 'error';
  isAutomated?: boolean; // True if added via Watch Folder
  autoSavedToDisk?: boolean; // True if written to output folder
}

export interface TMDBContext {
    id: number;
    title: string; // or name for TV
    original_title: string;
    overview: string;
    release_date?: string;
    genres: string[];
    cast: string[]; // Top 5 cast members (character names help context)
}

export interface AppSettings {
  apiKeys: string[]; // Pool of API keys for load balancing
  keySelectionStrategy: 'sequential' | 'random'; // Load balancing strategy
  tmdbApiKey: string; // New: TMDB API Key
  translatorModel: string;
  editorModel: string;
  delayBetweenRequests: number; // ms
  maxRetries: number;
  batchSize: number; // Number of lines to process in a single request
  translationStyle: 'standard' | 'netflix' | 'anime' | 'documentary';
  glossary: Record<string, string>; // Term -> Translation
  styleGuide: string; // New: Free-form style rules and character voices
  contextWindowSize: number; // Number of lines before/after to send as context (0 = disabled)
}

export type SubtitleFormat = 'srt' | 'vtt';

export interface ProcessingQueueItem {
  fileId: string;
  cueId: string; // Internal ID
  stage: 'translation' | 'refinement';
}

export interface ProjectStats {
    totalLines: number;
    totalWords: number;
    completedLines: number;
    estimatedTimeRemaining: number; // seconds
}