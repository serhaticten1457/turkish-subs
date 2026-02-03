
// Common conjunctions and prepositions to prefer splitting *before*
const BREAK_BEFORE_TOKENS = new Set([
  // Turkish
  've', 'veya', 'ama', 'fakat', 'lakin', 'ancak', 'çünkü', 'oysa', 'madem', 'yoksa',
  'ile', 'için', 'diye', 'üzere', 'ki', 'de', 'da',
  // English
  'and', 'or', 'but', 'nor', 'for', 'yet', 'so', 'because', 'although', 'if', 'when', 'since', 'while', 'where', 'after', 'before', 'until'
]);

// Scoring system for split candidates
const PUNCTUATION_SCORE = 50;  // . ! ? : ;
const CLAUSE_SCORE = 40;       // , -
const CONJUNCTION_SCORE = 30;  // ve, ama...
const SPACE_SCORE = 10;        // normal space

interface SplitCandidate {
  index: number;
  score: number;
  type: 'punctuation' | 'clause' | 'conjunction' | 'space';
}

/**
 * Optimizes line breaks for a subtitle text block.
 * Tries to fit text into max 2 lines with balanced length and grammatical integrity.
 */
export const optimizeSubtitleBreaks = (text: string, maxCharsPerLine: number = 42): string => {
  if (!text) return "";
  
  // Clean up existing newlines to re-process
  const cleanText = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  
  // If it fits in one line, return as is
  if (cleanText.length <= maxCharsPerLine) {
    return cleanText;
  }

  // If it's too long for 2 lines (standard subtitle limit usually ~84 chars), 
  // we might need a more aggressive split or accept 3 lines (though 2 is standard).
  // This function focuses on finding the BEST single split point for 2 lines.
  
  const center = Math.floor(cleanText.length / 2);
  const searchRange = Math.floor(cleanText.length * 0.4); // Look around 40% of center
  const minIndex = Math.max(0, center - searchRange);
  const maxIndex = Math.min(cleanText.length, center + searchRange);

  let bestCandidate: SplitCandidate = { index: -1, score: -1, type: 'space' };

  // Iterate through the search range to find split candidates
  for (let i = minIndex; i < maxIndex; i++) {
    const char = cleanText[i];
    const prevChar = cleanText[i - 1];
    
    // We only split at spaces or after punctuation
    if (char !== ' ') continue;

    let currentScore = 0;
    let type: SplitCandidate['type'] = 'space';

    // 1. Check for Punctuation immediately before the space
    if (['.', '!', '?', ':', ';'].includes(prevChar)) {
      currentScore += PUNCTUATION_SCORE;
      type = 'punctuation';
    }
    // 2. Check for Clause dividers (comma)
    else if ([',', '—'].includes(prevChar)) {
      currentScore += CLAUSE_SCORE;
      type = 'clause';
    }
    
    // 3. Check for Conjunctions (Check the word FOLLOWING the space)
    const restOfStr = cleanText.slice(i + 1);
    const nextWord = restOfStr.split(' ')[0].toLowerCase().replace(/[.,?!]/g, '');
    
    if (BREAK_BEFORE_TOKENS.has(nextWord)) {
      currentScore += CONJUNCTION_SCORE;
      type = 'conjunction';
    } else {
      currentScore += SPACE_SCORE;
    }

    // 4. Balance Factor: Penalize heavily if the split results in very uneven lines
    const line1Len = i;
    const line2Len = cleanText.length - i - 1; // -1 for the space
    const balanceRatio = Math.min(line1Len, line2Len) / Math.max(line1Len, line2Len);
    
    // Multiply score by balance ratio (0.0 - 1.0). 
    // Perfect balance (0.5/0.5 = 1.0) keeps 100% of the semantic score.
    // Bad balance (0.1/0.9 = 0.11) reduces the score significantly.
    const finalScore = currentScore * (balanceRatio + 0.5); // +0.5 to keep semantic breaks valuable even if slightly unbalanced

    if (finalScore > bestCandidate.score) {
      bestCandidate = { index: i, score: finalScore, type };
    }
  }

  // If we found a valid split point
  if (bestCandidate.index !== -1) {
    const p1 = cleanText.substring(0, bestCandidate.index).trim();
    const p2 = cleanText.substring(bestCandidate.index + 1).trim();
    return `${p1}\n${p2}`;
  }

  // Fallback: Just split at the space closest to the middle
  const middleSpace = cleanText.lastIndexOf(' ', center);
  if (middleSpace !== -1) {
      const p1 = cleanText.substring(0, middleSpace).trim();
      const p2 = cleanText.substring(middleSpace + 1).trim();
      return `${p1}\n${p2}`;
  }

  return cleanText;
};
