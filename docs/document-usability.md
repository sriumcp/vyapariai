# What Makes a Document Usable

This document defines **when and why an uploaded document is considered usable**
for downstream processing in vyapari.ai.

It is intentionally **flow-agnostic** and **document-type-agnostic**.
The rules here apply equally to policies, invoices, shipment documents,
or any other PDF uploaded to the system.

This document is authoritative for:
- system behavior
- UI guidance
- future OCR and AI routing
- review and audit reasoning

---

## Core Principle

> **Usability is a property of a document, not of a user flow.**

A document is evaluated independently based on:
- whether text exists
- whether the text is meaningful
- whether downstream systems can rely on it

No assumptions are made about what document comes first
or how documents are combined.

---

## Deterministic Inputs

Document usability is determined solely from **deterministic signals**
computed during ingestion.

### Extracted Text
- Text is extracted using embedded-text extraction only
- OCR is not performed at this stage

Artifact:
- `.data/uploads/<jobId>/extracted_text.txt`

---

### Text Quality Metrics

The worker computes the following metrics:

- `charCount`
- `wordCount`
- `lineCount`
- `nonAsciiRatio`
- `whitespaceRatio`
- `isEmpty`
- `isLikelyScanned`
- `qualityBand` (`LOW | MEDIUM | HIGH`)

These metrics are deterministic and reproducible.

---

## Document Readiness Classification

Based on extracted text and quality metrics, each document is assigned
a **derived readiness classification**.

### `READY`
The document is usable for downstream analysis.

Typical characteristics:
- Extracted text is non-empty
- `qualityBand` is `MEDIUM` or `HIGH`
- Text is not likely scanned

### `DEGRADED`
The document contains text, but quality issues are present.

Typical characteristics:
- `qualityBand === LOW`, or
- `isLikelyScanned === true`

Degraded documents may still be usable,
but downstream systems should proceed with caution.

### `UNUSABLE`
The document cannot be used for downstream analysis.

Typical characteristics:
- `isEmpty === true`
- No meaningful text extracted

---

## Degradation Reasons

When a document is classified as `DEGRADED` or `UNUSABLE`,
the system records explicit reasons.

Examples:
- `EMPTY_TEXT`
- `LOW_QUALITY_BAND`
- `LIKELY_SCANNED`

These reasons are derived directly from metrics
and are intended to be user-visible and auditable.

---

## System Guarantees

The system guarantees that:

- All usability decisions are deterministic
- No AI or probabilistic models are used
- The same document will always receive the same classification
- Usability is evaluated per document, not per workflow

---

## Downstream Policy (Non-Executable)

This document defines intent, not execution.

Downstream systems **must** respect the following policy:

- `UNUSABLE` documents must not be analyzed
- `DEGRADED` documents may be analyzed only with warnings
- `READY` documents may be analyzed normally

Actual enforcement is implemented elsewhere in the system.

---

## User Guidance Implications

Document readiness drives exporter guidance:

- READY → “This document is suitable for analysis”
- DEGRADED → “This document may need OCR or a cleaner upload”
- UNUSABLE → “Please re-upload a text-based PDF or scanned copy”

No guidance should contradict the readiness classification.

---

## Explicit Non-Goals

This document does NOT define:

- Exporter workflows
- Required document sets (policy vs invoice vs shipment)
- OCR implementation
- AI analysis logic
- Cross-document validation

Those concerns are layered on top of document usability.

---

## Why This Exists

This document exists to prevent:
- ambiguous downstream behavior
- premature AI usage
- hidden quality failures
- implicit assumptions about user flows

It allows the system to evolve confidently
while remaining explainable to exporters, insurers, and auditors.

---

