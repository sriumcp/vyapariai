import { AnalysisResult } from "./types";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";

// Maximum characters to send to OpenAI (roughly ~30k tokens with buffer)
const MAX_TEXT_LENGTH = 100000;

// Request timeout in milliseconds (3 minutes for potentially long documents)
const REQUEST_TIMEOUT_MS = 180000;

const SYSTEM_PROMPT = `You are a document analysis assistant. Analyze the provided document text and extract structured information.

STRICT RULES:
- Do NOT invent facts. Only extract information present in the text.
- Each keyField MUST include an "evidence" field with a brief quote copied from the text.
- If a value cannot be determined from the text, omit that keyField entirely.
- Keep evidence quotes short (1-2 sentences max).
- summaryBullets should be concise (max 6 bullets).
- Set confidence based on text quality and how much information could be extracted.`;

const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    docType: {
      type: "string",
      enum: [
        "INVOICE",
        "INSURANCE_POLICY",
        "BILL_OF_LADING",
        "PACKING_LIST",
        "UNKNOWN",
      ],
    },
    summaryBullets: {
      type: "array",
      items: { type: "string" },
    },
    keyFields: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          value: { type: "string" },
          evidence: { type: "string" },
        },
        required: ["label", "value", "evidence"],
        additionalProperties: false,
      },
    },
    confidence: {
      type: "string",
      enum: ["LOW", "MEDIUM", "HIGH"],
    },
    notes: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["docType", "summaryBullets", "keyFields", "confidence", "notes"],
  additionalProperties: false,
};

/**
 * Truncates text to a maximum length, adding a note if truncated.
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return (
    text.slice(0, maxLength) +
    "\n\n[TEXT TRUNCATED - document exceeds maximum length]"
  );
}

/**
 * Runs document analysis using OpenAI Responses API with Structured Outputs.
 *
 * @param extractedText - The text extracted from the document
 * @returns Analysis result matching the AnalysisResult schema
 * @throws Error if API key is missing or API call fails
 */
export async function runAnalysis(
  extractedText: string
): Promise<AnalysisResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  // Truncate text if too long
  const truncatedText = truncateText(extractedText, MAX_TEXT_LENGTH);

  const requestBody = {
    model,
    store: false, // Do not store responses
    input: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: `Analyze this document:\n\n${truncatedText}`,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "document_analysis",
        strict: true,
        schema: ANALYSIS_SCHEMA,
      },
    },
  };

  // Set up timeout with AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Log error details server-side only (not the full response content)
      console.error(
        `OpenAI API error: ${response.status} ${response.statusText}`
      );
      throw new Error(`OpenAI API request failed: ${response.status}`);
    }

    const data = await response.json();

    // Extract the structured output from the response
    // Responses API returns output in a different structure
    const outputText = data.output?.[0]?.content?.[0]?.text;
    if (!outputText) {
      console.error("Unexpected OpenAI response structure");
      throw new Error("Failed to parse OpenAI response");
    }

    // Parse and validate the result
    let result: AnalysisResult;
    try {
      result = JSON.parse(outputText);
    } catch {
      console.error("Failed to parse OpenAI response as JSON");
      throw new Error("Invalid JSON in OpenAI response");
    }

    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}
