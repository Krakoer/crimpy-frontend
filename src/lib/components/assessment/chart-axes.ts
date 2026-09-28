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
function tidy(value: number): number {
	return Math.round(value * 1000) / 1000;
}

// The value axis of a chart holding `values`: from the lowest rounded down to a
// multiple of the span, never under zero, to the highest rounded up to one, and
// at least the span wide. Null for no values.
export function valueAxisRange(
	values: number[],
	unit: string,
	asRatios: boolean
): { min: number; max: number; interval: number } | null {
	if (values.length === 0) return null;
	const step = minimumAxisSpan(unit, asRatios);
	const min = Math.max(0, tidy(Math.floor(tidy(Math.min(...values) / step)) * step));
	const max = Math.max(tidy(Math.ceil(tidy(Math.max(...values) / step)) * step), tidy(min + step));
	return { min, max, interval: axisInterval(max - min, step) };
}

// The gap between the value axis's labels: a fifth of the span on the narrowest
// axis, then whole spans, widened so no chart carries more than six. The bounds
// are multiples of it, so the axis never has to squeeze in an extra label for
// an edge that falls between two ticks.
function axisInterval(width: number, step: number): number {
	const steps = Math.round(width / step);
	if (steps <= 1) return tidy(step / 5);
	return tidy(step * Math.ceil(steps / 6));
}

// The calendar days the timestamps fall on. A chart is drawn from the second:
// a single test is a value, and a line through one day is not a trend.
export function testedDays(timestamps: number[]): number {
	return new Set(timestamps.map((at) => new Date(at).toDateString())).size;
}

const CRITICAL_FORCE_ID = '55970ac0-4544-4945-80cd-4841f7c58fe5';

// One hue per metric, the hands of that metric told apart by line style: the
// left hand solid, the right dashed. The hands used to take sage and
// terracotta, which mean a stretching session and the primary action. Max
// force is ink; critical force is the blue, so the two stay apart wherever
// they are read together. The blue's other meanings (an "other" session, the
// feed's calendar) sit on other tabs than the assessments. `line` paints the
// line and the markers, `text` the words naming the series, since --bl is
// under the text floor on white. The app's maxForceSeries and
// criticalForceSeries hold the same hues.
export interface SeriesTokens {
	line: string;
	text: string;
}

export function seriesTokens(assessmentId: string): SeriesTokens {
	if (assessmentId === CRITICAL_FORCE_ID) return { line: '--bl', text: '--bl-tx' };
	return { line: '--tx', text: '--tx' };
}
