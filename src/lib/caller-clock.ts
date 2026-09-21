/** The coach's own clock, which the endpoints cutting weeks on a Monday
 *  midnight have to be told because the server cannot read it from its own.
 *
 *  A zone name carries the daylight saving rules, so a Monday months back is
 *  the one the coach actually lived through. An offset only describes the clock
 *  at the moment of the request, which puts every boundary on the far side of a
 *  change an hour out. Both are sent together: the offset stays the fallback
 *  for a request whose zone the server will not take. */

/** The offset east of UTC in minutes, which is the negation of what the Date
 *  API reports. */
export function callerOffsetMinutes(): number {
	return -new Date().getTimezoneOffset();
}

/** The IANA zone name the browser resolves to, empty when it has none to give.
 *  An engine without a working Intl leaves the zone out of the request rather
 *  than taking the whole call down with it. */
export function callerTimeZone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
	} catch {
		return '';
	}
}
