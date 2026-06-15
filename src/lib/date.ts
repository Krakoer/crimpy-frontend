/** Returns the Monday (YYYY-MM-DD) of the week containing the given date.
 *  Program weeks run Monday to Sunday, so program start dates are snapped to a
 *  Monday before being sent to the API. */
export function mondayOf(dateStr: string): string {
	const d = new Date(`${dateStr}T00:00:00`);
	const day = d.getDay(); // 0 = Sunday ... 6 = Saturday
	const diff = day === 0 ? -6 : 1 - day;
	d.setDate(d.getDate() + diff);
	const year = d.getFullYear();
	const month = String(d.getMonth() + 1).padStart(2, '0');
	const dayOfMonth = String(d.getDate()).padStart(2, '0');
	return `${year}-${month}-${dayOfMonth}`;
}
