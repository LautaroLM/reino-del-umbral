import type {
  AuthResponse,
  RegisterRequest,
  LoginRequest,
  CharacterSummary,
  CreateCharacterRequest,
  ApiError,
} from '@ao/shared-types';

const API_BASE = import.meta.env.VITE_API_URL as string;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = (await res.json()) as ApiError;
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// --- Auth ---

export async function register(data: RegisterRequest): Promise<AuthResponse> {
  const result = await request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  sessionStorage.setItem('token', result.token);
  sessionStorage.setItem('account', JSON.stringify(result.account));
  return result;
}

export async function login(data: LoginRequest): Promise<AuthResponse> {
  const result = await request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  sessionStorage.setItem('token', result.token);
  sessionStorage.setItem('account', JSON.stringify(result.account));
  return result;
}

export function logout() {
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('account');
  sessionStorage.removeItem('selectedCharacter');
}

export function getToken(): string | null {
  return sessionStorage.getItem('token');
}

export function getAccount(): { id: number; username: string } | null {
  const raw = sessionStorage.getItem('account');
  return raw ? JSON.parse(raw) : null;
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

// --- Characters ---

export async function listCharacters(): Promise<CharacterSummary[]> {
  return request<CharacterSummary[]>('/characters');
}

export async function createCharacter(data: CreateCharacterRequest): Promise<CharacterSummary> {
  return request<CharacterSummary>('/characters', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteCharacter(id: number): Promise<void> {
  await request(`/characters/${id}`, { method: 'DELETE' });
}

export function selectCharacter(character: CharacterSummary) {
  sessionStorage.setItem('selectedCharacter', JSON.stringify(character));
}

export function getSelectedCharacter(): CharacterSummary | null {
  const raw = sessionStorage.getItem('selectedCharacter');
  return raw ? JSON.parse(raw) : null;
}
