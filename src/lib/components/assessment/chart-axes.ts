// The rules the assessment charts draw their axes and their series by. Under
// half a kilo across a series is grip noise: an axis zoomed onto it draws 20.8
// and 20.9 kg a third of a chart apart and calls that a trend. The app draws
// its profile charts by the same numbers, in
// crimpy-app/lib/utils/assessment_chart_axes.dart. See Krakoer/crimpy#164.

// The narrowest value axis a chart draws, per unit, and the step its bounds are
// rounded to: five kilograms, ten seconds, five repetitions.
const MINIMUM_AXIS_SPAN: Record<string, number> = {
	kilograms: 5,
	seconds: 10,
	repetitions: 5
};

// A ratio to bodyweight is portal only. A tenth is about seven kilograms on a
// seventy kilo athlete, the same order as the kilogram span.
export const RATIO_AXIS_SPAN = 0.1;

export function minimumAxisSpan(unit: string, asRatios: boolean): number {
	if (asRatios) return RATIO_AXIS_SPAN;
	return MINIMUM_AXIS_SPAN[unit] ?? MINIMUM_AXIS_SPAN.kilograms;
}

// Rounded to a thousandth so a ratio step does not print as 1.2000000000000002.
// Only ever applied to a result.
function tidy(value: number): number {
	return Math.round(value * 1000) / 1000;
}

// A quotient a hair off a whole number from floating point (1.2 / 0.1 is
// 11.999999999999998) taken as that whole number before a floor or a ceiling,
// so a result sitting on a step is not pushed a whole step out. Far too fine to
// swallow a real excess: 25.0004 kg over 5 is 5.00008, and still widens the
// axis. The app snaps the same way.
function snapped(quotient: number): number {
	const whole = Math.round(quotient);
	return Math.abs(quotient - whole) < 1e-9 ? whole : quotient;
}

// The multiples of the span the gap between labels may take: 1, 2 and 4 of
// each power of ten, so the labels stay round numbers.
function niceMultiple(atLeast: number): number {
	for (let power = 1; ; power *= 10) {
		for (const multiple of [1, 2, 4]) {
			if (multiple * power >= atLeast) return multiple * power;
		}
	}
}

// The most gaps between labels an axis carries, so at most six labels.
const MAXIMUM_LABEL_GAPS = 5;

// The value axis of a chart holding `values`, and the gap between its labels.
// The narrowest axis is one span wide, from the lowest value rounded down to a
// multiple of the span, never under zero, labelled every fifth of it. A wider
// one is labelled every span, or a nice multiple of it when that would take
// more than six labels, and both its ends are rounded out to that gap, so the
// bottom and the top are always labelled. Null for no values.
export function valueAxisRange(
	values: number[],
	unit: string,
	asRatios: boolean
): { min: number; max: number; interval: number } | null {
	if (values.length === 0) return null;
	const step = minimumAxisSpan(unit, asRatios);
	const low = Math.max(0, Math.floor(snapped(Math.min(...values) / step)) * step);
	const high = Math.max(Math.ceil(snapped(Math.max(...values) / step)) * step, low + step);
	const steps = Math.round((high - low) / step);
	if (steps <= 1) return { min: tidy(low), max: tidy(high), interval: tidy(step / 5) };
	for (
		let multiple = niceMultiple(steps / MAXIMUM_LABEL_GAPS);
		;
		multiple = niceMultiple(multiple + 1)
	) {
		const interval = step * multiple;
		const min = Math.floor(snapped(low / interval)) * interval;
		const max = Math.ceil(snapped(high / interval)) * interval;
		if (Math.round((max - min) / interval) <= MAXIMUM_LABEL_GAPS) {
			return { min: tidy(min), max: tidy(max), interval: tidy(interval) };
		}
	}
}

// The date axis counts whole calendar days from the first tested day, and
// labels are written from that count by calendar arithmetic rather than by
// adding 24 hours, so a clock change cannot shift one onto the wrong day.
// The app plots its date axis the same way. See Krakoer/crimpy#164.
function startOfDay(at: number): Date {
	const date = new Date(at);
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Whole calendar days from the day `first` falls on to the day `at` falls on.
export function dayOffset(first: number, at: number): number {
	return Math.round((startOfDay(at).getTime() - startOfDay(first).getTime()) / 86_400_000);
}

// The calendar day `offset` days after the day `first` falls on.
export function dayAt(first: number, offset: number): Date {
	const day = startOfDay(first);
	return new Date(day.getFullYear(), day.getMonth(), day.getDate() + Math.round(offset));
}

// The gap in days between the date axis's labels, so the first and the last
// tested day are both labelled: the widest of a quarter, a third or a half of
// the span that divides it evenly, or the whole span, which labels only the
// two ends.
export function dateLabelInterval(spanDays: number): number {
	for (const parts of [4, 3, 2]) {
		if (spanDays >= parts && spanDays % parts === 0) return spanDays / parts;
	}
	return Math.max(1, spanDays);
}

// The calendar days the timestamps fall on. A chart is drawn from the second:
// a single test is a value, and a line through one day is not a trend.
export function testedDays(timestamps: number[]): number {
	return new Set(timestamps.map((at) => new Date(at).toDateString())).size;
}

export const CRITICAL_FORCE_ID = '55970ac0-4544-4945-80cd-4841f7c58fe5';

// One hue per metric, the hands of that metric told apart by line style: the
// left hand solid, the right dashed. The hands used to take sage and
// terracotta, which mean a stretching session and the primary action. Max
// force is ink; critical force is the blue, so the two stay apart wherever
// they are read together. The blue's other meanings (an "other" session or
// training type, the feed's calendar) sit on other tabs than the assessments;
// where they share the view, INK_SERIES is used instead. `line` paints the
// line and the markers, `text` the words naming the series, since --bl is
// under the text floor on white. The app's maxForceSeries and
// criticalForceSeries hold the same hues.
export interface SeriesTokens {
	line: string;
	text: string;
}

// Every metric in ink: where a hue already means a session activity or a
// training type, as on the Sessions tab and the program page.
export const INK_SERIES: SeriesTokens = { line: '--tx', text: '--tx' };

export function seriesTokens(assessmentId: string): SeriesTokens {
	if (assessmentId === CRITICAL_FORCE_ID) return { line: '--bl', text: '--bl-tx' };
	return INK_SERIES;
}
