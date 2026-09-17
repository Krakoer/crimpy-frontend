import { describe, expect, it } from 'vitest';
import type { TrainingItem } from '$lib/api/client';
import { emptyNoteError } from './note-text';

describe('emptyNoteError', () => {
	it('passes a note the coach wrote', () => {
		const items: TrainingItem[] = [{ type: 'free', free_text: 'Grimpe :' }];
		expect(emptyNoteError(items)).toBeNull();
	});

	it('catches the note a fresh block leaves behind', () => {
		expect(emptyNoteError([{ type: 'free', free_text: '' }])).not.toBeNull();
	});

	// The app plays whatever the field holds, and spaces play as nothing.
	it('catches a note holding whitespace only', () => {
		expect(emptyNoteError([{ type: 'free', free_text: '  \n ' }])).not.toBeNull();
	});

	// A note written by the app carries no free_text at all. It goes back out as
	// the null it came in as, which the app renders as "Free", so a coach editing
	// such a training is not stopped by a block they never wrote.
	it('leaves a note carrying no text at all alone', () => {
		expect(emptyNoteError([{ id: 'saved', type: 'free' }])).toBeNull();
	});

	it('names the root block the empty note sits in', () => {
		const items: TrainingItem[] = [
			{ type: 'exercise', reps: 5 },
			{ type: 'circuit', items: [{ type: 'group', items: [{ type: 'free', free_text: ' ' }] }] }
		];
		expect(emptyNoteError(items)).toBe(
			'A note needs some text for the athlete to read. Check block 2.'
		);
	});

	it('leaves every other block alone', () => {
		const items: TrainingItem[] = [
			{ type: 'exercise', reps: 5 },
			{ type: 'group', group_title: '', items: [{ type: 'repeater' }] }
		];
		expect(emptyNoteError(items)).toBeNull();
	});
});
