/**
 * Text quality metrics computation.
 * Pure functions that analyze extracted text content.
 */

/**
 * Compute text quality metrics from extracted text content.
 * @param {string} text - The extracted text content
 * @returns {Object} Text extraction metrics
 */
function computeTextMetrics(text) {
  const charCount = text.length;
  const isEmpty = charCount === 0;

  // Word count: split on whitespace, filter empty
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;

  // Line count: split on newlines
  const lines = text.split(/\r?\n/);
  const lineCount = lines.length;

  // Non-ASCII ratio: characters outside 0x00-0x7F range
  const nonAsciiCount = countNonAscii(text);
  const nonAsciiRatio = charCount > 0 ? nonAsciiCount / charCount : 0;

  // Whitespace ratio: spaces, tabs, newlines, etc.
  const whitespaceCount = countWhitespace(text);
  const whitespaceRatio = charCount > 0 ? whitespaceCount / charCount : 0;

  // Rule-based heuristics
  const isLikelyScanned = computeIsLikelyScanned({
    charCount,
    wordCount,
    nonAsciiRatio,
  });

  const qualityBand = computeQualityBand({
    wordCount,
    nonAsciiRatio,
    whitespaceRatio,
    isEmpty,
    isLikelyScanned,
  });

  return {
    charCount,
    wordCount,
    lineCount,
    nonAsciiRatio: roundTo4Decimals(nonAsciiRatio),
    whitespaceRatio: roundTo4Decimals(whitespaceRatio),
    isEmpty,
    isLikelyScanned,
    qualityBand,
  };
}

/**
 * Count non-ASCII characters (outside 0x00-0x7F range).
 * @param {string} text
 * @returns {number}
 */
function countNonAscii(text) {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 127) {
      count++;
    }
  }
  return count;
}

/**
 * Count whitespace characters.
 * @param {string} text
 * @returns {number}
 */
function countWhitespace(text) {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // Space, tab, newline, carriage return, form feed, vertical tab
    if (code === 32 || code === 9 || code === 10 || code === 13 || code === 12 || code === 11) {
      count++;
    }
  }
  return count;
}

/**
 * Round a number to 4 decimal places.
 * @param {number} n
 * @returns {number}
 */
function roundTo4Decimals(n) {
  return Math.round(n * 10000) / 10000;
}

/**
 * Determine if text is likely from a scanned document (image-based PDF).
 * Conservative: only returns true with strong evidence.
 *
 * Heuristics:
 * - Very high non-ASCII ratio (>0.3) suggests OCR artifacts or binary garbage
 * - Very few words relative to character count suggests garbled extraction
 * - Empty text is NOT considered "scanned" — it's just empty
 *
 * @param {Object} params
 * @returns {boolean}
 */
function computeIsLikelyScanned({ charCount, wordCount, nonAsciiRatio }) {
  // Empty text: not enough evidence to call it scanned
  if (charCount === 0) {
    return false;
  }

  // High non-ASCII ratio: likely OCR garbage or binary content
  if (nonAsciiRatio > 0.3) {
    return true;
  }

  // Very few recognizable words relative to content (garbled extraction)
  // If we have significant content (>100 chars) but almost no words, suspicious
  const charsPerWord = wordCount > 0 ? charCount / wordCount : charCount;
  if (charCount > 100 && charsPerWord > 50) {
    return true;
  }

  return false;
}

/**
 * Compute quality band based on text characteristics.
 *
 * Rules:
 * - LOW: empty, likely scanned, very high non-ASCII, or very few words
 * - HIGH: substantial text with normal characteristics
 * - MEDIUM: everything else
 *
 * @param {Object} params
 * @returns {"LOW" | "MEDIUM" | "HIGH"}
 */
function computeQualityBand({
  wordCount,
  nonAsciiRatio,
  whitespaceRatio,
  isEmpty,
  isLikelyScanned,
}) {
  // Empty text is always LOW quality
  if (isEmpty) {
    return "LOW";
  }

  // Likely scanned documents are LOW quality
  if (isLikelyScanned) {
    return "LOW";
  }

  // High non-ASCII ratio (but below scanned threshold) is LOW
  if (nonAsciiRatio > 0.2) {
    return "LOW";
  }

  // Very high whitespace ratio (>0.8) suggests sparse/garbage content
  if (whitespaceRatio > 0.8) {
    return "LOW";
  }

  // HIGH quality: substantial readable text
  // At least 50 words and reasonable non-ASCII ratio
  if (wordCount >= 50 && nonAsciiRatio < 0.05) {
    return "HIGH";
  }

  // MEDIUM: some content but not meeting HIGH criteria
  return "MEDIUM";
}

module.exports = {
  computeTextMetrics,
  // Exported for testing
  countNonAscii,
  countWhitespace,
  computeIsLikelyScanned,
  computeQualityBand,
};
