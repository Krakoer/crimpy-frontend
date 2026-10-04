/** Formats a Date as YYYY-MM-DD in local time. The API speaks plain days, and
 *  toISOString would shift a local midnight into the previous day west of UTC,
 *  so a week would be matched against the wrong Monday. */
export function toDateOnly(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/** The day every week opens on, everywhere in Crimpy and whatever the browser's
 *  locale says: weeks run Monday to Sunday. Indexed the way Date.getDay counts,
 *  0 being Sunday. */
export const FIRST_DAY_OF_WEEK = 1;

/** The weekday names in the order a week is laid out, Monday first. */
export const WEEKDAY_SHORT_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** Where a day sits in its week, 0 for Monday to 6 for Sunday. */
export function dayOfWeekIndex(date: Date): number {
	return (date.getDay() - FIRST_DAY_OF_WEEK + 7) % 7;
}

/** The Monday of the week holding a local date, at local midnight. Stepped with
 *  setDate rather than by subtracting milliseconds, so a week with a daylight
 *  saving change in it still lands on midnight. */
export function startOfWeek(date: Date): Date {
	const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	monday.setDate(monday.getDate() - dayOfWeekIndex(monday));
	return monday;
}

/** Returns the Monday (YYYY-MM-DD) of the week containing the given date.
 *  Program weeks run Monday to Sunday, so program start dates are snapped to a
 *  Monday before being sent to the API. */
export function mondayOf(dateStr: string): string {
	return toDateOnly(startOfWeek(new Date(`${dateStr.slice(0, 10)}T00:00:00`)));
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** How long ago an instant was, in the terms a feed reads best: minutes for the
 *  last hour, then hours, then days, then the calendar date once the day is far
 *  enough back that "23 days ago" says less than the date does. A future instant
 *  reads as "just now" rather than a negative age, which is what a session
 *  logged with tomorrow's date would otherwise produce. */
export function timeAgo(iso: string, now: Date = new Date()): string {
	const elapsed = now.getTime() - new Date(iso).getTime();
	if (elapsed < MINUTE_MS) return 'just now';
	if (elapsed < HOUR_MS) {
		const minutes = Math.floor(elapsed / MINUTE_MS);
		return `${minutes}m ago`;
	}
	if (elapsed < DAY_MS) {
		const hours = Math.floor(elapsed / HOUR_MS);
		return `${hours}h ago`;
	}
	const days = Math.floor(elapsed / DAY_MS);
	if (days === 1) return 'yesterday';
	if (days < 7) return `${days} days ago`;
	return formatDayMonth(iso, now);
}

/** A day and month, carrying the year only once the date is not in the year
 *  being read from, since "30 May" says nothing about which May it was. */
export function formatDayMonth(iso: string, now: Date = new Date()): string {
	const date = new Date(iso);
	return date.toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric'
	});
}
