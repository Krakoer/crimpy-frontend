import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';

const API_BASE_URL =
	env.PUBLIC_API_URL || (dev ? 'http://127.0.0.1:3000' : 'https://api.crimpy.app');

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
	email_verified: boolean;
}

export interface CoachResponse {
	id: string;
	email: string;
	firstname: string;
	lastname: string;
	is_coach: boolean;
	coach_validated: boolean;
	email_verified: boolean;
	created_at: string;
}

export interface ResendVerificationRequest {
	email: string;
}

export interface EnrollmentTokenResponse {
	token: string;
	expires_at: string;
	link: string;
}

export interface EnrollmentTokenInfo {
	coach_id: string;
	coach_firstname: string;
	coach_lastname: string;
	coach_email: string;
	expires_at: string;
}

export interface SessionResponse {
	ID: string;
	UserID: string;
	Name: string;
	Date: string;
	Duration: number;
	Notes: string;
	SessionType: number;
	IsAssessment: boolean;
	DeletedAt: string | null;
}

export interface EnrolledUser {
	enrollment_id: string;
	user_id: string;
	user_firstname: string;
	user_lastname: string;
	user_email: string;
	enrolled_at: string;
}

export interface UserEnrollment {
	enrollment_id: string;
	coach_id: string;
	coach_firstname: string;
	coach_lastname: string;
	coach_email: string;
	enrolled_at: string;
}

class ApiClient {
	private baseUrl: string = API_BASE_URL;

	private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
		const url = `${this.baseUrl}${endpoint}`;
		const token = this.getToken();

		const headers: Record<string, string> = {
			'Content-Type': 'application/json'
		};

		if (token) {
			headers['Authorization'] = `Bearer ${token}`;
		}

		const response = await fetch(url, {
			...options,
			headers: {
				...headers,
				...(options.headers as Record<string, string>)
			}
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
			body: JSON.stringify(credentials)
		});
	}

	async register(data: RegisterRequest): Promise<AuthResponse> {
		return this.request<AuthResponse>('/auth/register', {
			method: 'POST',
			body: JSON.stringify(data)
		});
	}

	async getPendingCoaches(): Promise<CoachResponse[]> {
		return this.request<CoachResponse[]>('/api/admin/coaches/pending');
	}

	async validateCoach(id: string): Promise<{ message: string }> {
		return this.request<{ message: string }>(`/api/admin/coaches/${id}/validate`, {
			method: 'PUT'
		});
	}

	async rejectCoach(id: string): Promise<{ message: string }> {
		return this.request<{ message: string }>(`/api/admin/coaches/${id}/reject`, {
			method: 'PUT'
		});
	}

	async getCurrentUser(): Promise<User> {
		return this.request<User>('/api/user');
	}

	async verifyEmail(token: string): Promise<{ message: string; is_coach: boolean }> {
		return this.request<{ message: string; is_coach: boolean }>('/auth/verify', {
			method: 'POST',
			body: JSON.stringify({ token })
		});
	}

	async resendVerification(email: string): Promise<{ message: string }> {
		return this.request<{ message: string }>('/auth/resend-verification', {
			method: 'POST',
			body: JSON.stringify({ email })
		});
	}

	async generateEnrollmentToken(): Promise<EnrollmentTokenResponse> {
		return this.request<EnrollmentTokenResponse>('/api/coach/enrollment-token', {
			method: 'POST'
		});
	}

	async getEnrollmentTokenInfo(token: string): Promise<EnrollmentTokenInfo> {
		return this.request<EnrollmentTokenInfo>(`/api/enrollment/${token}`);
	}

	async acceptEnrollment(token: string): Promise<{ message: string }> {
		return this.request<{ message: string }>(`/api/enrollment/${token}/accept`, {
			method: 'POST'
		});
	}

	async getEnrollments(): Promise<EnrolledUser[]> {
		return this.request<EnrolledUser[]>('/api/coach/enrollments');
	}

	async getUserEnrollment(): Promise<UserEnrollment | null> {
		try {
			return await this.request<UserEnrollment>('/api/user/enrollment');
		} catch {
			return null;
		}
	}

	async removeEnrollment(userId: string): Promise<{ message: string }> {
		return this.request<{ message: string }>(`/api/coach/enrollments/${userId}`, {
			method: 'DELETE'
		});
	}

	async leaveEnrollment(): Promise<{ message: string }> {
		return this.request<{ message: string }>('/api/user/enrollment', {
			method: 'DELETE'
		});
	}

	async getClientSessions(userId: string): Promise<SessionResponse[]> {
		return this.request<SessionResponse[]>(`/api/coach/clients/${userId}/sessions`);
	}
}

export const apiClient = new ApiClient();
