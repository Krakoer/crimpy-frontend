import type { RepData, SessionResponse } from '$lib/api/client';

// What the athlete did. A label only: whether a session has rep measurements to
// show is decided by the reps it carries, never by this.
export interface SessionActivityInfo {
	label: string;
	short: string;
	icon: string;
	color: string;
	tint: string;
}

// Activity discriminators shared with the app, stored on sessions.activity.
export const SESSION_ACTIVITIES: Record<number, SessionActivityInfo> = {
	0: {
		label: 'Hangboard',
		short: 'HB',
		icon: 'flame',
		color: 'var(--pr)',
		tint: 'var(--pr-lt)'
	},
	1: {
		label: 'Climbing',
		short: 'CL',
		icon: 'mountain',
		color: 'var(--gd)',
		tint: 'var(--gd-lt)'
	},
	2: {
		label: 'Stretching',
		short: 'ST',
		icon: 'figure',
		color: 'var(--gn)',
		tint: 'var(--gn-lt)'
	},
	3: {
		label: 'Workout',
		short: 'WO',
		icon: 'dumbbell',
		color: 'var(--pl)',
		tint: 'var(--pl-lt)'
	},
	4: {
		label: 'Other',
		short: 'OT',
		icon: 'clock',
		color: 'var(--bl)',
		tint: 'var(--bl-lt)'
	}
};

const UNKNOWN_SESSION_ACTIVITY: SessionActivityInfo = {
	label: 'Session',
	short: '--',
	icon: 'clock',
	color: 'var(--tx2)',
	tint: 'var(--panel2)'
};

// An activity the app added before this portal knew about it degrades to a
// neutral entry rather than breaking the list.
export function sessionActivityInfo(activity: number): SessionActivityInfo {
	return SESSION_ACTIVITIES[activity] ?? UNKNOWN_SESSION_ACTIVITY;
}

export const GRIP_POSITIONS: Record<number, { label: string; short: string }> = {
	0: { label: 'Half Crimp', short: 'HC' },
	1: { label: '3-Finger', short: '3FD' },
	2: { label: 'Full Crimp', short: 'FC' },
	3: { label: 'Open Hand', short: 'OH' }
};

export function gripLabel(position: number): string {
	return GRIP_POSITIONS[position]?.label ?? `Grip ${position}`;
}

export function gripShort(position: number): string {
	return GRIP_POSITIONS[position]?.short ?? '--';
}

export function formatDuration(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	if (h > 0) return `${h}h ${m}m`;
	if (m > 0) return `${m}m`;
	return `${seconds}s`;
}

export function formatSessionTime(iso: string): string {
	return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function formatSessionDate(iso: string): string {
	return new Date(iso).toLocaleDateString('en-GB', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	});
}

// The compact form the narrow stat cells of the detail view can hold.
export function formatSessionDateShort(iso: string): string {
	return new Date(iso).toLocaleDateString('en-GB', {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	});
}

export interface RepeaterConfig {
	sets: number;
	repsPerSet: number;
	workTime: number;
	restTime: number;
	setRest: number;
	splitHand: boolean;
}

// The repeater settings the session was run with, or null when it was not a
// repeater. The API leaves every field null in that case.
export function repeaterConfigOf(session: SessionResponse): RepeaterConfig | null {
	const {
		repeater_sets,
		repeater_reps,
		repeater_work_time,
		repeater_rest_time,
		repeater_set_rest,
		repeater_split_hand
	} = session;
	if (
		repeater_sets == null ||
		repeater_reps == null ||
		repeater_work_time == null ||
		repeater_rest_time == null ||
		repeater_set_rest == null ||
		repeater_split_hand == null
	) {
		return null;
	}
	return {
		sets: repeater_sets,
		repsPerSet: repeater_reps,
		workTime: repeater_work_time,
		restTime: repeater_rest_time,
		setRest: repeater_set_rest,
		splitHand: repeater_split_hand
	};
}

export interface RepSet {
	label: string;
	reps: RepData[];
}

// Rebuilds the sets of a repeater from the flat rep list, the way the app does
// it, so a coach reads the same breakdown the athlete saw. Reps arrive in the
// order they were performed, and a rest at least as long as the configured set
// rest marks the boundary between two sets.
export function groupRepsIntoSets(reps: RepData[], config: RepeaterConfig): RepSet[] {
	const sets: RepSet[] = [];
	let index = 0;

	const isSetBoundary = () =>
		index < reps.length && reps[index].is_rest && reps[index].duration >= config.setRest;

	const takeInterHandRest = (into: RepData[]) => {
		if (index < reps.length && reps[index].is_rest && reps[index].duration < config.setRest) {
			into.push(reps[index]);
			index += 1;
		}
	};

	for (let set = 0; set < config.sets && index < reps.length; set++) {
		if (config.splitHand) {
			// Each hand is worked as its own block, so it reads as its own set.
			for (const rightHand of [true, false]) {
				const handReps: RepData[] = [];
				let workReps = 0;
				while (index < reps.length && workReps < config.repsPerSet) {
					const rep = reps[index];
					handReps.push(rep);
					if (!rep.is_rest) workReps += 1;
					index += 1;
				}
				takeInterHandRest(handReps);
				if (handReps.length > 0) {
					sets.push({ label: `Set ${set + 1} - ${rightHand ? 'Right' : 'Left'}`, reps: handReps });
				}
			}
		} else {
			// Both hands alternate within the set, but they are shown grouped.
			const rightHand: RepData[] = [];
			const leftHand: RepData[] = [];
			let workReps = 0;
			const expectedWorkReps = config.repsPerSet * 2;
			while (index < reps.length && workReps < expectedWorkReps && !isSetBoundary()) {
				const rep = reps[index];
				(rep.right_hand ? rightHand : leftHand).push(rep);
				if (!rep.is_rest) workReps += 1;
				index += 1;
			}
			if (rightHand.length > 0) sets.push({ label: `Set ${set + 1} - Right`, reps: rightHand });
			if (leftHand.length > 0) sets.push({ label: `Set ${set + 1} - Left`, reps: leftHand });
		}
		if (isSetBoundary()) index += 1;
	}

	// Anything the configuration did not account for, for instance a session cut
	// short and resumed, is still shown rather than silently dropped.
	if (index < reps.length) {
		sets.push({ label: 'Remaining', reps: reps.slice(index) });
	}
	return sets;
}

export interface SessionPerformance {
	workReps: number;
	avgWeight: number;
	maxWeight: number;
	workTime: number;
	onTargetReps: number;
	hasTargets: boolean;
}

// A rep counts as on target once it reaches 90% of the prescribed load, which is
// the threshold the app grades sessions with.
export const ON_TARGET_RATIO = 0.9;

export function isOnTarget(rep: RepData): boolean {
	return rep.target_weight > 0 && rep.average_weight / rep.target_weight >= ON_TARGET_RATIO;
}

export function sessionPerformance(reps: RepData[]): SessionPerformance | null {
	const workReps = reps.filter((rep) => !rep.is_rest);
	if (workReps.length === 0) return null;
	return {
		workReps: workReps.length,
		avgWeight: workReps.reduce((sum, rep) => sum + rep.average_weight, 0) / workReps.length,
		maxWeight: workReps.reduce((max, rep) => Math.max(max, rep.average_weight), 0),
		workTime: workReps.reduce((sum, rep) => sum + rep.duration, 0),
		onTargetReps: workReps.filter(isOnTarget).length,
		hasTargets: workReps.some((rep) => rep.target_weight > 0)
	};
}
