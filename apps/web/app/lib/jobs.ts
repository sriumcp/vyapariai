export type JobStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";

export interface Job {
  id: string;
  filename: string;
  status: JobStatus;
  createdAt: string;
}

export const jobs: Job[] = [
  {
    id: "job-001",
    filename: "invoice-2024-march.pdf",
    status: "SUCCEEDED",
    createdAt: "2024-03-15T10:30:00Z",
  },
  {
    id: "job-002",
    filename: "shipping-manifest.pdf",
    status: "RUNNING",
    createdAt: "2024-03-16T14:22:00Z",
  },
  {
    id: "job-003",
    filename: "customs-declaration.pdf",
    status: "PENDING",
    createdAt: "2024-03-17T09:00:00Z",
  },
];

export function getJobById(id: string): Job | undefined {
  return jobs.find((job) => job.id === id);
}
