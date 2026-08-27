// How an emom interval reads wherever it is shown. The editor, the read-only
// view and the session card all name the same number, so they say it the same
// way rather than each rounding it differently.
export function formatInterval(seconds: number): string {
	const safe = Math.max(0, Math.round(seconds));
	const m = Math.floor(safe / 60);
	const s = safe % 60;
	if (m > 0 && s > 0) return `${m}mn ${s}s`;
	if (m > 0) return `${m}mn`;
	return `${s}s`;
}
