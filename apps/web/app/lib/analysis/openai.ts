import { AnalysisResult, RiskGapsModelOutput } from "./types";

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
    // Responses API returns output array with multiple items (reasoning, message)
    // We need to find the "message" type item and get text from its content
    let outputText: string | undefined;

    if (Array.isArray(data.output)) {
      // Find the message output (skip reasoning output)
      const messageOutput = data.output.find(
        (item: { type: string }) => item.type === "message"
      );
      if (messageOutput?.content && Array.isArray(messageOutput.content)) {
        // Find the output_text content item
        const textContent = messageOutput.content.find(
          (c: { type: string }) => c.type === "output_text" || c.type === "text"
        );
        outputText = textContent?.text;
      }
    }

    // Fallback: Chat Completions style
    if (!outputText) {
      outputText = data.choices?.[0]?.message?.content;
    }

    if (!outputText) {
      console.error(
        "Failed to extract text from OpenAI response. Output structure:",
        JSON.stringify(data.output, null, 2).slice(0, 500)
      );
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

// =============================================================================
// Risk Gaps Analysis
// =============================================================================

const RISK_GAPS_SYSTEM_PROMPT = `You are an insurance policy analyst specializing in trade and export insurance for MSMEs (Micro, Small, and Medium Enterprises).

Analyze the provided insurance policy text and identify coverage gaps, concerning exclusions, limit concerns, and other risk factors that an MSME exporter should be aware of.

STRICT RULES:
- Only identify risks supported by EXPLICIT policy language in the provided text.
- Do NOT infer missing coverage from silence. Only flag gaps when the policy explicitly limits, excludes, or conditions coverage.
- Each risk gap MUST include 1-3 short evidence quotes (<=200 chars each) copied verbatim from the text.
- If no significant risks are found, return an empty riskGaps array.
- If the document excerpt is incomplete, prefer INFO-level notes explaining uncertainty rather than guessing.
- Focus on risks relevant to MSME exporters: cargo/transit, payment/credit, liability, force majeure.

SEVERITY LEVELS (based on potential financial impact):
- HIGH: Could result in major uninsured loss (e.g., explicit transit exclusion)
- MEDIUM: Moderate financial exposure (e.g., low coverage limits stated)
- LOW: Minor gap or improvement opportunity
- INFO: Advisory note, not a direct risk

AREAS TO CHECK (only flag if explicitly addressed in text):
- Geographic coverage limitations or excluded regions
- Transit/shipping mode exclusions
- Cargo type exclusions (hazardous, perishable, high-value)
- Force majeure and political risk exclusions
- Natural disaster and war/strikes exclusions
- Deductible amounts and waiting periods
- Coverage limits stated in policy
- Claims process requirements and deadlines

FORMAT DISCIPLINE:
- Do not reference page numbers.
- Do not cite anything outside the provided text.
- Evidence quotes must be <=200 characters, copied verbatim.`;

const RISK_GAPS_SCHEMA = {
  type: "object",
  properties: {
    riskGaps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: [
              "COVERAGE_GAP",
              "EXCLUSION",
              "LIMIT_CONCERN",
              "AMBIGUITY",
              "COMPLIANCE",
              "OTHER",
            ],
          },
          severity: { type: "string", enum: ["HIGH", "MEDIUM", "LOW", "INFO"] },
          title: { type: "string" },
          description: { type: "string" },
          evidence: {
            type: "array",
            items: { type: "string" },
          },
          recommendation: { type: "string" },
        },
        required: ["category", "severity", "title", "description", "evidence", "recommendation"],
        additionalProperties: false,
      },
    },
    summary: { type: "string" },
    notes: { type: "array", items: { type: "string" } },
  },
  required: ["riskGaps", "summary", "notes"],
  additionalProperties: false,
};

/**
 * Runs risk gaps analysis using OpenAI Responses API with Structured Outputs.
 *
 * @param extractedText - The text extracted from the document
 * @param analysisContext - The document analysis result for context
 * @returns Risk gaps model output (before server-side enrichment)
 * @throws Error if API key is missing or API call fails
 */
export async function runRiskGapsAnalysis(
  extractedText: string,
  analysisContext: AnalysisResult
): Promise<RiskGapsModelOutput> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  // Truncate text if too long
  const truncatedText = truncateText(extractedText, MAX_TEXT_LENGTH);

  // Build summary bullets for context
  const summaryBullets = analysisContext.summaryBullets
    .map((b) => `- ${b}`)
    .join("\n");

  const userPrompt = `Analyze this insurance policy for coverage gaps and risks relevant to MSME exporters.

Document Type: ${analysisContext.docType}
Summary from initial analysis:
${summaryBullets || "(No summary available)"}

NOTE: This is an excerpt. If the text appears truncated, note any analysis limitations.

Policy Text:
${truncatedText}`;

  const requestBody = {
    model,
    store: false, // Do not store responses
    input: [
      {
        role: "system",
        content: RISK_GAPS_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "risk_gaps_analysis",
        strict: true,
        schema: RISK_GAPS_SCHEMA,
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
      const errorBody = await response.text();
      console.error(
        `OpenAI API error: ${response.status} ${response.statusText}`
      );
      console.error(`OpenAI error details: ${errorBody}`);
      throw new Error(`OpenAI API request failed: ${response.status}`);
    }

    const data = await response.json();

    // Extract the structured output from the response
    let outputText: string | undefined;

    if (Array.isArray(data.output)) {
      const messageOutput = data.output.find(
        (item: { type: string }) => item.type === "message"
      );
      if (messageOutput?.content && Array.isArray(messageOutput.content)) {
        const textContent = messageOutput.content.find(
          (c: { type: string }) => c.type === "output_text" || c.type === "text"
        );
        outputText = textContent?.text;
      }
    }

    // Fallback: Chat Completions style
    if (!outputText) {
      outputText = data.choices?.[0]?.message?.content;
    }

    if (!outputText) {
      console.error(
        "Failed to extract text from OpenAI response. Output structure:",
        JSON.stringify(data.output, null, 2).slice(0, 500)
      );
      throw new Error("Failed to parse OpenAI response");
    }

    // Parse and validate the result
    let result: RiskGapsModelOutput;
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
