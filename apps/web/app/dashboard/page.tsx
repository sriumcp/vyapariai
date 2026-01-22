"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Job } from "../lib/jobs";

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [newFilename, setNewFilename] = useState("");
  const [creating, setCreating] = useState(false);

  async function fetchJobs() {
    const res = await fetch("/api/jobs");
    const data = await res.json();
    setJobs(data);
    setLoading(false);
  }

  useEffect(() => {
    fetchJobs();
  }, []);

  async function handleCreateJob(e: React.FormEvent) {
    e.preventDefault();
    if (!newFilename.trim()) return;

    setCreating(true);
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: newFilename.trim() }),
    });

    if (res.ok) {
      setNewFilename("");
      await fetchJobs();
    }
    setCreating(false);
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8 dark:bg-black">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Jobs Dashboard
        </h1>

        <form onSubmit={handleCreateJob} className="mb-6 flex gap-2">
          <input
            type="text"
            value={newFilename}
            onChange={(e) => setNewFilename(e.target.value)}
            placeholder="Enter filename (e.g., document.pdf)"
            className="flex-1 rounded border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-400"
          />
          <button
            type="submit"
            disabled={creating || !newFilename.trim()}
            className="rounded bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {creating ? "Creating..." : "New Job"}
          </button>
        </form>

        {loading ? (
          <p className="text-zinc-600 dark:text-zinc-400">Loading jobs...</p>
        ) : jobs.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">
            No jobs yet. Create one above.
          </p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th className="py-3 pr-4 font-medium text-zinc-600 dark:text-zinc-400">
                  Filename
                </th>
                <th className="py-3 pr-4 font-medium text-zinc-600 dark:text-zinc-400">
                  Status
                </th>
                <th className="py-3 font-medium text-zinc-600 dark:text-zinc-400">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr
                  key={job.id}
                  className="border-b border-zinc-100 dark:border-zinc-800"
                >
                  <td className="py-3 pr-4">
                    <Link
                      href={`/jobs/${job.id}`}
                      className="text-zinc-900 underline hover:text-zinc-600 dark:text-zinc-100 dark:hover:text-zinc-300"
                    >
                      {job.filename}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-zinc-700 dark:text-zinc-300">
                    {job.status}
                  </td>
                  <td className="py-3 text-zinc-700 dark:text-zinc-300">
                    {new Date(job.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
