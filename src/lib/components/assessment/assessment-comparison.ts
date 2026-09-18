import type {
	AssessmentResponse,
	AssessmentSnapshot,
	AssessmentSnapshotResult
} from '$lib/api/client';

// The days an athlete actually tested on, newest first, as the API spells a day:
// the UTC date of the session. Taken from the UTC instant rather than from a
// local calendar day, because the server reads a day as ending at midnight UTC,
// and a session recorded just after midnight there would otherwise be asked for
// on a day that does not yet include it.
export function testedDays(records: AssessmentResponse[]): string[] {
	const days = new Set(records.map((record) => record.session_date.slice(0, 10)));
	return [...days].sort().reverse();
}

// A day as a coach reads it. The string is already a UTC calendar day, so it is
// split rather than parsed: running it through a Date would shift it by a
// timezone it does not have.
export function formatDay(day: string): string {
	const [year, month, date] = day.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC'
	});
}

// What a result is worth on one date, for one hand.
export interface ComparedValue {
	// The measurement as it is stored, in the assessment's own unit.
	raw: number;
	// When it was actually measured, which is not always the date asked for: a
	// snapshot carries the last value forward until a newer one replaces it.
	measuredAt: string;
	// The number drawn and compared. The ratio to the bodyweight for an
	// assessment that reads as one, the raw value otherwise. Absent when the
	// assessment reads as a ratio and no weight was on file that day, which is a
	// denominator a reader has to say out loud rather than invent.
	score?: number;
	// The weight the ratio was read against, set alongside a ratio score.
	bodyweightKg?: number;
}

export type ComparisonHand = 'single' | 'right' | 'left';

export interface ComparedHand {
	hand: ComparisonHand;
	before?: ComparedValue;
	after?: ComparedValue;
	// Set when the very same measurement answers both dates, so nothing was
	// measured in between. A zero delta would read as a test held steady, which
	// is a different statement from a test not run again.
	unchanged: boolean;
	delta?: number;
	percent?: number;
}

export interface ComparisonRow {
	key: string;
	assessmentId: string;
	label: string;
	unit: string;
	gripPosition: number;
	// A grip only means something on a hangboard assessment, which is what the
	// ones Crimpy ships are. A pull up count is not held on an edge.
	hasGrips: boolean;
	bodyweightRelative: boolean;
	hands: ComparedHand[];
}

// A weighted result read as a ratio: the whole load that hung off the fingers,
// bodyweight included, over the bodyweight alone. 25kg added at 71kg is 1.35,
// which is what makes two seasons comparable when the athlete's weight moved.
export function bodyweightScore(raw: number, bodyweightKg: number): number {
	return (bodyweightKg + raw) / bodyweightKg;
}

function comparedValue(
	raw: number | null | undefined,
	measuredAt: string | null | undefined,
	bodyweightRelative: boolean,
	bodyweightKg: number | null | undefined
): ComparedValue | undefined {
	if (raw === null || raw === undefined || !measuredAt) return undefined;
	if (!bodyweightRelative) return { raw, measuredAt, score: raw };
	if (bodyweightKg === null || bodyweightKg === undefined || bodyweightKg <= 0) {
		return { raw, measuredAt };
	}
	return { raw, measuredAt, score: bodyweightScore(raw, bodyweightKg), bodyweightKg };
}

function comparedHand(
	hand: ComparisonHand,
	before: ComparedValue | undefined,
	after: ComparedValue | undefined
): ComparedHand {
	const unchanged =
		before !== undefined && after !== undefined && before.measuredAt === after.measuredAt;
	if (!before || !after || before.score === undefined || after.score === undefined || unchanged) {
		return { hand, before, after, unchanged };
	}
	const delta = after.score - before.score;
	// A percentage of nothing is not a percentage. It takes a zero result to get
	// here, which a sensor can record, so it is answered with the absolute change
	// alone rather than with an infinity.
	const percent = before.score === 0 ? undefined : (delta / before.score) * 100;
	return { hand, before, after, unchanged, delta, percent };
}

function rowKey(assessmentId: string, gripPosition: number): string {
	return `${assessmentId}:${gripPosition}`;
}

// The two snapshots read side by side, one row per assessment and grip either of
// them holds. A row present on only one date keeps the side it has and leaves
// the other empty, which the table says rather than drawing as a fall to zero.
export function compareSnapshots(
	before: AssessmentSnapshot,
	after: AssessmentSnapshot
): ComparisonRow[] {
	const rows = new Map<string, ComparisonRow>();

	for (const snapshot of [before, after]) {
		for (const result of snapshot.results) {
			const key = rowKey(result.assessment_id, result.grip_position);
			if (rows.has(key)) continue;
			rows.set(key, {
				key,
				assessmentId: result.assessment_id,
				label: result.label,
				unit: result.unit,
				gripPosition: result.grip_position,
				hasGrips: !result.training_id,
				bodyweightRelative: result.bodyweight_relative,
				hands: []
			});
		}
	}

	const beforeByKey = new Map(
		before.results.map((r) => [rowKey(r.assessment_id, r.grip_position), r])
	);
	const afterByKey = new Map(
		after.results.map((r) => [rowKey(r.assessment_id, r.grip_position), r])
	);

	function sideValue(
		result: AssessmentSnapshotResult | undefined,
		bodyweightKg: number | null | undefined,
		bodyweightRelative: boolean,
		side: 'right' | 'left'
	): ComparedValue | undefined {
		return comparedValue(
			side === 'right' ? result?.right_value : result?.left_value,
			side === 'right' ? result?.right_measured_at : result?.left_measured_at,
			bodyweightRelative,
			bodyweightKg
		);
	}

	for (const row of rows.values()) {
		const was = beforeByKey.get(row.key);
		const now = afterByKey.get(row.key);
		// The definition reads as it stands now, so the later snapshot wins where
		// the two disagree: a label reworded between the dates names the same test.
		const definition = now ?? was;
		if (!definition) continue;
		row.label = definition.label;
		row.unit = definition.unit;
		row.bodyweightRelative = definition.bodyweight_relative;

		const relative = row.bodyweightRelative;
		const wasRight = sideValue(was, before.bodyweight_kg, relative, 'right');
		const wasLeft = sideValue(was, before.bodyweight_kg, relative, 'left');
		const nowRight = sideValue(now, after.bodyweight_kg, relative, 'right');
		const nowLeft = sideValue(now, after.bodyweight_kg, relative, 'left');

		if (definition.per_hand) {
			const hands = [
				comparedHand('left', wasLeft, nowLeft),
				comparedHand('right', wasRight, nowRight)
			];
			// A hand the athlete never did on either date has nothing to say, and
			// a line reading "not measured" against "not measured" says it forever.
			// Both empty only happens on a row that exists for its other hand, so
			// dropping them cannot empty the row.
			const measured = hands.filter((hand) => hand.before || hand.after);
			row.hands = measured.length > 0 ? measured : hands;
		} else {
			// A single value is stored on the right hand, the left staying empty, so
			// either side answers for it.
			row.hands = [comparedHand('single', wasRight ?? wasLeft, nowRight ?? nowLeft)];
		}
	}

	return [...rows.values()].sort((a, b) => {
		if (a.hasGrips !== b.hasGrips) return a.hasGrips ? -1 : 1;
		const byLabel = a.label.localeCompare(b.label);
		return byLabel !== 0 ? byLabel : a.gripPosition - b.gripPosition;
	});
}

// A score as the table prints it: two decimals for a ratio, since that is where
// a season of finger training shows, and the unit's own precision otherwise.
//
// Seconds and repetitions are whole numbers nearly always, and a rep count reads
// badly with a trailing zero, but a half second is a real result: the spreadsheet
// this table comes from writes 8.5 sec. Rounding it away would print the same
// number in both columns beside a progression saying they differ, so a value that
// is not whole keeps its decimal.
export function formatScore(value: ComparedValue, unit: string): string {
	if (value.score === undefined) return '--';
	if (value.bodyweightKg !== undefined) return value.score.toFixed(2);
	if (unit === 'kilograms') return value.score.toFixed(1);
	return Number.isInteger(value.score) ? value.score.toFixed(0) : value.score.toFixed(1);
}

// A change with its sign, so a gain and a loss read as different things at a
// glance.
export function formatPercent(percent: number): string {
	if (Math.abs(percent) < 0.05) return 'stable';
	return `${percent > 0 ? '+' : ''}${percent.toFixed(1)} %`;
}
