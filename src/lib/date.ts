/** Formats a Date as YYYY-MM-DD in local time. The API speaks plain days, and
 *  toISOString would shift a local midnight into the previous day west of UTC,
 *  so a week would be matched against the wrong Monday. */
export function toDateOnly(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/** Returns the Monday (YYYY-MM-DD) of the week containing the given date.
 *  Program weeks run Monday to Sunday, so program start dates are snapped to a
 *  Monday before being sent to the API. */
export function mondayOf(dateStr: string): string {
	const d = new Date(`${dateStr}T00:00:00`);
	const day = d.getDay(); // 0 = Sunday ... 6 = Saturday
	const diff = day === 0 ? -6 : 1 - day;
	d.setDate(d.getDate() + diff);
	return toDateOnly(d);
}
