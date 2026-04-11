import { dev } from '$app/environment';

const API_BASE_URL = dev ? 'http://127.0.0.1:3000' : 'https://api.portfolio-online.ovh';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstname: string;
  lastname: string;
  is_coach: boolean;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface User {
  id: string;
  email: string;
  firstname: string;
  lastname: string;
  is_coach: boolean;
  coach_validated: boolean;
  is_admin: boolean;
}

export interface CoachResponse {
  id: string;
  email: string;
  firstname: string;
  lastname: string;
  is_coach: boolean;
  coach_validated: boolean;
  created_at: string;
}

class ApiClient {
  private baseUrl: string = API_BASE_URL;

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const token = this.getToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...(options.headers as Record<string, string>),
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  private getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('auth_token');
    }
    return null;
  }

  setToken(token: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
    }
  }

  clearToken(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
    }
  }

  async login(credentials: LoginRequest): Promise<AuthResponse> {
    return this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  }

  async register(data: RegisterRequest): Promise<AuthResponse> {
    return this.request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getPendingCoaches(): Promise<CoachResponse[]> {
    return this.request<CoachResponse[]>('/api/admin/coaches/pending');
  }

  async validateCoach(id: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/api/admin/coaches/${id}/validate`, {
      method: 'PUT',
    });
  }

  async rejectCoach(id: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/api/admin/coaches/${id}/reject`, {
      method: 'PUT',
    });
  }

  async getCurrentUser(): Promise<User> {
    return this.request<User>('/api/user');
  }
}

export const apiClient = new ApiClient();
