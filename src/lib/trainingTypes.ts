import type { TrainingType } from '$lib/api/client';

export interface TrainingTypeInfo {
	label: string;
	short: string;
	color: string;
	tint: string;
	// The same hue carried far enough down to be read as text on `tint`. Every
	// accent is under the 4.5:1 floor on its own light ground, so a pill that
	// writes its label in the accent is unreadable at the sizes these chips use.
	// See Krakoer/crimpy#119.
	text: string;
}

export const TRAINING_TYPES: TrainingType[] = [
	'hangboard',
	'workout',
	'climbing',
	'stretching',
	'other'
];

// A training without a type predates the field and is shown as a workout, the
// way the API defaults it.
export const DEFAULT_TRAINING_TYPE: TrainingType = 'workout';

// The one palette every training type is drawn with, kept in step with the app
// theme (crimpy-app/lib/models/common.dart) so a coach and an athlete see the
// same colour for the same type.
export const TRAINING_TYPE_INFO: Record<TrainingType, TrainingTypeInfo> = {
	hangboard: {
		label: 'Hangboard',
		short: 'HB',
		color: 'var(--pr)',
		tint: 'var(--pr-lt)',
		text: 'var(--pr-tx)'
	},
	workout: {
		label: 'Workout',
		short: 'WO',
		color: 'var(--pl)',
		tint: 'var(--pl-lt)',
		text: 'var(--pl-tx)'
	},
	climbing: {
		label: 'Climbing',
		short: 'CL',
		color: 'var(--gd)',
		tint: 'var(--gd-lt)',
		text: 'var(--gd-tx)'
	},
	stretching: {
		label: 'Stretching',
		short: 'ST',
		color: 'var(--gn)',
		tint: 'var(--gn-lt)',
		text: 'var(--gn-tx)'
	},
	other: {
		label: 'Other',
		short: 'OT',
		color: 'var(--bl)',
		tint: 'var(--bl-lt)',
		text: 'var(--bl-tx)'
	}
};

export function trainingTypeInfo(type: TrainingType | null | undefined): TrainingTypeInfo {
	return TRAINING_TYPE_INFO[type ?? DEFAULT_TRAINING_TYPE] ?? TRAINING_TYPE_INFO.workout;
}
