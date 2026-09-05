import { describe, expect, it } from 'vitest';
import type { TrainingItem, TrainingItemType } from '$lib/api/client';
import {
	ALL_BLOCK_TYPES,
	containerChildTypes,
	isContainerType,
	trainingAllowedTypes,
	trainingInnerAllowedTypes
} from './container-rules';

const circuit = (id: string): TrainingItem => ({ type: 'circuit', _id: id });

describe('isContainerType', () => {
	it('knows the three blocks that hold others', () => {
		const containers: TrainingItemType[] = ['circuit', 'group', 'emom'];
		const leaves: TrainingItemType[] = ['exercise', 'repeater', 'hangboard_rep'];
		expect(containers.every(isContainerType)).toBe(true);
		expect(leaves.some(isContainerType)).toBe(false);
	});
});

describe('containerChildTypes', () => {
	it('lets a root circuit hold a group and a deeper one not', () => {
		expect(containerChildTypes('circuit', 0)).toContain('group');
		expect(containerChildTypes('circuit', 1)).not.toContain('group');
	});

	it('lets a root group hold an emom and a deeper one not', () => {
		expect(containerChildTypes('group', 0)).toContain('emom');
		expect(containerChildTypes('group', 1)).not.toContain('emom');
	});

	it('lets an emom hold leaf blocks only', () => {
		expect(containerChildTypes('emom', 0)).toEqual(['exercise', 'repeater', 'hangboard_rep']);
	});

	it('lets the training override the depth rules', () => {
		expect(containerChildTypes('circuit', 0, ['exercise'])).toEqual(['exercise']);
	});
});

describe('trainingAllowedTypes', () => {
	it('puts no restriction on a training that has none', () => {
		expect(trainingAllowedTypes('workout', [])).toBe(ALL_BLOCK_TYPES);
	});

	it('offers a stretching training its one circuit', () => {
		expect(trainingAllowedTypes('stretching', [])).toEqual(['exercise', 'circuit']);
	});

	it('stops offering it once the training has one', () => {
		expect(trainingAllowedTypes('stretching', [circuit('c')])).toEqual(['exercise']);
	});

	// Reordering the circuit already there must not read it as a second one.
	it('overlooks the circuit being moved', () => {
		expect(trainingAllowedTypes('stretching', [circuit('c')], 'c')).toEqual([
			'exercise',
			'circuit'
		]);
	});
});

describe('trainingInnerAllowedTypes', () => {
	it('keeps a stretching training to stretches at every depth', () => {
		expect(trainingInnerAllowedTypes('stretching')).toEqual(['exercise']);
	});

	it('leaves the depth rules in charge otherwise', () => {
		expect(trainingInnerAllowedTypes('workout')).toBeUndefined();
	});
});
