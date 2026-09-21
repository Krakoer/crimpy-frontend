import type { AssessmentResponse } from '$lib/api/client';
import { unitLabel } from '$lib/assessments';
import { formatDayMonth } from '$lib/date';

// How a bodyweight relative result is read, in one place, because the cards, the
// history table, the chart and the two date comparison all draw the same
// measurement and a second copy of this rule would let them disagree about what
// it is worth.
//
// The denominator itself is not chosen here. The server sends the weigh-in each
// result has to be divided by, the last one taken at or before the session,
// which is the rule the snapshot the comparison reads already answered by. What
// is decided here is whether that weigh-in is still near enough to divide by,
// and what the screen says when it is not.

// Past this, a weigh-in says what the athlete weighed some other month, and a
// ratio built on it reads as a strength change the athlete never made. A month
// is the span a coach already reads a weight over, which is its own decision and
// not TREND_WINDOW_DAYS: that one says how far back the bodyweight card looks for
// something to compare against, and moving one should not move the other.
export const STALE_DENOMINATOR_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

// Why an assessment that reads as a ratio is showing kilograms instead.
export type MissingRatio = 'no-weigh-in' | 'stale';

// The weigh-in a record divides by, answered without a measurement to divide.
// A row whose two hands were pulled in the same session shares one denominator,
// and naming it under each hand in turn says the same thing twice.
export interface DenominatorReading {
	// The weigh-in that may be divided by, and when it was taken. Set together
	// and absent together: a weight shown with no day cannot be told apart from
	// a stale one, which is the whole point of sending the day.
	bodyweightKg?: number;
	weighedAt?: string;
	missing?: MissingRatio;
}

export interface BodyweightReading extends DenominatorReading {
	// The measurement as it is stored, always shown: a ratio without the load
	// that produced it cannot be checked, and it is all there is when the ratio
	// has to be declined.
	raw: number;
	// The whole load over the bodyweight it hung from. Absent when no weigh-in
	// near enough to the result was on file.
	ratio?: number;
}

// A weighted result read as a ratio: the whole load that hung off the fingers,
// bodyweight included, over the bodyweight alone. 25kg added at 71kg is 1.35,
// which is what makes two seasons comparable when the athlete's weight moved.
export function bodyweightScore(raw: number, bodyweightKg: number): number {
	return (bodyweightKg + raw) / bodyweightKg;
}

// How far the weigh-in sits before the result it answers for. Negative for a
// weigh-in taken later the same day, which the server widens to when nothing
// precedes the result, and which is not stale by any reading.
function denominatorAgeDays(measuredAt: string, weighedAt: string): number {
	return (Date.parse(measuredAt) - Date.parse(weighedAt)) / DAY_MS;
}

// Whether the weigh-in the server picked may be divided by at all, which is the
// one judgement this module makes and the only one the whole tab shares.
export function readDenominator(
	measuredAt: string,
	bodyweightKg: number | null | undefined,
	weighedAt: string | null | undefined
): DenominatorReading {
	// The weight and its date are one fact, and half of it is not a weigh-in:
	// without the day there is nothing to measure staleness against, and a
	// weight alone cannot be shown to be recent.
	if (bodyweightKg === null || bodyweightKg === undefined || bodyweightKg <= 0 || !weighedAt) {
		return { missing: 'no-weigh-in' };
	}
	if (denominatorAgeDays(measuredAt, weighedAt) > STALE_DENOMINATOR_DAYS) {
		return { missing: 'stale' };
	}
	return { bodyweightKg, weighedAt };
}

// The reading of one measurement against the weigh-in the server picked for it.
// An assessment that does not read as a ratio comes back as the raw value alone,
// so a caller can hand every result through here rather than branching first.
export function readBodyweightRatio(
	raw: number,
	measuredAt: string,
	bodyweightRelative: boolean,
	bodyweightKg: number | null | undefined,
	weighedAt: string | null | undefined
): BodyweightReading {
	if (!bodyweightRelative) return { raw };
	const denominator = readDenominator(measuredAt, bodyweightKg, weighedAt);
	if (denominator.bodyweightKg === undefined) return { raw, ...denominator };
	return { raw, ratio: bodyweightScore(raw, denominator.bodyweightKg), ...denominator };
}

// The weigh-in a recorded result would divide by, for a caller naming it once
// rather than under each hand. Null for an assessment that does not read as a
// ratio, which has no denominator to name.
export function readRecordDenominator(record: AssessmentResponse): DenominatorReading | null {
	if (!record.bodyweight_relative) return null;
	return readDenominator(record.session_date, record.bodyweight_kg, record.bodyweight_measured_at);
}

// One recorded result read against the weigh-in that travels with it. The result
// was measured on the day of the session that recorded it, which is the instant
// the server picked the weigh-in for.
export function readRecordRatio(
	record: AssessmentResponse,
	raw: number | null | undefined
): BodyweightReading | null {
	if (raw === null || raw === undefined) return null;
	return readBodyweightRatio(
		raw,
		record.session_date,
		record.bodyweight_relative,
		record.bodyweight_kg,
		record.bodyweight_measured_at
	);
}

// What the number under a hand actually is: a ratio where the result reads as
// one, the unit it was measured in otherwise. A ratio is not measured in
// kilograms, so a surface says what it is reading rather than naming a unit the
// number does not carry. Said here because the cards, the summary beside the
// sessions and the session detail all head their numbers with it, and a copy per
// surface would let one of them say something else.
export function readingLabel(bodyweightRelative: boolean, unit: string): string {
	return bodyweightRelative ? 'ratio to bodyweight' : unitLabel(unit);
}

// A ratio as every surface prints it: two decimals, since that is where a season
// of finger training shows.
export function formatRatio(ratio: number): string {
	return ratio.toFixed(2);
}

// Why there is no ratio, in the same words wherever it is said. Short enough to
// sit under a number without pushing the card around.
export function missingRatioLabel(missing: MissingRatio): string {
	return missing === 'stale' ? 'no recent weight' : 'no weight on file';
}

// The denominator a surface divides by, named once for everything that shares
// it: "ratio to 71.0 kg, weighed 10 Mar", or why there is none. One session is
// one weigh-in, so a card with two hands and a history row with two hands both
// say this once rather than under each hand.
export function formatDenominatorNote(
	reading: DenominatorReading,
	unitName: string,
	now: Date = new Date()
): string {
	if (reading.bodyweightKg === undefined || reading.weighedAt === undefined) {
		return reading.missing ? `${unitName}, ${missingRatioLabel(reading.missing)}` : '';
	}
	return `ratio to ${reading.bodyweightKg.toFixed(1)} kg, weighed ${formatDayMonth(
		reading.weighedAt,
		now
	)}`;
}

// A weigh-in that went stale is a caution the athlete can fix by stepping on the
// scales; one that never happened is an absence.
//
// Both are the text tokens rather than the base ones: this is an eleven pixel
// line of writing on a panel, and layout.css says there that --rd and --gd read
// under the contrast floor at that size while --rd-tx and --gd-tx clear it.
export function denominatorNoteColor(reading: DenominatorReading): string {
	if (reading.bodyweightKg !== undefined) return 'var(--tx3)';
	return reading.missing === 'stale' ? 'var(--gd-tx)' : 'var(--rd-tx)';
}

// What the ratio was built from, so a coach can check it and can tell a
// denominator weighed the same morning from one weeks old: "25.0 kg at 71.0 kg,
// 10 Mar".
export function formatRatioBasis(reading: BodyweightReading, now: Date = new Date()): string {
	if (reading.bodyweightKg === undefined || reading.weighedAt === undefined) return '';
	return `${reading.raw.toFixed(1)} kg at ${reading.bodyweightKg.toFixed(1)} kg, ${formatDayMonth(
		reading.weighedAt,
		now
	)}`;
}
