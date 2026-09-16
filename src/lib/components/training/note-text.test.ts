import { describe, expect, it } from 'vitest';
import type { TrainingItem } from '$lib/api/client';
import { hasEmptyNote } from './note-text';

describe('hasEmptyNote', () => {
	it('reads a note the coach wrote as filled in', () => {
		const items: TrainingItem[] = [{ type: 'free', free_text: 'Grimpe :' }];
		expect(hasEmptyNote(items)).toBe(false);
	});

	it('catches the note a fresh block leaves behind', () => {
		expect(hasEmptyNote([{ type: 'free', free_text: '' }])).toBe(true);
	});

	// The app plays whatever the field holds, and spaces play as nothing.
	it('catches a note holding whitespace only', () => {
		expect(hasEmptyNote([{ type: 'free', free_text: '  \n ' }])).toBe(true);
	});

	// A note written by a client that omitted the field entirely is as empty as
	// one holding the empty string.
	it('catches a note carrying no text at all', () => {
		expect(hasEmptyNote([{ type: 'free' }])).toBe(true);
	});

	it('finds one nested inside a container', () => {
		const items: TrainingItem[] = [
			{ type: 'circuit', items: [{ type: 'group', items: [{ type: 'free', free_text: ' ' }] }] }
		];
		expect(hasEmptyNote(items)).toBe(true);
	});

	it('leaves every other block alone', () => {
		const items: TrainingItem[] = [
			{ type: 'exercise', reps: 5 },
			{ type: 'group', group_title: '', items: [{ type: 'repeater' }] }
		];
		expect(hasEmptyNote(items)).toBe(false);
	});
});
