/** Tiny JSON API client with consistent error handling. */

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const isForm = options.body instanceof FormData;
  const res = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: isForm ? options.headers : { "Content-Type": "application/json", ...(options.headers ?? {}) },
  });

  let data: { error?: string } & Record<string, unknown> | null = null;
  try {
    data = await res.json();
  } catch {
    /* empty body is fine (e.g. binary downloads handled elsewhere) */
  }

  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}
