/**
 * naturalize.js — Post-processing pass that adds natural human imperfection.
 *
 * Runs AFTER the humanizer removes AI patterns. Adds back the kind of
 * natural looseness that makes text sound like a competent human wrote it
 * quickly, not like an AI polished it for hours.
 *
 * Three transformation types:
 *   1. Contractions — "it is" → "it's", "cannot" → "can't"
 *   2. Colloquial word swaps — "utilize" → "use", "demonstrate" → "show"
 *   3. Sentence looseners — "And"/"But" starters, discourse markers, semicolons
 *
 * Intensity levels:
 *   light   — contractions + word swaps only
 *   medium  — light + sentence looseners
 *   heavy   — medium + more aggressive restructuring (not yet implemented)
 */

// ─── Contractions ──────────────────────────────────────
// Ordered by specificity (longer patterns first to avoid partial matches)

const CONTRACTIONS = [
  // Negative contractions (handle separately to avoid double-contracting)
  { pattern: /\bcannot\b/gi, replacement: "can't" },
  { pattern: /\bwill not\b/gi, replacement: "won't" },
  { pattern: /\bcould not\b/gi, replacement: "couldn't" },
  { pattern: /\bshould not\b/gi, replacement: "shouldn't" },
  { pattern: /\bwould not\b/gi, replacement: "wouldn't" },
  { pattern: /\bmust not\b/gi, replacement: "mustn't" },
  { pattern: /\bdo not\b/gi, replacement: "don't" },
  { pattern: /\bdoes not\b/gi, replacement: "doesn't" },
  { pattern: /\bdid not\b/gi, replacement: "didn't" },
  { pattern: /\bhave not\b/gi, replacement: "haven't" },
  { pattern: /\bhas not\b/gi, replacement: "hasn't" },
  { pattern: /\bhad not\b/gi, replacement: "hadn't" },
  { pattern: /\bare not\b/gi, replacement: "aren't" },
  { pattern: /\bis not\b/gi, replacement: "isn't" },
  { pattern: /\bwas not\b/gi, replacement: "wasn't" },
  { pattern: /\bwere not\b/gi, replacement: "weren't" },

  // Pronoun + verb contractions
  { pattern: /\bI am\b/gi, replacement: "I'm" },
  { pattern: /\bI have\b/gi, replacement: "I've" },
  { pattern: /\bI will\b/gi, replacement: "I'll" },
  { pattern: /\bI would\b/gi, replacement: "I'd" },
  { pattern: /\byou are\b/gi, replacement: "you're" },
  { pattern: /\byou will\b/gi, replacement: "you'll" },
  { pattern: /\byou would\b/gi, replacement: "you'd" },
  { pattern: /\bwe are\b/gi, replacement: "we're" },
  { pattern: /\bwe will\b/gi, replacement: "we'll" },
  { pattern: /\bwe would\b/gi, replacement: "we'd" },
  { pattern: /\bthey are\b/gi, replacement: "they're" },
  { pattern: /\bthey have\b/gi, replacement: "they've" },
  { pattern: /\bthey will\b/gi, replacement: "they'll" },
  { pattern: /\bthey would\b/gi, replacement: "they'd" },
  { pattern: /\bhe is\b/gi, replacement: "he's" },
  { pattern: /\bhe will\b/gi, replacement: "he'll" },
  { pattern: /\bhe would\b/gi, replacement: "he'd" },
  { pattern: /\bshe is\b/gi, replacement: "she's" },
  { pattern: /\bshe will\b/gi, replacement: "she'll" },
  { pattern: /\bshe would\b/gi, replacement: "she'd" },
  { pattern: /\bit is\b/gi, replacement: "it's" },
  { pattern: /\bit has\b/gi, replacement: "it's" },
  { pattern: /\bit will\b/gi, replacement: "it'll" },
  { pattern: /\bthat is\b/gi, replacement: "that's" },
  { pattern: /\bthere is\b/gi, replacement: "there's" },
  { pattern: /\bthere will\b/gi, replacement: "there'll" },
  { pattern: /\bhere is\b/gi, replacement: "here's" },
  { pattern: /\bwhat is\b/gi, replacement: "what's" },
  { pattern: /\bwho is\b/gi, replacement: "who's" },
  { pattern: /\bwho will\b/gi, replacement: "who'll" },
  { pattern: /\bwho would\b/gi, replacement: "who'd" },
  { pattern: /\bwho have\b/gi, replacement: "who've" },
];

// ─── Colloquial Word Swaps ──────────────────────────────
// Formal → casual replacements. Word-boundary matched, case-preserving.

const COLLOQUIAL_SWAPS = [
  // Single-word replacements
  { pattern: /\butilize\b/gi, replacement: 'use' },
  { pattern: /\butilizes\b/gi, replacement: 'uses' },
  { pattern: /\butilized\b/gi, replacement: 'used' },
  { pattern: /\butilizing\b/gi, replacement: 'using' },
  { pattern: /\butilization\b/gi, replacement: 'use' },
  { pattern: /\bdemonstrate\b/gi, replacement: 'show' },
  { pattern: /\bdemonstrated\b/gi, replacement: 'showed' },
  { pattern: /\bdemonstrates\b/gi, replacement: 'shows' },
  { pattern: /\bdemonstrating\b/gi, replacement: 'showing' },
  { pattern: /\bassist\b/gi, replacement: 'help' },
  { pattern: /\bassisted\b/gi, replacement: 'helped' },
  { pattern: /\bassisting\b/gi, replacement: 'helping' },
  { pattern: /\bassistance\b/gi, replacement: 'help' },
  { pattern: /\bsufficient\b/gi, replacement: 'enough' },
  { pattern: /\bobtain\b/gi, replacement: 'get' },
  { pattern: /\bobtained\b/gi, replacement: 'got' },
  { pattern: /\bobtaining\b/gi, replacement: 'getting' },
  { pattern: /\bprovide\b/gi, replacement: 'give' },
  { pattern: /\bprovided\b/gi, replacement: 'gave' },
  { pattern: /\bprovides\b/gi, replacement: 'gives' },
  { pattern: /\bproviding\b/gi, replacement: 'giving' },
  { pattern: /\brequire\b/gi, replacement: 'need' },
  { pattern: /\brequires\b/gi, replacement: 'needs' },
  { pattern: /\brequired\b/gi, replacement: 'needed' },
  { pattern: /\battempt\b/gi, replacement: 'try' },
  { pattern: /\battempted\b/gi, replacement: 'tried' },
  { pattern: /\battempting\b/gi, replacement: 'trying' },
  { pattern: /\binitiate\b/gi, replacement: 'start' },
  { pattern: /\binitiated\b/gi, replacement: 'started' },
  { pattern: /\binitiating\b/gi, replacement: 'starting' },
  { pattern: /\bperforming\b/gi, replacement: 'doing' },
  { pattern: /\bpossess\b/gi, replacement: 'have' },
  { pattern: /\bpossesses\b/gi, replacement: 'has' },
  { pattern: /\bpossessed\b/gi, replacement: 'had' },

  // Multi-word replacements
  { pattern: /\bprior to\b/gi, replacement: 'before' },
  { pattern: /\bsubsequent to\b/gi, replacement: 'after' },
  { pattern: /\bin the vicinity of\b/gi, replacement: 'near' },
  { pattern: /\bwith the exception of\b/gi, replacement: 'except' },
  { pattern: /\bin the absence of\b/gi, replacement: 'without' },
  { pattern: /\bon the occasion of\b/gi, replacement: 'when' },
  { pattern: /\bwith reference to\b/gi, replacement: 'about' },
  { pattern: /\bwith regard to\b/gi, replacement: 'about' },
  { pattern: /\bin relation to\b/gi, replacement: 'about' },
  { pattern: /\bwith respect to\b/gi, replacement: 'about' },
  { pattern: /\bin the event that\b/gi, replacement: 'if' },
];

// ─── Transition Word Replacements ──────────────────────
// For sentence looseners: replace formal transitions with casual ones.

const TRANSITION_SWAPS = [
  { pattern: /\bHowever,/gi, replacement: 'But' },
  { pattern: /\bhowever,/gi, replacement: 'but' },
  { pattern: /\bMoreover,/gi, replacement: 'Plus,' },
  { pattern: /\bmoreover,/gi, replacement: 'plus,' },
  { pattern: /\bFurthermore,/gi, replacement: 'Plus,' },
  { pattern: /\bfurthermore,/gi, replacement: 'plus,' },
  { pattern: /\bConsequently,/gi, replacement: 'So' },
  { pattern: /\bconsequently,/gi, replacement: 'so' },
  { pattern: /\bTherefore,/gi, replacement: 'So' },
  { pattern: /\btherefore,/gi, replacement: 'so' },
  { pattern: /\bNevertheless,/gi, replacement: 'Still,' },
  { pattern: /\bnevertheless,/gi, replacement: 'still,' },
  { pattern: /\bNonetheless,/gi, replacement: 'Still,' },
  { pattern: /\bnonetheless,/gi, replacement: 'still,' },
];

// ─── Discourse Markers ──────────────────────────────────
// Inserted at the start of a sentence. Used sparingly (max 1 per text).

const DISCOURSE_MARKERS = [
  'Honestly,',
  'Actually,',
];

// ─── Main Naturalize Function ──────────────────────────

/**
 * Apply naturalization transformations to text.
 *
 * @param {string} text — Input text (post-humanizer)
 * @param {string} intensity — 'light', 'medium', or 'heavy'
 * @returns {string} — Naturalized text
 */
function naturalize(text, intensity = 'medium') {
  if (!text || typeof text !== 'string') return text;

  let result = text;

  // Step 1: Apply contractions (all intensities)
  result = applyContractions(result);

  // Step 2: Apply colloquial word swaps (all intensities)
  result = applyColloquialSwaps(result);

  // Step 3: Sentence looseners (medium+ only)
  if (intensity === 'medium' || intensity === 'heavy') {
    result = applySentenceLooseners(result, intensity);
  }

  return result;
}

// ─── Step 1: Contractions ───────────────────────────────

function applyContractions(text) {
  let result = text;

  for (const { pattern, replacement } of CONTRACTIONS) {
    result = result.replace(pattern, (match) => {
      // Preserve case: if the match starts with uppercase, capitalize the replacement
      if (match[0] === match[0].toUpperCase() && match.length > 1) {
        return replacement.charAt(0).toUpperCase() + replacement.slice(1);
      }
      return replacement;
    });
  }

  return result;
}

// ─── Step 2: Colloquial Word Swaps ─────────────────────

function applyColloquialSwaps(text) {
  let result = text;

  for (const { pattern, replacement } of COLLOQUIAL_SWAPS) {
    result = result.replace(pattern, (match) => {
      // Preserve case
      if (match[0] === match[0].toUpperCase() && match.length > 1) {
        return replacement.charAt(0).toUpperCase() + replacement.slice(1);
      }
      return replacement;
    });
  }

  return result;
}

// ─── Step 3: Sentence Looseners ────────────────────────

function applySentenceLooseners(text, intensity) {
  let result = text;

  // 3a. Replace formal transition words with casual ones
  for (const { pattern, replacement } of TRANSITION_SWAPS) {
    result = result.replace(pattern, replacement);
  }

  // 3b. Replace semicolons with periods (humans rarely use them)
  // Only replace if the semicolon connects two independent clauses
  result = result.replace(/; /g, '. ');

  // 3c. Split "which" clauses into separate sentences
  // ", which" → ". That/This/It" — only when it starts a non-restrictive clause
  result = result.replace(/, which (means|makes|gives|shows|indicates|suggests|creates|leads to|results in)/gi,
    (match, word) => {
      return `. That ${word}`;
    }
  );

  // 3d. Add one discourse marker at the start of a sentence (max 1)
  if (intensity === 'medium' || intensity === 'heavy') {
    result = maybeAddDiscourseMarker(result);
  }

  return result;
}

// ─── Discourse Marker Helper ────────────────────────────

function maybeAddDiscourseMarker(text) {
  // Only add if the text is long enough (>50 words) and doesn't already have one
  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length < 50) return text;

  // Check if a discourse marker already exists
  for (const marker of DISCOURSE_MARKERS) {
    if (text.includes(marker)) return text;
  }

  // Split sentences carefully — avoid splitting on decimal numbers (e.g., "54.6%")
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z"'"“])/);
  if (!sentences || sentences.length < 2) return text;

  // Try to add to the second sentence (avoids starting the whole piece with it)
  const targetIdx = sentences.length >= 3 ? 1 : 0;
  const target = sentences[targetIdx].trim();

  // Don't add if the sentence already starts with a discourse-like word or list item
  if (/^(And|But|So|Or|Well|Actually|Honestly|First|First,|Second|Second,|Third|Finally|Next|Another|Also|Plus)/i.test(target)) return text;

  // Only add before sentences that express opinions or judgments, not facts
  const opinionIndicators = /\b(I think|I believe|I find|probably|honestly|frankly|the truth is|the problem is|the issue is|what matters|the point is|here's the thing)\b/i;
  if (!opinionIndicators.test(target)) return text;

  // Pick a random marker
  const marker = DISCOURSE_MARKERS[Math.floor(Math.random() * DISCOURSE_MARKERS.length)];

  // Reconstruct the text with the marker inserted
  const before = sentences.slice(0, targetIdx).join(' ');
  const after = sentences.slice(targetIdx + 1).join(' ');
  // Lowercase the first letter unless it's "I" or a proper noun
  const firstChar = target.charAt(0);
  const rest = target.slice(1);
  const lowered = firstChar === 'I' && rest.charAt(0) === ' ' ? firstChar : firstChar.toLowerCase();
  const modified = `${marker} ${lowered}${rest}`;

  if (targetIdx === 0) {
    return modified + (after ? ' ' + after : '');
  } else {
    return before + ' ' + modified + (after ? ' ' + after : '');
  }
}

// ─── Register Detection ────────────────────────────────
// Analyzes text to determine formality level and pick the right intensity.

const FORMAL_INDICATORS = [
  /\bthus\b/gi, /\btherefore\b/gi, /\bfurthermore\b/gi, /\bmoreover\b/gi,
  /\bnevertheless\b/gi, /\bnonetheless\b/gi, /\bconsequently\b/gi,
  /\baccordingly\b/gi, /\bsubsequently\b/gi, /\bhenceforth\b/gi,
  /\bhereby\b/gi, /\bherein\b/gi, /\bpursuant\b/gi, /\baforementioned\b/gi,
  /\bheretofore\b/gi, /\bhereinafter\b/gi,
  /\bendeavour\b/gi, /\bendeavor\b/gi,
  /\bcommence\b/gi, /\bcommenced\b/gi, /\bcommencing\b/gi,
  /\bterminate\b/gi, /\bterminated\b/gi, /\btermination\b/gi,
];

const CASUAL_INDICATORS = [
  /\bI('m|'ve|'ll|'d)\b/g, /\byou('re|'ve|'ll|'d)\b/g,
  /\bwe('re|'ve|'ll|'d)\b/g, /\bthey('re|'ve|'ll|'d)\b/g,
  /\bthat's\b/g, /\bthere's\b/g, /\bhere's\b/g, /\bwhat's\b/g,
  /\bdon't\b/g, /\bdoesn't\b/g, /\bdidn't\b/g, /\bcan't\b/g, /\bwon't\b/g,
  /\bisn't\b/g, /\baren't\b/g, /\bwasn't\b/g, /\bweren't\b/g,
  /\bhaven't\b/g, /\bhasn't\b/g, /\bhadn't\b/g,
  /\bcouldn't\b/g, /\bshouldn't\b/g, /\bwouldn't\b/g, /\bmustn't\b/g,
  /\bgot\b/gi, /\bstuff\b/gi, /\bthing\b/gi, /\bthings\b/gi,
  /\byeah\b/gi, /\bsure\b/gi, /\bokay\b/gi, /\bok\b/gi,
  /\bnope\b/gi, /\byep\b/gi,
  /\bI think\b/gi, /\bI mean\b/gi, /\byou know\b/gi,
];

/**
 * Detect the register of a text and return the appropriate intensity.
 *
 * @param {string} text — The text to analyze
 * @returns {string} — 'light', 'medium', or 'heavy'
 */
function detectRegister(text) {
  if (!text || typeof text !== 'string') return 'medium';

  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length < 20) return 'medium'; // too short to judge

  let score = 0;

  // Count formal indicators (per 100 words)
  let formalCount = 0;
  for (const regex of FORMAL_INDICATORS) {
    const matches = text.match(regex);
    if (matches) formalCount += matches.length;
  }
  score += (formalCount / words.length) * 100;

  // Count casual indicators (per 100 words)
  let casualCount = 0;
  for (const regex of CASUAL_INDICATORS) {
    const matches = text.match(regex);
    if (matches) casualCount += matches.length;
  }
  score -= (casualCount / words.length) * 100;

  // Average sentence length — longer = more formal
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length > 1) {
    const avgLen = words.length / sentences.length;
    if (avgLen > 25) score += 2;
    else if (avgLen < 12) score -= 2;
  }

  // Presence of citations/references = more formal
  const citations = (text.match(/\b(20[0-9]{2}|et al\.|study|research|analysis|report|survey)\b/gi) || []).length;
  if (citations > 2) score += 1;

  // Map score to intensity
  if (score > 3) return 'light';    // formal text — contractions only
  if (score < -3) return 'heavy';   // casual text — all transformations
  return 'medium';                   // neutral — contractions + safe swaps
}

/**
 * Naturalize with auto-detected register.
 * Detects formality level and applies the appropriate intensity.
 *
 * @param {string} text — Input text
 * @returns {{ text: string, intensity: string }}
 */
function naturalizeAuto(text) {
  const intensity = detectRegister(text);
  const result = naturalize(text, intensity);
  return { text: result, intensity };
}

// ─── Exports ─────────────────────────────────────────────

module.exports = {
  naturalize,
  naturalizeAuto,
  detectRegister,
  applyContractions,
  applyColloquialSwaps,
  applySentenceLooseners,
};
