export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8080/api/v1";

export type Role = "user" | "admin";

export interface User {
  id: number;
  username: string;
  role: Role;
}

export interface AdminUser extends User {
  submission_count: number;
  accepted_count: number;
  created_at: string;
}

export interface Tag {
  id: number;
  name: string;
}

export interface AdminTag extends Tag {
  problem_count: number;
  created_at: string;
}

export interface PublicTag extends Tag {
  problem_count: number;
}

export interface DashboardStats {
  user_count: number;
  problem_count: number;
  published_problem_count: number;
  submission_count: number;
  accepted_submission_count: number;
  pending_submission_count: number;
  judging_submission_count: number;
  judge_queue_length: number;
  pass_rate: number;
  generated_at: string;
}

export interface TestCase {
  id: number;
  input: string;
  expected_output: string;
  is_sample: boolean;
  sort_order: number;
}

export interface Problem {
  id: number;
  title: string;
  slug: string;
  description?: string;
  input_description?: string;
  output_description?: string;
  difficulty: string;
  time_limit_ms: number;
  memory_limit_mb: number;
  hint?: string;
  is_published: boolean;
  submit_count: number;
  accept_count: number;
  pass_rate: number;
  tags: Tag[];
  samples?: TestCase[];
  attempted: boolean;
  accepted: boolean;
}

export interface ContestProblem {
  id: number;
  problem_id: number;
  sort_order: number;
  score: number;
  problem: {
    id: number;
    title: string;
    slug: string;
  };
}

export interface Contest {
  id: number;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  status: "upcoming" | "running" | "ended";
  is_public: boolean;
  problem_count: number;
  participant_count: number;
  joined: boolean;
  problems?: ContestProblem[];
  created_at: string;
}

export interface ContestStandingProblem {
  problem_id: number;
  attempts: number;
  accepted: boolean;
  accepted_at?: string;
  penalty_seconds: number;
  best_submission_id?: number;
  last_submission_id?: number;
  last_submission_status?: string;
}

export interface ContestStandingRow {
  rank: number;
  user: User;
  solved: number;
  total_penalty_seconds: number;
  problems: ContestStandingProblem[];
}

export interface SubmissionResult {
  id: number;
  test_case_id: number;
  status: string;
  time_used_ms: number;
  memory_used_kb: number;
  output?: string;
  expected?: string;
  error_message?: string;
  is_sample: boolean;
  sort_order: number;
}

export interface Submission {
  id: number;
  user: User;
  problem: {
    id: number;
    title: string;
    slug: string;
  };
  contest?: {
    id: number;
    title: string;
  };
  language: string;
  code?: string;
  can_view_code: boolean;
  status: string;
  time_used_ms: number;
  memory_used_kb: number;
  error_message?: string;
  results?: SubmissionResult[];
  created_at: string;
}

export interface ListResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = localStorage.getItem("yoj_token");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "请求失败");
  }
  return data as T;
}

export function buildQuery(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      query.set(key, String(value));
    }
  });
  const value = query.toString();
  return value ? `?${value}` : "";
}
