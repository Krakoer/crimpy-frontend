import type { Bodyweight } from '$lib/api/client';

// How far back a trend looks. A coach reading a strength number wants to know
// whether the athlete has been getting lighter or heavier lately, not since
// they signed up, and a season's worth of noise would swamp that.
export const TREND_WINDOW_DAYS = 30;

// How many measurements to ask the API for. The trend can only compare against
// a measurement it was given, so this has to cover the window even for an
// athlete who weighs in several times a day: at the API's own default of 60
// rows, three weigh-ins a day reach back 20 days and the comparison point is
// never in the page, so the card would say there is nothing older to compare
// for an athlete with a year of data. Sized well past that, and the endpoint
// refuses anything over 365.
export const TREND_SERIES_LIMIT = 365;

export interface BodyweightTrend {
	/// The weight in effect, which is what a ratio is read against.
	latest: Bodyweight;
	/// The measurement the trend is drawn from, absent when the series holds
	/// nothing older than the window.
	previous?: Bodyweight;
	/// latest minus previous, in kilograms. Absent when there is no previous.
	changeKg?: number;
}

/// The trend over the last [windowDays], from a series the API returns newest
/// first. Answers null for an athlete who has never recorded a weight, which a
/// caller has to say out loud rather than draw as zero.
///
/// The comparison point is the newest measurement at least a window old, not
/// the oldest in the series: a coach asking "since last month" means the weight
/// a month ago, and an athlete who weighs in daily would otherwise be compared
/// against their very first entry.
export function bodyweightTrend(
	series: Bodyweight[],
	now: Date = new Date(),
	windowDays: number = TREND_WINDOW_DAYS
): BodyweightTrend | null {
	const sorted = [...series].sort((a, b) => Date.parse(b.measured_at) - Date.parse(a.measured_at));
	const latest = sorted[0];
	if (!latest) return null;

	const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
	const previous = sorted.slice(1).find((entry) => Date.parse(entry.measured_at) <= cutoff);
	if (!previous) return { latest };

	return {
		latest,
		previous,
		changeKg: latest.weight_kg - previous.weight_kg
	};
}

/// The day a measurement was taken, as a coach reads it.
export function formatMeasuredOn(iso: string): string {
	return new Date(iso).toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	});
}

/// A weight as a coach reads it. One decimal, because that is the precision a
/// scale gives and the precision a ratio needs.
export function formatKg(weightKg: number): string {
	return `${weightKg.toFixed(1)} kg`;
}

/// A change with its sign, so "+0.4" and "-0.4" read as different things at a
/// glance. Answers an empty string for a change of less than 50g, which is
/// scale noise rather than a trend.
export function formatChangeKg(changeKg: number): string {
	if (Math.abs(changeKg) < 0.05) return '';
	return `${changeKg > 0 ? '+' : ''}${changeKg.toFixed(1)} kg`;
}
