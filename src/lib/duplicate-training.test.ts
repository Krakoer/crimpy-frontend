import { describe, expect, it } from 'vitest';
import { copyTitle, trainingCopyRequest } from './duplicate-training';
import type { Training } from '$lib/api/client';

function training(overrides: Partial<Training> = {}): Training {
	return {
		id: 'training-1',
		user_id: 'coach-1',
		title: 'Hangboard A',
		training_type: 'hangboard',
		created_at: '',
		updated_at: '',
		items: [],
		...overrides
	};
}

describe('copyTitle', () => {
	it('suffixes a title nothing else holds', () => {
		expect(copyTitle('Hangboard A', ['Hangboard A'])).toBe('Hangboard A (copy)');
	});

	it('numbers the next copy rather than repeating the first', () => {
		expect(copyTitle('Hangboard A', ['Hangboard A', 'Hangboard A (copy)'])).toBe(
			'Hangboard A (copy 2)'
		);
		expect(
			copyTitle('Hangboard A', ['Hangboard A', 'Hangboard A (copy)', 'Hangboard A (copy 2)'])
		).toBe('Hangboard A (copy 3)');
	});

	// Duplicating a duplicate names the copy after the original, so a library
	// does not fill up with "(copy) (copy) (copy)".
	it('numbers from the original when a copy is itself duplicated', () => {
		expect(copyTitle('Hangboard A (copy)', ['Hangboard A', 'Hangboard A (copy)'])).toBe(
			'Hangboard A (copy 2)'
		);
		expect(
			copyTitle('Hangboard A (copy 2)', [
				'Hangboard A',
				'Hangboard A (copy)',
				'Hangboard A (copy 2)'
			])
		).toBe('Hangboard A (copy 3)');
	});

	it('fills a gap left by a deleted copy', () => {
		expect(
			copyTitle('Hangboard A', ['Hangboard A', 'Hangboard A (copy)', 'Hangboard A (copy 3)'])
		).toBe('Hangboard A (copy 2)');
	});

	it('ignores the whitespace a stored title may carry', () => {
		expect(copyTitle('Hangboard A', ['  Hangboard A (copy)  '])).toBe('Hangboard A (copy 2)');
	});

	// A title that is only the suffix has no base to number from, so it keeps
	// what it has rather than becoming " (copy)".
	it('keeps a title that is nothing but a suffix', () => {
		expect(copyTitle('(copy)', [])).toBe('(copy) (copy)');
	});
});

describe('trainingCopyRequest', () => {
	it('carries everything the training is made of', () => {
		const request = trainingCopyRequest(
			training({
				description: 'Three sets',
				goal: 'resi doigts',
				comment: 'first rep in pronation',
				items: [{ type: 'exercise', position: 0 }]
			}),
			'Hangboard A (copy)'
		);

		expect(request).toMatchObject({
			title: 'Hangboard A (copy)',
			description: 'Three sets',
			training_type: 'hangboard',
			goal: 'resi doigts',
			comment: 'first rep in pronation'
		});
		expect(request.items).toHaveLength(1);
	});

	// An id on a write means "keep this row", and a copy keeps nothing.
	it('drops the server ids, at every depth', () => {
		const request = trainingCopyRequest(
			training({
				items: [
					{
						id: 'item-1',
						type: 'circuit',
						position: 0,
						items: [
							{ id: 'item-2', type: 'exercise', position: 0 },
							{ id: 'item-3', type: 'hangboard_rep', position: 1 }
						]
					}
				]
			}),
			'copy'
		);

		const ids = JSON.stringify(request.items).match(/"id":/g);
		expect(ids).toBeNull();
		expect(request.items[0].items).toHaveLength(2);
	});

	// Being a favourite is a mark on one row of the library, not a property of
	// the training, so a copy does not land in the favourites list.
	it('does not carry the favourite mark', () => {
		const request = trainingCopyRequest(training({ is_favorite: true }), 'copy');

		expect(request.is_favorite).toBeUndefined();
	});
});
