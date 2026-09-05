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

export interface CoachDecisionResponse {
	message: string;
	email_sent: boolean;
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
	id: string;
	user_id: string;
	name: string;
	date: string;
	duration: number;
	notes: string;
	// What was done, as a label. See SESSION_ACTIVITIES in $lib/sessions.
	activity: number;
	// How the session came to exist. Played sessions were run step by step in the
	// app and own their reps and timings; logged ones were entered by hand.
	origin: 'played' | 'logged';
	// What the session was played from, both absent when it was logged by hand.
	training_id?: string | null;
	program_session_id?: string | null;
	// What the athlete was asked to do, frozen when the session was created.
	// Absent on a session run from nothing, and on the list endpoints, which
	// leave it out since only the detail screen reads it.
	prescription?: PrescriptionSnapshot | null;
	is_assessment: boolean;
	// What the coach answered the athlete's notes with, absent while they have
	// not answered. coach_reply_read says whether the athlete has opened that
	// answer since it was last written.
	coach_reply?: string | null;
	coach_reply_at?: string | null;
	coach_reply_read: boolean;
	updated_at: string;
	// Only on the list endpoint, which does not carry the reps themselves.
	rep_count?: number;
}

// Which hand pulled a rep. A two handed hang is a state of its own rather than
// one of the single hands, so the three cannot be told apart by a boolean.
export type RepHand = 'left' | 'right' | 'both';

// One repetition recorded by the force sensor, work or rest, in session order.
export interface RepData {
	id: string;
	user_id: string;
	session_id: string;
	average_weight: number;
	target_weight: number;
	duration: number;
	index: number;
	is_rest: boolean;
	hand: RepHand;
	grip_position: number;
	// Depth of the edge the rep was pulled on, absent when the step prescribed
	// none: a rest, or an exercise done off the hangboard.
	edge_size_mm?: number | null;
	// The prescription item the rep was played from, so the reps of a session
	// read block by block. Absent on a session played outside a training, and on
	// one recorded before the app sent it.
	training_item_id?: string | null;
	// Whether the step prescribed a load nothing measured, which is the sensor
	// dropping while a hang it was meant to read was running. The rep carries no
	// target then, exactly as a step nothing was going to measure does, so this
	// is what tells a lost target from one never given.
	target_unmeasured: boolean;
	updated_at: string;
}

// A count the run resolved for an item the prescription left open: the reps an
// AMRAP turned out to be, or the rounds an emom was carried through before the
// athlete dropped out. Nothing else records these, since a set of pull ups
// passes through no sensor and so leaves no rep behind.
export interface SessionItemResult {
	id: string;
	session_id: string;
	// The prescription item the count answers, keyed the way a rep is.
	training_item_id: string;
	// Which pass through the item the count belongs to, from 0, when the item
	// sits inside a block that repeats.
	occurrence: number;
	field: 'reps' | 'cycles';
	value: number;
	updated_at: string;
}

export interface SessionDetail {
	session: SessionResponse;
	rep_datas: RepData[];
	assessments: SessionAssessment[];
	item_results?: SessionItemResult[];
}

// The training a played session was run from, as it read at the moment it was
// played, with the coach's per-week overrides already merged into its items.
// The training itself stays editable afterwards, so this copy is the only thing
// that still describes what was actually prescribed.
export interface PrescriptionSnapshot {
	id: string;
	title: string;
	description?: string | null;
	training_type: TrainingType;
	goal?: string | null;
	comment?: string | null;
	// Both set only when the session was played from a coach's program week.
	program_session_id?: string | null;
	coach_notes?: string | null;
	items: TrainingItem[];
	resolved_against: PrescriptionInputs;
}

// The athlete's own numbers the prescription is read against, frozen with it. A
// load the coach set as a percentage of an assessment is stored as the
// percentage, so these are what turn it back into kilograms as it stood then.
export interface PrescriptionInputs {
	// Empty when the athlete had done no assessment, the case where the
	// prescription falls back to the value the coach set.
	assessments: AssessmentResultSnapshot[];
	// The assessments the prescription references, as they read when the session
	// was played. A reference with no result still has to be named and unit
	// checked, and the definition stays editable afterwards.
	definitions?: AssessmentDefinitionSnapshot[];
}

// The last value the athlete had measured for one assessment, per hand. A hand
// never measured is absent rather than zero.
export interface AssessmentResultSnapshot {
	assessment_id: string;
	right_value?: number | null;
	left_value?: number | null;
}

// An assessment as a prescription froze it: enough to name the reference and
// check it drives a field measured in the same unit.
export interface AssessmentDefinitionSnapshot {
	id: string;
	label: string;
	prompt?: string | null;
	unit: string;
	per_hand: boolean;
	training_id?: string | null;
	// Set once the unit and the hands can no longer move: results were measured
	// against them, or a training reads a number against them.
	unit_locked?: boolean;
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

export interface SessionAssessment {
	id: string;
	user_id: string;
	// The assessment measured, with its definition as it reads now, so a result
	// can be named and formatted without a second request.
	assessment_id: string;
	label: string;
	unit: string;
	per_hand: boolean;
	// The training the assessment is run from, absent on the ones Crimpy ships.
	training_id?: string | null;
	right_value: number | null;
	left_value: number | null;
	session_id: string;
	grip_position?: number | null;
	updated_at: string;
}

// An assessment the caller may reference: one Crimpy ships, or one they wrote.
export interface AssessmentDefinition {
	id: string;
	label: string;
	unit: string;
	prompt?: string | null;
	training_id?: string | null;
	per_hand: boolean;
	is_builtin: boolean;
	// Set once the unit and the hands can no longer move: results were measured
	// against them, or a training reads a number against them.
	unit_locked: boolean;
	created_at: string;
	updated_at: string;
}

export interface AssessmentDefinitionRequest {
	training_id?: string;
	label: string;
	prompt: string;
	unit: string;
	per_hand: boolean;
}

// The session-scoped assessment joined with the date of the session it was
// recorded in, which only the per-user listing endpoint returns.
export interface AssessmentResponse extends SessionAssessment {
	session_date: string;
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

export type LoadUnit = 'bw' | 'percent_bw' | 'kg' | 'max' | 'percent_assessment';

export interface Load {
	value: number;
	unit: LoadUnit;
	// Set only on percent_assessment loads, where value carries the percentage:
	// the assessment the load is relative to, and the kilograms to fall back on
	// when the athlete has never done it.
	assessment_id?: string;
	fallback?: number;
}

// A scalar item field prescribed as a percentage of the athlete last result for
// an assessment, falling back to a fixed value when the assessment is missing.
export interface VariableTarget {
	assessment_id: string;
	percent: number;
	fallback: number;
}

export interface VariableTargets {
	duration?: VariableTarget;
	reps?: VariableTarget;
}

export type TrainingItemType =
	| 'repeater'
	| 'hangboard_rep'
	| 'free'
	| 'exercise'
	| 'circuit'
	| 'group'
	| 'emom';

export interface TrainingItem {
	id?: string;
	_id?: string;
	type: TrainingItemType;
	position?: number;
	cycles?: number;
	cycle_rest_seconds?: number;
	// How often a round starts, on an emom and nothing else. It is what makes the
	// block every minute on the minute: the work is self paced and whatever is
	// left of the interval is the rest, so the next round starts on the clock
	// however fast the one before it went.
	interval_seconds?: number;
	group_title?: string;
	exercise_id?: string;
	// Joined by the backend on every item it returns, so a tree read from a
	// prescription snapshot names its exercises without a second request.
	exercise_name?: string | null;
	reps?: number;
	// Whether the rep count is left open, which is an AMRAP: the coach sets no
	// number and the athlete records how many they managed. Exercises only.
	reps_is_max?: boolean;
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
	variable_targets?: VariableTargets;
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

// What a training is about. A label only: what the athlete's app lets them do
// with it comes from the items it holds, never from this.
export type TrainingType = 'hangboard' | 'workout' | 'stretching' | 'climbing' | 'other';

export interface TrainingSummary {
	id: string;
	user_id: string;
	title: string;
	description?: string | null;
	training_type?: TrainingType;
	goal?: string;
	comment?: string;
	is_favorite?: boolean;
	// Set when the training is a custom assessment: it is run like any training
	// and ends on the question the prompt asks.
	assessment?: AssessmentDefinitionSnapshot | null;
	created_at: string;
	updated_at: string;
}

export interface Training extends TrainingSummary {
	items: TrainingItem[];
	// The assessments the items reference, so a percentage can be named and unit
	// checked without reading a definition the caller may not own.
	referenced_assessments?: AssessmentDefinitionSnapshot[];
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

// Every field a program session may replace on the training item it targets.
// The set is closed: a key the backend does not name here is dropped from the
// prescription the athlete plays rather than merely ignored, so it has to stay
// in step with itemOverride in crimpy-backend/internal/handler/training_items.go
// and with applyOverride in crimpy-app.
//
// hb_worktime_seconds is the trap: the override names the item's
// worktime_seconds field with a different key, and every client reads it so.
export interface ItemOverride {
	cycles?: number;
	cycle_rest_seconds?: number;
	interval_seconds?: number;
	reps?: number;
	reps_is_max?: boolean;
	duration?: number;
	rest_seconds?: number;
	hb_worktime_seconds?: number;
	hand?: HangboardHand;
	granularity?: HangboardGranularity;
	load_is_max?: boolean;
	loads?: Load[];
	left_loads?: Load[];
	hand_positions?: string[][];
	edge_sizes_mm?: number[];
	variable_targets?: VariableTargets;
}

export interface SessionOverride {
	id?: string;
	item_id: string;
	overrides: ItemOverride;
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
	is_locked: boolean;
	overrides: SessionOverride[];
}

export interface WeekDetail extends WeekSummary {
	sessions: WeekSession[];
}

export interface SessionRequest {
	id?: string;
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

export interface DayAvailability {
	// Monday first, like day_of_week on a program session.
	day_of_week: number;
	is_available: boolean;
	duration_minutes?: number;
	note?: string;
}

export interface WeekAvailability {
	user_id: string;
	// The Monday of a calendar week, YYYY-MM-DD. Not a program week number: an
	// athlete declares whether or not a program covers that week.
	week_start: string;
	updated_at: string;
	days: DayAvailability[];
}

export interface AvailabilityReminder {
	enabled: boolean;
	day_of_week: number;
	hour: number;
	minute: number;
}

/** One thing a coachee did, derived by the API from what it already stores
 *  rather than from an event log, so the feed reaches back over old data. */
export interface FeedEvent {
	kind: 'session_completed' | 'availability_declared' | 'coachee_enrolled';
	occurred_at: string;
	user_id: string;
	user_firstname: string;
	user_lastname: string;
	session_id?: string;
	title?: string;
	activity?: number;
	origin?: string;
	note?: string;
	week_start?: string;
}

export interface PendingFeedback {
	session_id: string;
	user_id: string;
	user_firstname: string;
	user_lastname: string;
	session_name: string;
	session_date: string;
	activity: number;
	notes: string;
}

export interface EmptyProgramWeek {
	/** Which week the item is about: the one being trained right now, listed
	 *  whatever the moment says, or the one starting on the coming Monday. */
	scope: 'current' | 'next';
	program_id: string;
	program_name: string;
	user_id: string;
	user_firstname: string;
	user_lastname: string;
	week_number: number;
	week_start: string;
}

/** When the empty week list is due, so an empty list can say whether nothing is
 *  missing or the moment the coach chose has not come round yet. */
export interface EmptyWeekCheck {
	day_of_week: number;
	hour: number;
	minute: number;
	reached: boolean;
	week_start: string;
}

export interface CoachTodo {
	pending_feedback: PendingFeedback[];
	empty_weeks: EmptyProgramWeek[];
	empty_week_check: EmptyWeekCheck;
	/** Every session waiting on an answer, which is more than pending_feedback
	 *  holds once the API's cap is reached. */
	pending_feedback_total: number;
	sessions_this_week: number;
}

export interface CoachTodoSettings {
	empty_week_day_of_week: number;
	empty_week_hour: number;
	empty_week_minute: number;
}

/** An API failure that still knows its status, so a caller can tell a 404 that
 *  means "there is none" from a failure that means "we could not read it". */
export class ApiError extends Error {
	readonly status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
	}
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
			throw new ApiError(error.error || `HTTP ${response.status}`, response.status);
		}

		if (response.status === 204) return null as T;
		return response.json();
	}

	private async requestList<T>(endpoint: string, options: RequestInit = {}): Promise<T[]> {
		return (await this.request<T[] | null>(endpoint, options)) ?? [];
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
		return this.requestList<CoachResponse>('/api/admin/coaches/pending');
	}

	async validateCoach(id: string): Promise<CoachDecisionResponse> {
		return this.request<CoachDecisionResponse>(`/api/admin/coaches/${id}/validate`, {
			method: 'PUT'
		});
	}

	async rejectCoach(id: string): Promise<CoachDecisionResponse> {
		return this.request<CoachDecisionResponse>(`/api/admin/coaches/${id}/reject`, {
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
		return this.requestList<EnrolledUser>('/api/coach/enrollments');
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
		return this.requestList<SessionResponse>(`/api/coach/clients/${userId}/sessions`);
	}

	async getClientSession(userId: string, sessionId: string): Promise<SessionDetail> {
		return this.request<SessionDetail>(`/api/coach/clients/${userId}/sessions/${sessionId}`);
	}

	// Writes the coach's answer to the notes an athlete left on a session. An
	// empty reply takes a previous answer back.
	async setClientSessionReply(
		userId: string,
		sessionId: string,
		reply: string
	): Promise<SessionResponse> {
		return this.request<SessionResponse>(
			`/api/coach/clients/${userId}/sessions/${sessionId}/reply`,
			{
				method: 'PUT',
				body: JSON.stringify({ reply })
			}
		);
	}

	async getClientAssessments(userId: string): Promise<AssessmentResponse[]> {
		return this.requestList<AssessmentResponse>(`/api/coach/clients/${userId}/assessments`);
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
		return this.requestList<Exercise>('/api/coach/exercises/favorites');
	}

	// isAssessment narrows the library: true for the custom assessments alone,
	// false for the trainings that are not one, omitted for everything.
	async getTrainings(isAssessment?: boolean): Promise<TrainingSummary[]> {
		const query = isAssessment === undefined ? '' : `?is_assessment=${isAssessment}`;
		return this.requestList<TrainingSummary>(`/api/trainings${query}`);
	}

	async getAssessmentDefinitions(): Promise<AssessmentDefinition[]> {
		return this.requestList<AssessmentDefinition>('/api/assessment-definitions');
	}

	async createAssessmentDefinition(
		data: AssessmentDefinitionRequest
	): Promise<AssessmentDefinition> {
		return this.request<AssessmentDefinition>('/api/assessment-definitions', {
			method: 'POST',
			body: JSON.stringify(data)
		});
	}

	async updateAssessmentDefinition(
		id: string,
		data: AssessmentDefinitionRequest
	): Promise<AssessmentDefinition> {
		return this.request<AssessmentDefinition>(`/api/assessment-definitions/${id}`, {
			method: 'PUT',
			body: JSON.stringify(data)
		});
	}

	async deleteAssessmentDefinition(id: string): Promise<void> {
		return this.request<void>(`/api/assessment-definitions/${id}`, { method: 'DELETE' });
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
		return this.requestList<Tag>('/api/coach/tags');
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
		return this.requestList<Program>(`/api/coach/clients/${userId}/programs`);
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
		return this.requestList<WeekSummary>(
			`/api/coach/clients/${userId}/programs/${programId}/weeks`
		);
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

	async getCoachFeed(params?: { limit?: number; before?: string }): Promise<FeedEvent[]> {
		const query = new URLSearchParams();
		if (params?.limit !== undefined) query.set('limit', String(params.limit));
		if (params?.before) query.set('before', params.before);
		const qs = query.toString();
		return this.requestList<FeedEvent>(`/api/coach/feed${qs ? '?' + qs : ''}`);
	}

	// The moment a coach picked for their empty week check is a wall clock time
	// in their own week, which the server cannot place without being told the
	// offset the browser is on.
	async getCoachTodo(): Promise<CoachTodo> {
		const offset = -new Date().getTimezoneOffset();
		return this.request<CoachTodo>(`/api/coach/todo?tz_offset_minutes=${offset}`);
	}

	async getCoachTodoSettings(): Promise<CoachTodoSettings> {
		return this.request<CoachTodoSettings>('/api/coach/todo-settings');
	}

	async setCoachTodoSettings(data: CoachTodoSettings): Promise<CoachTodoSettings> {
		return this.request<CoachTodoSettings>('/api/coach/todo-settings', {
			method: 'PUT',
			body: JSON.stringify(data)
		});
	}

	async getClientAvailability(userId: string): Promise<WeekAvailability[]> {
		return this.requestList<WeekAvailability>(`/api/coach/clients/${userId}/availability`);
	}

	// Answers 404 until the coach has configured one, which is a state rather
	// than a failure. Anything else is rethrown: a settings form that silently
	// showed its defaults would let a coach save over a reminder it never read.
	async getAvailabilityReminder(): Promise<AvailabilityReminder | null> {
		try {
			return await this.request<AvailabilityReminder>('/api/coach/availability-reminder');
		} catch (e) {
			if (e instanceof ApiError && e.status === 404) return null;
			throw e;
		}
	}

	async setAvailabilityReminder(data: AvailabilityReminder): Promise<AvailabilityReminder> {
		return this.request<AvailabilityReminder>('/api/coach/availability-reminder', {
			method: 'PUT',
			body: JSON.stringify(data)
		});
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
