import Link from "next/link";
import { getJobById } from "../../lib/jobs";

interface JobPageProps {
  params: Promise<{ id: string }>;
}

export default async function JobPage({ params }: JobPageProps) {
  const { id } = await params;
  const job = getJobById(id);

  if (!job) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8 dark:bg-black">
        <div className="mx-auto max-w-4xl">
          <h1 className="mb-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Job not found
          </h1>
          <Link
            href="/dashboard"
            className="text-zinc-900 underline hover:text-zinc-600 dark:text-zinc-100 dark:hover:text-zinc-300"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8 dark:bg-black">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/dashboard"
          className="mb-6 inline-block text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          &larr; Back to Dashboard
        </Link>

        <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Job Details
        </h1>

        <div className="mb-8 space-y-2">
          <p className="text-zinc-700 dark:text-zinc-300">
            <span className="font-medium">Filename:</span> {job.filename}
          </p>
          <p className="text-zinc-700 dark:text-zinc-300">
            <span className="font-medium">Status:</span> {job.status}
          </p>
          <p className="text-zinc-700 dark:text-zinc-300">
            <span className="font-medium">Created:</span>{" "}
            {new Date(job.createdAt).toLocaleString()}
          </p>
        </div>

        <h2 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Artifacts
        </h2>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded border border-zinc-200 p-4 dark:border-zinc-700">
            <h3 className="mb-2 font-medium text-zinc-900 dark:text-zinc-100">
              Summary
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Document summary will appear here once processing is complete.
            </p>
          </div>

          <div className="rounded border border-zinc-200 p-4 dark:border-zinc-700">
            <h3 className="mb-2 font-medium text-zinc-900 dark:text-zinc-100">
              Risk Gaps
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Identified risks and compliance gaps will appear here.
            </p>
          </div>

          <div className="rounded border border-zinc-200 p-4 dark:border-zinc-700">
            <h3 className="mb-2 font-medium text-zinc-900 dark:text-zinc-100">
              Exporter Checklist
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Recommended action items for exporters will appear here.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
