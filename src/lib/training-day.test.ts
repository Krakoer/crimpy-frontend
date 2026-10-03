import { describe, expect, it } from 'vitest';
import { currentTrainingDay, formatTrainingDayShort, trainingDayOf } from './sessions';

describe('trainingDayOf', () => {
	it('reads the day the athlete device filed the session under', () => {
		// 00:30 on a Tuesday in Paris, which the app files under Monday.
		const session = { date: '2026-09-28T22:30:00Z', training_day: '2026-09-28' };
		expect(trainingDayOf(session)).toEqual(new Date(2026, 8, 28));
	});

	it('does not move the day with the clock it is read on', () => {
		// The instant falls on the 29th in UTC and east of it; the day stays.
		const session = { date: '2026-09-29T01:00:00Z', training_day: '2026-09-28' };
		expect(trainingDayOf(session)).toEqual(new Date(2026, 8, 28));
	});

	it('applies the 04:00 rule on this clock when the API sent no day', () => {
		const early = new Date(2026, 8, 29, 0, 30);
		const late = new Date(2026, 8, 29, 4, 0);
		expect(trainingDayOf({ date: early.toISOString() })).toEqual(new Date(2026, 8, 28));
		expect(trainingDayOf({ date: late.toISOString() })).toEqual(new Date(2026, 8, 29));
	});
});

describe('currentTrainingDay', () => {
	it('is still yesterday until 04:00', () => {
		expect(currentTrainingDay(new Date(2026, 8, 29, 3, 59))).toEqual(new Date(2026, 8, 28));
	});

	it('turns over at 04:00', () => {
		expect(currentTrainingDay(new Date(2026, 8, 29, 4, 0))).toEqual(new Date(2026, 8, 29));
	});

	it('crosses a month', () => {
		expect(currentTrainingDay(new Date(2026, 9, 1, 1, 0))).toEqual(new Date(2026, 8, 30));
	});
});

describe('formatTrainingDayShort', () => {
	it('names the training day rather than the date of the instant', () => {
		const session = { date: '2026-09-28T22:30:00Z', training_day: '2026-09-28' };
		expect(formatTrainingDayShort(session)).toBe('Mon, 28 Sept 2026');
	});
});
