import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './client';

/** The endpoints that cut their weeks on the coach's calendar are read through
 *  one helper, so these exercise the real client against a stubbed network
 *  rather than the helper in isolation. */

const API_URL = 'http://api.test';

interface Answer {
	status: number;
	body: unknown;
}

let sent: URL[] = [];
let answer: (url: URL) => Answer;

function stubNetwork(): void {
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: RequestInfo | URL) => {
			const raw = String(input);
			if (raw.endsWith('/config.json')) {
				return new Response(JSON.stringify({ apiUrl: API_URL }), { status: 200 });
			}
			const url = new URL(raw);
			sent.push(url);
			const { status, body } = answer(url);
			return new Response(JSON.stringify(body), {
				status,
				headers: { 'Content-Type': 'application/json' }
			});
		})
	);
}

function stubZone(timeZone: string | undefined): void {
	vi.stubGlobal('Intl', {
		DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone }) })
	});
}

function stubThrowingZone(): void {
	vi.stubGlobal('Intl', {
		DateTimeFormat: () => {
			throw new Error('no Intl data');
		}
	});
}

const series = { weeks: [{ week_start: '2026-03-02' }] };

/** What the backend answers a zone name it will not resolve: it holds names to
 *  the shape Area/Location, so an abbreviation such as CET is a 400. */
function refuseZone(url: URL): Answer {
	if (url.searchParams.has('timezone')) {
		return {
			status: 400,
			body: { error: 'timezone must be an IANA zone name of the form Area/Location' }
		};
	}
	return { status: 200, body: series };
}

beforeEach(() => {
	sent = [];
	answer = () => ({ status: 200, body: series });
	stubNetwork();
	stubZone('Europe/Paris');
	vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-120);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('the clock sent to the endpoints that cut weeks', () => {
	it('sends the zone name alongside the offset on the training load', async () => {
		await apiClient.getClientTrainingLoad('coachee-1', 12);

		expect(sent).toHaveLength(1);
		expect(sent[0].pathname).toBe('/api/coach/clients/coachee-1/training-load');
		expect(sent[0].searchParams.get('weeks')).toBe('12');
		expect(sent[0].searchParams.get('timezone')).toBe('Europe/Paris');
		expect(sent[0].searchParams.get('tz_offset_minutes')).toBe('120');
	});

	it('sends the zone name alongside the offset on the todo list', async () => {
		await apiClient.getCoachTodo();

		expect(sent).toHaveLength(1);
		expect(sent[0].pathname).toBe('/api/coach/todo');
		expect(sent[0].searchParams.get('timezone')).toBe('Europe/Paris');
		expect(sent[0].searchParams.get('tz_offset_minutes')).toBe('120');
	});

	it('still reads the series when the server refuses the browser zone', async () => {
		stubZone('CET');
		answer = refuseZone;

		await expect(apiClient.getClientTrainingLoad('coachee-1', 12)).resolves.toEqual(series);

		expect(sent).toHaveLength(2);
		expect(sent[0].searchParams.get('timezone')).toBe('CET');
		expect(sent[1].searchParams.has('timezone')).toBe(false);
		expect(sent[1].searchParams.get('weeks')).toBe('12');
		expect(sent[1].searchParams.get('tz_offset_minutes')).toBe('120');
	});

	it('still reads the todo list when the server refuses the browser zone', async () => {
		stubZone('CET');
		answer = refuseZone;

		await expect(apiClient.getCoachTodo()).resolves.toEqual(series);

		expect(sent).toHaveLength(2);
		expect(sent[1].searchParams.has('timezone')).toBe(false);
		expect(sent[1].searchParams.get('tz_offset_minutes')).toBe('120');
	});

	it.each([
		['an empty name', ''],
		['no name at all', undefined]
	])('leaves the zone out when the browser reports %s', async (_label, timeZone) => {
		stubZone(timeZone);

		await apiClient.getClientTrainingLoad('coachee-1', 12);

		expect(sent).toHaveLength(1);
		expect(sent[0].searchParams.has('timezone')).toBe(false);
		expect(sent[0].searchParams.get('tz_offset_minutes')).toBe('120');
	});

	it('leaves the zone out when the browser has no Intl to ask', async () => {
		stubThrowingZone();

		await apiClient.getClientTrainingLoad('coachee-1', 12);

		expect(sent).toHaveLength(1);
		expect(sent[0].searchParams.has('timezone')).toBe(false);
	});

	it('surfaces a 400 that the zone did not cause', async () => {
		answer = () => ({ status: 400, body: { error: 'weeks must be between 1 and 52' } });

		await expect(apiClient.getClientTrainingLoad('coachee-1', 99)).rejects.toThrow(
			'weeks must be between 1 and 52'
		);
	});

	it('surfaces a failure that is not a 400', async () => {
		answer = () => ({ status: 500, body: { error: 'internal' } });

		await expect(apiClient.getClientTrainingLoad('coachee-1', 12)).rejects.toThrow('internal');
		expect(sent).toHaveLength(1);
	});
});
