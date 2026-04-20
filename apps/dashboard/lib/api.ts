const apiBaseUrl = process.env.KORI_API_BASE_URL ?? process.env.NEXT_PUBLIC_KORI_API_BASE_URL ?? "http://localhost:3001";

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T;
}

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}
