import type { User } from '$lib/api/client';
import { apiClient } from '$lib/api/client';

class AuthStore {
  user = $state<User | null>(null);
  isAuthenticated = $derived(this.user !== null);
  isAdmin = $derived(this.user?.is_admin ?? false);
  isCoach = $derived(this.user?.is_coach ?? false);
  isValidatedCoach = $derived(this.user?.is_coach && this.user?.coach_validated);
  isEmailVerified = $derived(this.user?.email_verified ?? false);

  async login(email: string, password: string): Promise<void> {
    const response = await apiClient.login({ email, password });
    apiClient.setToken(response.token);
    this.user = response.user;
  }

  async register(
    email: string,
    password: string,
    firstname: string,
    lastname: string,
    isCoach: boolean
  ): Promise<void> {
    const response = await apiClient.register({
      email,
      password,
      firstname,
      lastname,
      is_coach: isCoach,
    });
    apiClient.setToken(response.token);
    this.user = response.user;
  }

  logout(): void {
    apiClient.clearToken();
    this.user = null;
  }

  initialize(): void {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_token');
      const userJson = localStorage.getItem('user');
      if (token && userJson) {
        try {
          this.user = JSON.parse(userJson);
        } catch (e) {
          this.logout();
        }
      }
    }
  }

  async verifyUser(): Promise<User | null> {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        this.user = null;
        return null;
      }

      try {
        const user = await apiClient.getCurrentUser();
        this.user = user;
        this.saveUser();
        return user;
      } catch (e) {
        this.logout();
        return null;
      }
    }
    return null;
  }

  saveUser(): void {
    if (typeof window !== 'undefined' && this.user) {
      localStorage.setItem('user', JSON.stringify(this.user));
    }
  }
}

export const authStore = new AuthStore();
