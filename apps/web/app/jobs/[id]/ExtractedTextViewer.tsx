"use client";

import { useEffect, useState } from "react";

const TRUNCATION_LIMIT = 20000;

interface ExtractedTextViewerProps {
  jobId: string;
}

export default function ExtractedTextViewer({ jobId }: ExtractedTextViewerProps) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    async function fetchText() {
      try {
        const res = await fetch(`/api/jobs/${jobId}/text`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Unable to load extracted text");
          return;
        }
        const content = await res.text();
        setText(content);
      } catch {
        setError("Unable to load extracted text");
      } finally {
        setLoading(false);
      }
    }
    fetchText();
  }, [jobId]);

  if (loading) {
    return (
      <p className="text-zinc-600 dark:text-zinc-400">
        Loading extracted text...
      </p>
    );
  }

  if (error) {
    return (
      <p className="text-zinc-600 dark:text-zinc-400">{error}</p>
    );
  }

  if (text === null || text.length === 0) {
    return (
      <p className="text-zinc-500 dark:text-zinc-400">(No text content)</p>
    );
  }

  const needsTruncation = text.length > TRUNCATION_LIMIT;
  const displayText = expanded || !needsTruncation
    ? text
    : text.slice(0, TRUNCATION_LIMIT);

  return (
    <div>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded border border-zinc-200 bg-zinc-100 p-4 font-mono text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
        {displayText}
        {!expanded && needsTruncation && "..."}
      </pre>
      {needsTruncation && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-sm text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
