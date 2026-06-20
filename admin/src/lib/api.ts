const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1';

function getToken(): string | null {
  return localStorage.getItem('token');
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const url = `${BASE_URL}${path}`;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers ?? {}),
  };

  const start = performance.now();
  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (networkErr) {
    console.error(`[API] Network error: ${options.method ?? 'GET'} ${url}`, networkErr);
    throw new Error('No se pudo conectar al servidor. Verifica tu conexión o que el backend esté activo.');
  }
  const duration = Math.round(performance.now() - start);

  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/admin/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const contentType = res.headers.get('content-type') ?? '';
    let bodyText = '';
    try { bodyText = await res.text(); } catch { /* ignore */ }

    console.error(
      `[API] Error ${res.status} ${options.method ?? 'GET'} ${url} (${duration}ms)\n` +
      `  Content-Type: ${contentType}\n` +
      `  Body: ${bodyText.slice(0, 500)}`
    );

    let message = `HTTP ${res.status}`;
    if (res.status === 504) message = 'El servidor no respondió a tiempo (Gateway Timeout). Revisa que el backend esté corriendo.';
    else if (res.status === 502) message = 'Error de gateway — el backend podría estar reiniciando.';
    else if (res.status === 503) message = 'Servicio no disponible — el backend podría estar saturado.';
    else if (contentType.includes('application/json')) {
      try { message = JSON.parse(bodyText).error ?? message; } catch { /* ignore */ }
    }

    throw new Error(message);
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
