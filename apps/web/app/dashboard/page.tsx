import Link from "next/link";
import { jobs } from "../lib/jobs";

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-zinc-50 p-8 dark:bg-black">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Jobs Dashboard
        </h1>

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
      </div>
    </div>
  );
}
