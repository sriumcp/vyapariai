const { test, describe } = require("node:test");
const assert = require("node:assert");
const { computeTextMetrics, countNonAscii, countWhitespace } = require("./text-metrics");

describe("computeTextMetrics", () => {
  test("empty text returns charCount=0, isEmpty=true, qualityBand=LOW", () => {
    const metrics = computeTextMetrics("");

    assert.strictEqual(metrics.charCount, 0);
    assert.strictEqual(metrics.wordCount, 0);
    assert.strictEqual(metrics.lineCount, 1); // empty string splits to [""]
    assert.strictEqual(metrics.nonAsciiRatio, 0);
    assert.strictEqual(metrics.whitespaceRatio, 0);
    assert.strictEqual(metrics.isEmpty, true);
    assert.strictEqual(metrics.isLikelyScanned, false);
    assert.strictEqual(metrics.qualityBand, "LOW");
  });

  test("normal ASCII paragraph returns isEmpty=false, qualityBand not LOW", () => {
    const normalText = `This is a normal paragraph of text that contains multiple sentences.
It has proper formatting and uses standard ASCII characters throughout.
The content is readable and represents typical extracted text from a PDF document.
We expect this to be classified as reasonable quality content by our heuristics.
Additional sentences help ensure we have enough words to qualify for higher quality.`;

    const metrics = computeTextMetrics(normalText);

    assert.strictEqual(metrics.isEmpty, false);
    assert.ok(metrics.charCount > 0, "charCount should be positive");
    assert.ok(metrics.wordCount > 0, "wordCount should be positive");
    assert.ok(metrics.lineCount >= 5, "lineCount should be at least 5");
    assert.ok(metrics.nonAsciiRatio < 0.01, "nonAsciiRatio should be very low");
    assert.ok(
      metrics.qualityBand === "MEDIUM" || metrics.qualityBand === "HIGH",
      `qualityBand should be MEDIUM or HIGH, got ${metrics.qualityBand}`
    );
  });

  test("garbage-like text with high non-ASCII returns qualityBand=LOW", () => {
    // Simulate OCR garbage: lots of replacement characters
    const garbageText = "�".repeat(100) + "some text" + "�".repeat(100);

    const metrics = computeTextMetrics(garbageText);

    assert.strictEqual(metrics.isEmpty, false);
    assert.ok(metrics.nonAsciiRatio > 0.2, "nonAsciiRatio should be high");
    assert.strictEqual(metrics.qualityBand, "LOW");
  });

  test("text with very high non-ASCII ratio is flagged as likely scanned", () => {
    // More than 30% non-ASCII should trigger isLikelyScanned
    const mostlyNonAscii = "café résumé naïve " + "日本語".repeat(50);

    const metrics = computeTextMetrics(mostlyNonAscii);

    assert.ok(metrics.nonAsciiRatio > 0.3, "nonAsciiRatio should exceed 0.3");
    assert.strictEqual(metrics.isLikelyScanned, true);
    assert.strictEqual(metrics.qualityBand, "LOW");
  });

  test("substantial high-quality text returns qualityBand=HIGH", () => {
    // Generate text with 50+ words
    const words = [];
    for (let i = 0; i < 60; i++) {
      words.push("word" + i);
    }
    const highQualityText = words.join(" ");

    const metrics = computeTextMetrics(highQualityText);

    assert.strictEqual(metrics.isEmpty, false);
    assert.ok(metrics.wordCount >= 50, "should have at least 50 words");
    assert.ok(metrics.nonAsciiRatio < 0.05, "nonAsciiRatio should be very low");
    assert.strictEqual(metrics.qualityBand, "HIGH");
  });

  test("text with mostly whitespace returns qualityBand=LOW", () => {
    // More than 80% whitespace
    const sparseText = "a" + " ".repeat(100) + "b";

    const metrics = computeTextMetrics(sparseText);

    assert.ok(metrics.whitespaceRatio > 0.8, "whitespaceRatio should exceed 0.8");
    assert.strictEqual(metrics.qualityBand, "LOW");
  });
});

describe("countNonAscii", () => {
  test("returns 0 for pure ASCII string", () => {
    assert.strictEqual(countNonAscii("Hello, World! 123"), 0);
  });

  test("counts non-ASCII characters correctly", () => {
    assert.strictEqual(countNonAscii("café"), 1); // é is non-ASCII
    assert.strictEqual(countNonAscii("日本語"), 3); // 3 Japanese characters
    assert.strictEqual(countNonAscii("hello日本語world"), 3);
  });
});

describe("countWhitespace", () => {
  test("returns 0 for string without whitespace", () => {
    assert.strictEqual(countWhitespace("HelloWorld"), 0);
  });

  test("counts spaces, tabs, and newlines", () => {
    assert.strictEqual(countWhitespace("a b"), 1);
    assert.strictEqual(countWhitespace("a\tb"), 1);
    assert.strictEqual(countWhitespace("a\nb"), 1);
    assert.strictEqual(countWhitespace("a \t\n b"), 4);
  });
});
