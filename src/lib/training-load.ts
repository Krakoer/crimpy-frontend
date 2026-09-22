import type { WeeklyTrainingLoad } from '$lib/api/client';

// The interpretation bands the coach reads the weekly figures against.
//
// They come from the coaching spreadsheet this view replaces. They are a common
// formulation rather than anything Crimpy has measured, so everything here is
// worded as the coach's own reference and never as a verdict the portal
// pronounces. The wording lives in this one module so the chart, the table and
// the legend cannot drift apart about what a band means.
export type BandTone = 'low' | 'good' | 'high' | 'unlabelled';

export interface Band {
	// The lower edge, inclusive. Null on the band that opens the scale.
	from: number | null;
	// The upper edge, exclusive. Null on the band that closes it.
	to: number | null;
	label: string;
	tone: BandTone;
}

// The spreadsheet names three AL:CL bands and leaves 1.3 to 1.5 unnamed. That
// hole is kept as a hole rather than closed by guessing: widening "optimal" to
// 1.5 or dropping "danger" to 1.3 would both put Crimpy's own opinion behind
// the coach's numbers, and a week landing there would silently read as one or
// the other. So the range is its own band, drawn in a neutral tone and labelled
// as outside what the sheet defines, which is a question a human can answer by
// correcting the boundary.
export const UNLABELLED_RATIO_BAND_NOTE =
	'The reference sheet labels below 0.8, 0.8 to 1.3 and above 1.5. It says nothing about 1.3 to 1.5, so a week landing there is shown as unlabelled rather than sorted into a neighbouring band.';

export const RATIO_BANDS: Band[] = [
	{ from: null, to: 0.8, label: 'Undertraining', tone: 'low' },
	{ from: 0.8, to: 1.3, label: 'Optimal workload', tone: 'good' },
	{ from: 1.3, to: 1.5, label: 'Not labelled by the sheet', tone: 'unlabelled' },
	{ from: 1.5, to: null, label: 'Danger zone', tone: 'high' }
];

export const ACUTE_LOAD_BANDS: Band[] = [
	{ from: null, to: 2000, label: 'Undertraining', tone: 'low' },
	{ from: 2000, to: 4000, label: 'Optimal', tone: 'good' },
	{ from: 4000, to: null, label: 'Danger zone', tone: 'high' }
];

export const LOAD_CHANGE_BANDS: Band[] = [
	{ from: null, to: 90, label: 'Deload or undertraining', tone: 'low' },
	{ from: 90, to: 100, label: 'Maintaining', tone: 'good' },
	{ from: 100, to: 110, label: 'Optimal progression', tone: 'good' },
	{ from: 110, to: null, label: 'Danger zone', tone: 'high' }
];

// The upper edge is exclusive so the bands tile the scale without a value
// belonging to two of them. 1.3 is therefore optimal and 1.5 is danger, which
// is how the sheet reads them.
export function bandFor(bands: Band[], value: number | null): Band | null {
	if (value === null || !Number.isFinite(value)) return null;
	return (
		bands.find(
			(band) => (band.from === null || value >= band.from) && (band.to === null || value < band.to)
		) ?? null
	);
}

// The legend's own wording for a band, so the range and its name are built in
// one place rather than reassembled in the markup.
export function bandRangeLabel(band: Band): string {
	if (band.from === null) return `below ${band.to} ${band.label.toLowerCase()}`;
	if (band.to === null) return `above ${band.from} ${band.label.toLowerCase()}`;
	return `${band.from} to ${band.to} ${band.label.toLowerCase()}`;
}

// Alpine has no palette for "worse", so the tones borrow the existing semantic
// colours: gold for under, sage for on target, terracotta for over, and the
// muted text colour for the range the sheet never named. Plum is the crimpy
// accent and is deliberately not used, so nothing here reads as a brand mark.
// The one map, as an Alpine variable name, so the chart can resolve it off the
// document the way it resolves the rest of its palette and the legend swatch
// cannot end up a different colour from the bar it keys.
export function toneVariable(tone: BandTone): string {
	switch (tone) {
		case 'low':
			return '--gd';
		case 'good':
			return '--gn';
		case 'high':
			return '--pr';
		case 'unlabelled':
			// Muted rather than faint: the band is deliberately neutral, but a
			// coach still has to be able to read the number it colours.
			return '--tx2';
	}
}

export function toneColor(tone: BandTone): string {
	return `var(${toneVariable(tone)})`;
}

// The same band, in the form it is written as small text on the white panel the
// load cards are drawn on. Every accent is under the 4.5:1 floor there, gold
// worst at 2.32:1, so a figure or a table cell takes the text token while the
// chart bars and the legend swatch keep the mark. See Krakoer/crimpy#128.
export function toneTextVariable(tone: BandTone): string {
	switch (tone) {
		case 'low':
			return '--gd-tx';
		case 'good':
			return '--gn-tx';
		case 'high':
			return '--pr-tx';
		case 'unlabelled':
			return '--tx2';
	}
}

export function toneTextColor(tone: BandTone): string {
	return `var(${toneTextVariable(tone)})`;
}

// The form a band takes as a mark on white: an icon, or a figure large enough
// for the 3:1 floor, which the 26px headline tiles are. Sage, terracotta and
// the muted token clear 3:1 and stay; only gold, at 2.32:1, has to move.
export function toneMarkVariable(tone: BandTone): string {
	return tone === 'low' ? toneTextVariable(tone) : toneVariable(tone);
}

export function toneMarkColor(tone: BandTone): string {
	return `var(${toneMarkVariable(tone)})`;
}

export function formatWeekLabel(weekStart: string): string {
	const date = new Date(`${weekStart}T00:00:00`);
	return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// A missing figure is a gap, never a zero. Every caller renders it as the same
// dash so a week the athlete did not rate can never be read as a week they
// trained at zero effort.
export const NO_VALUE = '--';

// The figures are banded at the precision they are printed at, not at full
// precision. An acute load of 1999.6 prints as "2,000", and banding the raw
// value would caption that "Undertraining" while the legend directly below says
// 2000 to 4000 is optimal. The band is a reading of what the coach can see.
export function displayedLoad(value: number | null): number | null {
	return value === null ? null : Math.round(value);
}

export function displayedRatio(value: number | null): number | null {
	return value === null ? null : Number(value.toFixed(2));
}

export function displayedPercent(value: number | null): number | null {
	return value === null ? null : Math.round(value);
}

export function formatLoad(value: number | null): string {
	const displayed = displayedLoad(value);
	return displayed === null ? NO_VALUE : displayed.toLocaleString('en-GB');
}

export function formatRatio(value: number | null): string {
	const displayed = displayedRatio(value);
	return displayed === null ? NO_VALUE : displayed.toFixed(2);
}

export function formatRpe(value: number | null): string {
	return value === null ? NO_VALUE : value.toFixed(1);
}

export function formatPercent(value: number | null): string {
	const displayed = displayedPercent(value);
	return displayed === null ? NO_VALUE : `${displayed}%`;
}

export function formatMinutes(minutes: number): string {
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, '0')}`;
}

// The climbing share of the minutes that are either climbing or strength.
// Stretching and anything logged as other are neither, so they stay out of the
// split rather than being forced onto one side of it. Null when the week holds
// none of either, since a ratio of nothing to nothing says nothing.
export function climbingShare(week: WeeklyTrainingLoad): number | null {
	const total = week.climbing_minutes + week.strength_minutes;
	return total === 0 ? null : week.climbing_minutes / total;
}

// What the mean RPE actually speaks for, in the coach's words. A week where
// half the sessions went unrated is a weaker number than one where none did,
// and the ECHEC sessions are named rather than folded in anywhere.
export function ratingCoverage(week: WeeklyTrainingLoad): string {
	if (week.session_count === 0) return 'No sessions';

	const parts = [`${week.rated_sessions} of ${week.session_count} rated`];
	if (week.failed_sessions > 0) {
		parts.push(`${week.failed_sessions} ECHEC, outside the mean`);
	}
	const unrated = week.session_count - week.rated_sessions - week.failed_sessions;
	if (unrated > 0) {
		parts.push(`${unrated} not rated, outside the mean`);
	}
	return parts.join(' - ');
}

// Why this week's own load is not known. The backend leaves acute_load null for
// two different reasons and they must not share a caption: nobody rated the
// sessions, or they were rated and none of them recorded a duration, which is
// the case a coach would otherwise read as "you did not rate this" while the
// mean RPE sits in the tile beside it.
export function unknownLoadNote(week: WeeklyTrainingLoad): string {
	if (week.rated_sessions > 0) return 'No session this week recorded a duration';
	return 'Not rated, so not known';
}

// What to say under an AL:CL that has no value. The ratio is missing for three
// quite different reasons: there is no baseline to divide by, the baseline is a
// real zero because nothing was trained, or the baseline is there and it is this
// week's own load that is not known.
export function missingRatioNote(week: WeeklyTrainingLoad): string {
	if (week.chronic_load === null) return 'No history behind this week yet';
	if (week.chronic_load === 0) return 'Nothing trained in the last three weeks';
	return week.rated_sessions > 0
		? 'No session this week recorded a duration, so there is nothing to compare'
		: 'This week is not rated, so there is nothing to compare';
}

// Why a chronic load is not yet the three week mean it will become.
//
// chronic_weeks counts the weeks the mean actually rested on, and the backend
// skips any week whose own load is unknown, the current one included. So a 1
// means "this week alone" only when this week's load is known; otherwise it
// means the baseline is one earlier week and the ratio is not 1.00 at all, it
// is missing. Saying "1.00 by construction" there would be wrong twice over.
export function chronicBaselineNote(week: WeeklyTrainingLoad): string | null {
	if (week.chronic_load === null) return 'No history behind this week yet.';
	if (week.chronic_weeks >= 3) return null;
	if (week.chronic_weeks === 1) {
		return week.acute_load === null
			? 'Baseline rests on a single earlier week.'
			: 'Baseline is this week alone, so the ratio is 1.00 by construction.';
	}
	return `Baseline is ${week.chronic_weeks} weeks rather than 3.`;
}

// How far back the coachee page asks for. Twelve weeks is a training block and
// change, which is enough for the three week chronic mean to have settled and
// for a deload to still be visible behind the current week.
export const TRAINING_LOAD_WEEKS = 12;
