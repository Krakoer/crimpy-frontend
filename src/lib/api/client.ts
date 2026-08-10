import { getApiBaseUrl } from '$lib/config';

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
	refresh_token: string;
	user: User;
}

export interface RefreshResponse {
	token: string;
	refresh_token: string;
}

export interface RegisterResponse {
	message: string;
	token?: string;
	refresh_token?: string;
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
	UpdatedAt: string;
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

export interface AssessmentResponse {
	ID: string;
	UserID: string;
	Type: number;
	RightValue: number | null;
	LeftValue: number | null;
	SessionID: string;
	GripPosition: number;
	UpdatedAt: string;
	SessionDate: string;
}

export interface Tag {
	id: string;
	name: string;
	color: string;
	is_builtin: boolean;
	created_at: string;
	updated_at: string;
}

export interface TagRequest {
	name: string;
	color: string;
}

export interface Exercise {
	id: string;
	coach_id: string;
	name: string;
	description?: string | null;
	comment?: string | null;
	video_link?: string | null;
	is_favorite?: boolean;
	tags?: Tag[];
	created_at: string;
	updated_at: string;
}

export interface ExerciseRequest {
	name: string;
	description?: string;
	comment?: string;
	video_link?: string;
}

export interface ExerciseListParams {
	name?: string;
	tags?: string[];
	limit?: number;
	offset?: number;
}

export interface ExercisePage {
	exercises: Exercise[];
	total: number;
	limit: number;
	offset: number;
}

export type LoadUnit = 'bw' | 'percent_bw' | 'kg' | 'max';

export interface Load {
	value: number;
	unit: LoadUnit;
}

export type TrainingItemType =
	| 'repeater'
	| 'hangboard_rep'
	| 'free'
	| 'exercise'
	| 'circuit'
	| 'group';

export interface TrainingItem {
	id?: string;
	_id?: string;
	type: TrainingItemType;
	position?: number;
	cycles?: number;
	cycle_rest_seconds?: number;
	group_title?: string;
	exercise_id?: string;
	reps?: number;
	duration?: number;
	rest_seconds?: number;
	loads?: Load[];
	left_loads?: Load[];
	worktime_seconds?: number;
	hand?: HangboardHand;
	granularity?: HangboardGranularity;
	free_text?: string;
	comment?: string;
	load_is_max?: boolean;
	edge_sizes_mm?: number[];
	hand_positions?: string[][];
	items?: TrainingItem[];
}

// How the two hands are worked. Only 'both' puts two hands on the board at the
// same time; the other modes hang a single hand at a time.
export type HangboardHand = 'both' | 'alternate' | 'split' | 'left' | 'right';

// Layout of the hangboard configuration arrays: one row for the whole item, one
// row per rep, or one row per set and rep.
export type HangboardGranularity = 'uniform' | 'rep' | 'set';

export type TrainingType = 'workout' | 'stretching' | 'climbing';

export interface TrainingSummary {
	id: string;
	user_id: string;
	title: string;
	description?: string | null;
	training_type?: TrainingType;
	goal?: string;
	comment?: string;
	is_favorite?: boolean;
	created_at: string;
	updated_at: string;
}

export interface Training extends TrainingSummary {
	items: TrainingItem[];
}

export interface TrainingRequest {
	title: string;
	description?: string;
	training_type?: TrainingType;
	goal?: string;
	comment?: string;
	is_favorite?: boolean;
	items: TrainingItem[];
}

export interface Program {
	id: string;
	coach_id: string;
	user_id: string;
	name: string;
	objective?: string;
	start_date: string;
	duration_weeks?: number;
	created_at: string;
	updated_at: string;
}

export interface ProgramRequest {
	name: string;
	start_date: string;
	objective?: string;
	duration_weeks?: number;
}

export interface WeekSummary {
	id: string;
	program_id: string;
	week_number: number;
	notes?: string;
	created_at: string;
	updated_at: string;
}

export interface SessionOverride {
	id?: string;
	item_id: string;
	overrides: unknown;
}

export interface WeekSession {
	id: string;
	training_id: string;
	training_title: string;
	training_type: TrainingType;
	day_of_week?: number;
	times_per_week?: number;
	is_everyday: boolean;
	position: number;
	notes?: string;
	overrides: SessionOverride[];
}

export interface WeekDetail extends WeekSummary {
	sessions: WeekSession[];
}

export interface SessionRequest {
	training_id: string;
	day_of_week?: number;
	times_per_week?: number;
	is_everyday?: boolean;
	notes?: string;
	overrides: SessionOverride[];
}

export interface WeekRequest {
	notes?: string;
	sessions: SessionRequest[];
}

const ENDPOINTS_WITHOUT_TOKEN_REFRESH = [
	'/auth/login',
	'/auth/register',
	'/auth/refresh',
	'/auth/logout'
];

class ApiClient {
	private inFlightRefresh: Promise<boolean> | null = null;

	private async request<T>(
		endpoint: string,
		options: RequestInit = {},
		allowTokenRefresh = true
	): Promise<T> {
		const baseUrl = await getApiBaseUrl();
		const url = `${baseUrl}${endpoint}`;
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

		if (
			response.status === 401 &&
			allowTokenRefresh &&
			!ENDPOINTS_WITHOUT_TOKEN_REFRESH.some((prefix) => endpoint.startsWith(prefix))
		) {
			const refreshed = await this.refreshAccessToken();
			if (refreshed) {
				return this.request<T>(endpoint, options, false);
			}
		}

		if (!response.ok) {
			const error = await response.json().catch(() => ({ error: 'Unknown error' }));
			throw new Error(error.error || `HTTP ${response.status}`);
		}

		if (response.status === 204) return null as T;
		return response.json();
	}

	private refreshAccessToken(): Promise<boolean> {
		if (!this.inFlightRefresh) {
			this.inFlightRefresh = this.rotateTokens().finally(() => {
				this.inFlightRefresh = null;
			});
		}
		return this.inFlightRefresh;
	}

	private async rotateTokens(): Promise<boolean> {
		const refreshToken = this.getRefreshToken();
		if (!refreshToken) {
			this.clearToken();
			return false;
		}

		try {
			const baseUrl = await getApiBaseUrl();
			const response = await fetch(`${baseUrl}/auth/refresh`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ refresh_token: refreshToken })
			});
			if (!response.ok) {
				this.clearToken();
				return false;
			}
			const rotated: RefreshResponse = await response.json();
			this.setToken(rotated.token);
			this.setRefreshToken(rotated.refresh_token);
			return true;
		} catch {
			return false;
		}
	}

	private getToken(): string | null {
		if (typeof window !== 'undefined') {
			return localStorage.getItem('auth_token');
		}
		return null;
	}

	getRefreshToken(): string | null {
		if (typeof window !== 'undefined') {
			return localStorage.getItem('refresh_token');
		}
		return null;
	}

	setToken(token: string): void {
		if (typeof window !== 'undefined') {
			localStorage.setItem('auth_token', token);
		}
	}

	setRefreshToken(token: string): void {
		if (typeof window !== 'undefined') {
			localStorage.setItem('refresh_token', token);
		}
	}

	clearToken(): void {
		if (typeof window !== 'undefined') {
			localStorage.removeItem('auth_token');
			localStorage.removeItem('refresh_token');
			localStorage.removeItem('user');
		}
	}

	async login(credentials: LoginRequest): Promise<AuthResponse> {
		return this.request<AuthResponse>('/auth/login', {
			method: 'POST',
			body: JSON.stringify(credentials)
		});
	}

	async register(data: RegisterRequest): Promise<RegisterResponse> {
		return this.request<RegisterResponse>('/auth/register', {
			method: 'POST',
			body: JSON.stringify(data)
		});
	}

	async logout(): Promise<void> {
		const refreshToken = this.getRefreshToken();
		if (refreshToken) {
			await this.request<{ message: string }>('/auth/logout', {
				method: 'POST',
				body: JSON.stringify({ refresh_token: refreshToken })
			}).catch(() => undefined);
		}
		this.clearToken();
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

	async getClientAssessments(userId: string): Promise<AssessmentResponse[]> {
		return this.request<AssessmentResponse[]>(`/api/coach/clients/${userId}/assessments`);
	}

	async getExercises(params?: ExerciseListParams): Promise<ExercisePage> {
		const query = new URLSearchParams();
		if (params?.name) query.set('name', params.name);
		if (params?.tags?.length) query.set('tags', params.tags.join(','));
		if (params?.limit !== undefined) query.set('limit', String(params.limit));
		if (params?.offset !== undefined) query.set('offset', String(params.offset));
		const qs = query.toString();
		return this.request<ExercisePage>(`/api/coach/exercises${qs ? '?' + qs : ''}`);
	}

	async getExercise(id: string): Promise<Exercise> {
		return this.request<Exercise>(`/api/coach/exercises/${id}`);
	}

	async createExercise(data: ExerciseRequest): Promise<Exercise> {
		return this.request<Exercise>('/api/coach/exercises', {
			method: 'POST',
			body: JSON.stringify(data)
		});
	}

	async updateExercise(id: string, data: ExerciseRequest): Promise<Exercise> {
		return this.request<Exercise>(`/api/coach/exercises/${id}`, {
			method: 'PUT',
			body: JSON.stringify(data)
		});
	}

	async deleteExercise(id: string): Promise<{ message: string }> {
		return this.request<{ message: string }>(`/api/coach/exercises/${id}`, {
			method: 'DELETE'
		});
	}

	async setExerciseFavorite(id: string, isFavorite: boolean): Promise<Exercise> {
		return this.request<Exercise>(`/api/coach/exercises/${id}/favorite`, {
			method: 'PUT',
			body: JSON.stringify({ is_favorite: isFavorite })
		});
	}

	async getFavoriteExercises(): Promise<Exercise[]> {
		return this.request<Exercise[]>('/api/coach/exercises/favorites');
	}

	async getTrainings(): Promise<TrainingSummary[]> {
		return this.request<TrainingSummary[]>('/api/trainings');
	}

	async getTraining(id: string): Promise<Training> {
		return this.request<Training>(`/api/trainings/${id}`);
	}

	async createTraining(data: TrainingRequest): Promise<Training> {
		return this.request<Training>('/api/trainings', {
			method: 'POST',
			body: JSON.stringify(data)
		});
	}

	async updateTraining(id: string, data: TrainingRequest): Promise<Training> {
		return this.request<Training>(`/api/trainings/${id}`, {
			method: 'PUT',
			body: JSON.stringify(data)
		});
	}

	async deleteTraining(id: string): Promise<{ message: string }> {
		return this.request<{ message: string }>(`/api/trainings/${id}`, {
			method: 'DELETE'
		});
	}

	async getTags(): Promise<Tag[]> {
		return this.request<Tag[]>('/api/coach/tags');
	}

	async createTag(data: TagRequest): Promise<Tag> {
		return this.request<Tag>('/api/coach/tags', {
			method: 'POST',
			body: JSON.stringify(data)
		});
	}

	async updateTag(id: string, data: TagRequest): Promise<Tag> {
		return this.request<Tag>(`/api/coach/tags/${id}`, {
			method: 'PUT',
			body: JSON.stringify(data)
		});
	}

	async deleteTag(id: string): Promise<{ message: string }> {
		return this.request<{ message: string }>(`/api/coach/tags/${id}`, {
			method: 'DELETE'
		});
	}

	async assignTagToExercise(exerciseId: string, tagId: string): Promise<void> {
		await this.request<void>(`/api/coach/exercises/${exerciseId}/tags/${tagId}`, {
			method: 'POST'
		});
	}

	async unassignTagFromExercise(exerciseId: string, tagId: string): Promise<void> {
		await this.request<void>(`/api/coach/exercises/${exerciseId}/tags/${tagId}`, {
			method: 'DELETE'
		});
	}

	async listPrograms(userId: string): Promise<Program[]> {
		return this.request<Program[]>(`/api/coach/clients/${userId}/programs`);
	}

	async getProgram(userId: string, programId: string): Promise<Program> {
		return this.request<Program>(`/api/coach/clients/${userId}/programs/${programId}`);
	}

	async createProgram(userId: string, data: ProgramRequest): Promise<Program> {
		return this.request<Program>(`/api/coach/clients/${userId}/programs`, {
			method: 'POST',
			body: JSON.stringify(data)
		});
	}

	async updateProgram(userId: string, programId: string, data: ProgramRequest): Promise<Program> {
		return this.request<Program>(`/api/coach/clients/${userId}/programs/${programId}`, {
			method: 'PUT',
			body: JSON.stringify(data)
		});
	}

	async deleteProgram(userId: string, programId: string): Promise<{ message: string }> {
		return this.request<{ message: string }>(`/api/coach/clients/${userId}/programs/${programId}`, {
			method: 'DELETE'
		});
	}

	async listWeeks(userId: string, programId: string): Promise<WeekSummary[]> {
		return this.request<WeekSummary[]>(`/api/coach/clients/${userId}/programs/${programId}/weeks`);
	}

	async getWeek(userId: string, programId: string, weekNumber: number): Promise<WeekDetail> {
		return this.request<WeekDetail>(
			`/api/coach/clients/${userId}/programs/${programId}/weeks/${weekNumber}`
		);
	}

	async upsertWeek(
		userId: string,
		programId: string,
		weekNumber: number,
		data: WeekRequest
	): Promise<WeekDetail> {
		return this.request<WeekDetail>(
			`/api/coach/clients/${userId}/programs/${programId}/weeks/${weekNumber}`,
			{ method: 'PUT', body: JSON.stringify(data) }
		);
	}

	async deleteWeek(
		userId: string,
		programId: string,
		weekNumber: number
	): Promise<{ message: string }> {
		return this.request<{ message: string }>(
			`/api/coach/clients/${userId}/programs/${programId}/weeks/${weekNumber}`,
			{ method: 'DELETE' }
		);
	}
}

export const apiClient = new ApiClient();
