import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Token getter function that will be set by Auth0Provider
let getAccessToken: ((options?: any) => Promise<string>) | null = null;

export function setAccessTokenGetter(getter: (options?: any) => Promise<string>) {
  getAccessToken = getter;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (getAccessToken) {
    try {
      const audience = import.meta.env.VITE_AUTH0_AUDIENCE;
      const token = await getAccessToken({
        authorizationParams: (audience && audience !== "undefined" && audience !== "null") ? { audience } : {}
      });
      return { "Authorization": `Bearer ${token}` };
    } catch (error: any) {
      console.error("[Auth Error] Failed to get access token:", error);
      // If audience is the issue, try getting a token without it as a fallback
      if (error.message?.includes("Service not found") || error.error === "access_denied") {
        try {
          const token = await getAccessToken();
          return { "Authorization": `Bearer ${token}` };
        } catch (fallbackError) {
          console.error("[Auth Error] Fallback also failed:", fallbackError);
        }
      }
      return {};
    }
  }
  return {};
}

// Exponential backoff retry logic for rate-limited API requests
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const is429Error = error.message?.includes('429') || 
                         error.status === 429 ||
                         error.message?.includes('Rate limit');
      
      if (!is429Error || attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`Rate limited (429), retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: { retry?: boolean }
): Promise<Response> {
  const makeRequest = async () => {
    const authHeaders = await getAuthHeaders();
    const headers = {
      ...authHeaders,
      ...(data ? { "Content-Type": "application/json" } : {}),
    };

    const res = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });

    // Check for rate limit before throwing
    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After');
      const text = await res.text();
      const error: any = new Error(`429: ${text || 'Rate limit exceeded'}`);
      error.status = 429;
      error.retryAfter = retryAfter ? parseInt(retryAfter) * 1000 : undefined;
      throw error;
    }

    await throwIfResNotOk(res);
    return res;
  };

  // Apply retry logic if enabled (default for most requests)
  if (options?.retry !== false) {
    return retryWithBackoff(makeRequest);
  }
  
  return makeRequest();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const authHeaders = await getAuthHeaders();
    
    const res = await fetch(queryKey.join("/") as string, {
      headers: authHeaders,
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5000, // 5 seconds stale time for general data
      gcTime: 1000 * 60 * 30, // 30 minutes garbage collection
      retry: (failureCount, error: any) => {
        // Retry on network errors or 5xx server errors, but not 4xx
        if (error?.status >= 400 && error?.status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
