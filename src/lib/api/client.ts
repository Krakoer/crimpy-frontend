import { callerOffsetMinutes, callerTimeZone } from '$lib/caller-clock';
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
	// How much recovery the session cost the athlete, on the session RPE scale,
	// absent while they have not reported one. See $lib/rpe for the anchors that
	// make a value readable, and note this is not the set RPE scale. rpe_failed
	// is that scale's ECHEC, a session that could not be carried through, and it
	// is never true beside a number.
	rpe?: number | null;
	rpe_failed: boolean;
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

// What the athlete reported about one pass through a prescribed item: the reps
// an AMRAP turned out to be, the rounds an emom was carried through, and for any
// step at all the load, the duration and the line they wrote about it. Nothing
// else records any of it, since a set of pull ups passes through no sensor and
// so leaves no rep behind.
//
// Every reported field is optional: a field the athlete said nothing about is
// absent rather than zero, so a coach is never shown a number never given.
export interface SessionItemResult {
	id: string;
	session_id: string;
	// The prescription item the report answers, keyed the way a rep is.
	training_item_id: string;
	// Which pass through the item the report belongs to, from 0, when the item
	// sits inside a block that repeats.
	occurrence: number;
	reps?: number;
	cycles?: number;
	load_kg?: number;
	duration_seconds?: number;
	note?: string;
	updated_at: string;
}

// What a session read answers with: the session and the three collections
// recorded against it.
//
// Each collection is drawn by a read of its own on the server, and a read that
// fails leaves its collection out of the object rather than sending an empty
// array. So absent and empty are different answers and have to be drawn
// differently: absent is a collection that could not be loaded, [] is a session
// that holds none of it. Reading an absent one as empty is what used to make the
// modal say the sensor recorded nothing during a partial deploy.
export interface SessionDetail {
	session: SessionResponse;
	rep_datas?: RepData[];
	assessments?: SessionAssessment[];
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
	bodyweight_relative?: boolean;
	training_id?: string | null;
	// Set once the unit and the hands can no longer move: results were measured
	// against them, or a training reads a number against them.
	unit_locked?: boolean;
}

// One dated bodyweight measurement. measured_at is when the athlete weighed
// themselves rather than when the row reached the server, so a measurement
// taken offline keeps the day it belongs to.
export interface Bodyweight {
	id: string;
	user_id: string;
	weight_kg: number;
	measured_at: string;
	created_at: string;
}

// One calendar week of the coach's training load view, cut on Monday in the
// caller's own time. A week the athlete trained nothing is still present, with
// zeros, because the chronic mean has to count it.
//
// The nullable figures are absences rather than zeros. mean_rpe is null when no
// session that week was rated; acute_load is zero for a week with no session at
// all and null for a week that holds sessions but no rating or no recorded
// duration, since the effort is then simply not known. A session marked ECHEC is outside mean_rpe
// altogether and is reported as failed_sessions: it names an outcome, not a
// point on the 5 to 10 scale.
export interface WeeklyTrainingLoad {
	week_start: string;
	week_number: number | null;
	program_name: string | null;
	session_count: number;
	total_minutes: number;
	climbing_minutes: number;
	strength_minutes: number;
	rated_sessions: number;
	failed_sessions: number;
	mean_rpe: number | null;
	acute_load: number | null;
	chronic_load: number | null;
	// How many weeks the chronic mean rested on, at most three and never
	// reaching before the athlete's first recorded session.
	chronic_weeks: number;
	acute_chronic_ratio: number | null;
	load_change_percent: number | null;
}

export interface TrainingLoadSeries {
	weeks: WeeklyTrainingLoad[];
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
	// Whether the result reads as a ratio to the bodyweight it was pulled at,
	// (bodyweight + result) / bodyweight, rather than as an absolute load. The
	// value beside it is always the raw measurement.
	bodyweight_relative: boolean;
	// The weigh-in a bodyweight relative result is divided by: the last one taken
	// at or before the session that measured it, with the day it was taken. The
	// denominator travels on the result rather than being picked out of a
	// bodyweight series here, so the session detail, the cards, the history table
	// and the two date comparison all read one result against one weight.
	//
	// Absent together when no weigh-in qualifies, which is a ratio a reader
	// declines rather than invents. That is also what POST /api/assessments
	// answers with for an athlete who has never weighed in.
	bodyweight_kg?: number | null;
	bodyweight_measured_at?: string | null;
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
	// Whether a result in kilograms is drawn as a ratio to the bodyweight it was
	// pulled at. Free to toggle at any time, unlike the unit and the hands:
	// nothing derived from it is stored.
	bodyweight_relative: boolean;
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
	bodyweight_relative: boolean;
}

// The session-scoped assessment joined with the date of the session it was
// recorded in, which only the per-user listing endpoints return: a session read
// names that date once, on the session, so only a listing has to carry it per
// row. The denominator is on the result itself, see SessionAssessment.
export interface AssessmentResponse extends SessionAssessment {
	session_date: string;
}

// One assessment as it stood on a date: the last value measured for it at or
// before then, per grip and per hand. The measured dates are what tell a value
// taken around that date from one the snapshot carried forward, which a
// comparison has to say rather than draw as an unchanged result.
export interface AssessmentSnapshotResult {
	assessment_id: string;
	label: string;
	unit: string;
	per_hand: boolean;
	bodyweight_relative: boolean;
	training_id?: string | null;
	grip_position: number;
	right_value?: number | null;
	right_measured_at?: string | null;
	// The weight in effect when this hand was measured, which is the denominator
	// its ratio has to be read against. Not the snapshot's bodyweight_kg: a value
	// carried forward from an earlier session was pulled at the weight of that
	// day. Absent when no weigh-in precedes the measurement.
	right_bodyweight_kg?: number | null;
	// When that weigh-in was taken. A weight alone cannot say how near it was to
	// the result it divides, and the last one at or before a result can be the
	// same morning or months earlier. Absent exactly when the weight is.
	right_bodyweight_measured_at?: string | null;
	left_value?: number | null;
	left_measured_at?: string | null;
	left_bodyweight_kg?: number | null;
	left_bodyweight_measured_at?: string | null;
}

// What an athlete had measured as of a date. The bodyweight is what the athlete
// weighed on that date, which is not the same thing as what any one result was
// pulled at: the weight a ratio is read against travels with the value, on the
// result. Absent when nothing had been recorded by then.
export interface AssessmentSnapshot {
	date: string;
	bodyweight_kg?: number | null;
	results: AssessmentSnapshotResult[];
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
	// Joined the same way, and for a stronger reason: the athlete is refused
	// every coach exercise route, so this is the only place the demo video and
	// the movement notes reach them. The portal shows them so a coach sees what
	// the athlete will get.
	exercise_description?: string | null;
	// The coach's execution notes on the movement. Distinct from `comment`
	// below, which is what they said about this one step.
	exercise_comment?: string | null;
	exercise_video_link?: string | null;
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
	// Why the block is in the program, which is what makes it a different field
	// from `comment` above: that one says how to run this instance, this one
	// holds across the weeks that retune it. Not an override key for that
	// reason.
	goal?: string;
	// The rule the athlete resolves while performing the block, in the coach's
	// own prose ("to failure or 40s; past 40s add 5kg"). A prescription is often
	// a condition rather than a number, and nothing here evaluates it: the
	// athlete reads it and records what came of it on the session. Not an
	// override key, for the reason `goal` and `comment` are not.
	protocol?: string;
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
	// The training phase this week belongs to ("capacity", "deload"), reused
	// across the weeks of one block and what a coach scans the program by.
	// Distinct from notes below, which is a message about this one week.
	name?: string;
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

// The item field each override key replaces. Nearly all of them are named after
// the field, and hb_worktime_seconds is the one that is not.
//
// It types as a Record over both interfaces, so an override key with no entry
// and an entry naming a field TrainingItem does not have are both compile
// errors: this is what keeps the keys readable at runtime in step with the
// interface above, which is erased and cannot be read at all. They are held to
// contract/override-keys.json, the copy of the backend's key set that the app is
// held to as well, by override-contract.test.ts.
export const OVERRIDE_ITEM_FIELDS = {
	cycles: 'cycles',
	cycle_rest_seconds: 'cycle_rest_seconds',
	interval_seconds: 'interval_seconds',
	reps: 'reps',
	reps_is_max: 'reps_is_max',
	duration: 'duration',
	rest_seconds: 'rest_seconds',
	hb_worktime_seconds: 'worktime_seconds',
	hand: 'hand',
	granularity: 'granularity',
	load_is_max: 'load_is_max',
	loads: 'loads',
	left_loads: 'left_loads',
	hand_positions: 'hand_positions',
	edge_sizes_mm: 'edge_sizes_mm',
	variable_targets: 'variable_targets'
} as const satisfies Record<keyof ItemOverride, keyof TrainingItem>;

export type OverrideKey = keyof typeof OVERRIDE_ITEM_FIELDS;

export interface SessionOverride {
	id?: string;
	item_id: string;
	overrides: ItemOverride;
	// Computed by the coach week read against the training as it now stands,
	// never stored and never sent back: the item no longer takes what this
	// override asks, so the athlete is handed the block without it and the next
	// save of the week is refused until the coach clears or rewrites it.
	//
	// Only the GET answers it. The upsert echo answers false by construction,
	// since a save carrying a stale override is refused before it gets that far.
	override_stale?: boolean;
	// Which fields the refusal is about, one entry per field per reason, in the
	// order the validators ask. Absent unless override_stale.
	stale_fields?: StaleOverrideField[];
}

// One reason a stale override is refused, attributed to one of the fields that
// reason is about. It mirrors StaleOverrideField in
// crimpy-backend/internal/handler/program_week.go, whose comment on
// SessionOverrideResponse.StaleFields is the authority on how it is read.
//
// The whole row is stored and the server refuses part of it, so a reader given
// only the reason cannot tell an edit of the refused field from an edit of
// another field of the same row. What each entry says is: this reason is about
// this field, and a coach moving that field is a coach the server has not
// judged yet.
export interface StaleOverrideField {
	// The override key the reason is about, spelled as
	// contract/override-keys.json spells it. Empty stands for the override as a
	// whole, which is what a refusal nothing could be attributed to answers with.
	field: string;
	// The refusal in the validator's own words rather than words written for a
	// coach, which is why every screen quotes it instead of presenting it as its
	// own explanation. The first entry's reason is the one a save of this same
	// override is refused with, since the write paths answer with the first
	// refusal alone.
	reason: string;
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
	name?: string;
	notes?: string;
	sessions: SessionRequest[];
}

/** One thing the athlete plans to do on a day. Only the label is always there:
 *  a duration they could not guess, or a place they had not picked, come back
 *  missing rather than empty. "when" is free text, so "before work" and "after
 *  the kids are down" are both answers, and neither is a fixed slot. */
export interface DayActivity {
	label: string;
	duration_minutes?: number;
	when?: string;
	where?: string;
}

export interface DayAvailability {
	// Monday first, like day_of_week on a program session.
	day_of_week: number;
	// In the order the athlete entered them. An empty list is an answer, not a
	// gap: it says nothing is on that day.
	//
	// Optional because the portal can be deployed ahead of the API, and a day
	// that came back without a list says nothing about the athlete's week. The
	// API always sends one, so this is about deploy skew and not about the
	// contract; it is optional here so a reader has to decide what an absent
	// list means rather than assuming it is an empty one.
	activities?: DayActivity[];
}

export interface WeekAvailability {
	user_id: string;
	// The Monday of a calendar week, YYYY-MM-DD. Not a program week number: an
	// athlete declares whether or not a program covers that week.
	week_start: string;
	updated_at: string;
	// Always all seven days. A week is only ever in this list because the
	// athlete declared it, so a week holding no activity at all is a declared
	// week where nothing is on, not a week they never answered.
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
	'/auth/logout',
	'/auth/forgot-password',
	'/auth/reset-password'
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

	/** Reads an endpoint that cuts its weeks on the caller's own calendar,
	 *  sending the browser's zone name and its offset together.
	 *
	 *  The server prefers the zone, which is what makes a week boundary on the
	 *  far side of a daylight saving change land where the athlete lived it, and
	 *  it answers 400 for a zone name it will not resolve rather than quietly
	 *  ignoring it. Sending the offset alongside does not rescue that by itself,
	 *  since both parameters ride the same request, so a refused zone is retried
	 *  once without it and the coach reads the slightly coarser answer instead of
	 *  an error. The shape the server accepts is deliberately narrower than the
	 *  zone names that exist and it can also turn away a zone its own database
	 *  does not carry yet, so the portal asks rather than restating that rule
	 *  here, where the two copies would drift.
	 *
	 *  A 400 raised by something other than the zone costs one extra request and
	 *  then surfaces as itself, since the retry fails the same way. */
	private async requestOnCallerClock<T>(endpoint: string, params: URLSearchParams): Promise<T> {
		params.set('tz_offset_minutes', String(callerOffsetMinutes()));
		const zone = callerTimeZone();
		if (!zone) return this.request<T>(`${endpoint}?${params}`);

		const withZone = new URLSearchParams(params);
		withZone.set('timezone', zone);
		try {
			return await this.request<T>(`${endpoint}?${withZone}`);
		} catch (e) {
			if (e instanceof ApiError && e.status === 400) {
				return this.request<T>(`${endpoint}?${params}`);
			}
			throw e;
		}
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

	async forgotPassword(email: string): Promise<{ message: string }> {
		return this.request<{ message: string }>('/auth/forgot-password', {
			method: 'POST',
			body: JSON.stringify({ email })
		});
	}

	async resetPassword(
		token: string,
		newPassword: string
	): Promise<{ message: string; is_coach: boolean }> {
		return this.request<{ message: string; is_coach: boolean }>('/auth/reset-password', {
			method: 'POST',
			body: JSON.stringify({ token, new_password: newPassword })
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

	// The athlete's weekly training load, oldest week first and ending with the
	// week being trained now. The caller's clock is sent because the week
	// boundary is the coach's own Monday, the way it is for the TODO list, and a
	// server reading its own clock would cut the week somewhere else entirely.
	async getClientTrainingLoad(userId: string, weeks: number): Promise<TrainingLoadSeries> {
		return this.requestOnCallerClock<TrainingLoadSeries>(
			`/api/coach/clients/${userId}/training-load`,
			new URLSearchParams({ weeks: String(weeks) })
		);
	}

	async getClientAssessments(userId: string): Promise<AssessmentResponse[]> {
		return this.requestList<AssessmentResponse>(`/api/coach/clients/${userId}/assessments`);
	}

	// The athlete's dated bodyweight series, newest first. Every finger and
	// pulling score is a ratio to the bodyweight of the day rather than an
	// absolute, so this is the denominator those numbers are read against.
	// The limit is the caller's to state, because what the series has to reach
	// back to is a property of what the caller draws from it rather than of the
	// endpoint. The API's own default is far shorter than a trend window at any
	// real weigh-in frequency.
	async getClientBodyweights(userId: string, limit: number): Promise<Bodyweight[]> {
		return this.requestList<Bodyweight>(`/api/coach/clients/${userId}/bodyweights?limit=${limit}`);
	}

	// The client's results as they stood on one day, which is one side of a two
	// date comparison. The day is YYYY-MM-DD and means the state of things that
	// evening, so a test run that afternoon is included.
	async getClientAssessmentSnapshot(userId: string, day: string): Promise<AssessmentSnapshot> {
		return this.request<AssessmentSnapshot>(
			`/api/coach/clients/${userId}/assessments/at?date=${encodeURIComponent(day)}`
		);
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
	// clock the browser is on.
	async getCoachTodo(): Promise<CoachTodo> {
		return this.requestOnCallerClock<CoachTodo>('/api/coach/todo', new URLSearchParams());
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

	// The weeks a client declared. from and to are Mondays in YYYY-MM-DD and
	// bound the answer to that range of calendar weeks, both ends included.
	// Sending neither reads every week the athlete ever declared, which a week
	// holding up to 140 activities makes far larger than any page needs.
	async getClientAvailability(
		userId: string,
		params?: { from?: string; to?: string }
	): Promise<WeekAvailability[]> {
		const query = new URLSearchParams();
		if (params?.from) query.set('from', params.from);
		if (params?.to) query.set('to', params.to);
		const qs = query.toString();
		return this.requestList<WeekAvailability>(
			`/api/coach/clients/${userId}/availability${qs ? '?' + qs : ''}`
		);
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
