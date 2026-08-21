import type { PrescriptionSnapshot, RepData, SessionResponse, TrainingItem } from '$lib/api/client';
import { BLOCK_PRESENTATION } from '$lib/block-presentation';

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
	// How many hands a set works before the next one starts. Two when the hands
	// alternate inside the set, one when the block hangs a single hand, so a set
	// is not measured out as twice the reps it actually holds.
	handsPerSet: 1 | 2;
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
		splitHand: repeater_split_hand,
		handsPerSet: repeater_split_hand ? 1 : 2
	};
}

// The repeater settings a prescription item itself carries. A played session
// records no session-level repeater configuration, so the item the reps name is
// the only place the set shape survives.
export function repeaterConfigOfItem(item: TrainingItem): RepeaterConfig | null {
	if (item.type !== 'repeater') return null;
	const sets = item.cycles ?? 0;
	const repsPerSet = item.reps ?? 0;
	if (sets <= 0 || repsPerSet <= 0) return null;
	return {
		sets,
		repsPerSet,
		workTime: item.worktime_seconds ?? 0,
		restTime: item.rest_seconds ?? 0,
		setRest: item.cycle_rest_seconds ?? 0,
		// Only 'split' works each hand as its own half-set; a plain one-handed
		// block is a single run of reps that happens to use one hand.
		splitHand: item.hand === 'split',
		// Only 'alternate' hangs each rep twice, once per hand. 'both' puts two
		// hands on the board for a single rep, so it counts once like the
		// one-handed modes do.
		handsPerSet: item.hand === 'alternate' ? 2 : 1
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
			const expectedWorkReps = config.repsPerSet * config.handsPerSet;
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

export interface RepBlock {
	label: string;
	reps: RepData[];
	// The set breakdown when the block played a repeater, so grouping by item
	// adds a name without costing the structure the athlete actually saw. Null
	// for a block that is not a repeater.
	sets: RepSet[] | null;
}

// Names one prescription item the way the reps card heads the block it played,
// so a coach reads the two halves of the modal against each other. Falls back to
// the block type when the item carries no name of its own.
export function prescriptionItemLabel(item: TrainingItem): string {
	const named = (item.type === 'exercise' ? item.exercise_name : item.free_text)?.trim();
	if (named) return named;
	const title = item.group_title?.trim();
	if (title) return title;
	const label = BLOCK_PRESENTATION[item.type]?.label ?? 'Block';
	const edges = [...new Set(item.edge_sizes_mm ?? [])];
	return edges.length === 1 ? `${label} ${edges[0]}mm` : label;
}

// Every item of a prescription by id, nested ones included, so a rep naming one
// can be headed with it.
export function prescriptionItemsById(
	prescription: PrescriptionSnapshot | null | undefined
): Map<string, TrainingItem> {
	const byId = new Map<string, TrainingItem>();
	const walk = (items: TrainingItem[]) => {
		for (const item of items) {
			const id = item.id ?? item._id;
			if (id) byId.set(id, item);
			walk(item.items ?? []);
		}
	};
	walk(prescription?.items ?? []);
	return byId;
}

// Cuts the reps into the blocks they were played from, in the order they were
// performed: a new block starts wherever the item changes. Grouping by item id
// instead would merge a block the athlete came back to with its first pass and
// lose the order the two halves of a circuit ran in.
//
// Returns null when no rep names an item, which is every session played before
// the link existed and every one played outside a training. The card falls back
// to its flat list there rather than showing one nameless block.
export function groupRepsByPrescriptionItem(
	reps: RepData[],
	prescription: PrescriptionSnapshot | null | undefined
): RepBlock[] | null {
	if (!reps.some((rep) => rep.training_item_id)) return null;

	const byId = prescriptionItemsById(prescription);
	const blocks: { label: string; reps: RepData[]; item: TrainingItem | null }[] = [];
	let currentId: string | null | undefined;

	for (const rep of reps) {
		const id = rep.training_item_id ?? null;
		if (blocks.length === 0 || id !== currentId) {
			const item = (id ? byId.get(id) : undefined) ?? null;
			blocks.push({
				// A link the snapshot cannot name is a block the coach deleted from
				// the training after the run, so the reps are still shown as their
				// own block rather than folded into the one before them.
				label: item ? prescriptionItemLabel(item) : 'Unnamed block',
				reps: [],
				item
			});
			currentId = id;
		}
		blocks[blocks.length - 1].reps.push(rep);
	}

	// An item played more than once - a circuit child on its second cycle - would
	// otherwise show the same heading twice with nothing to tell the passes
	// apart. The prescription card numbers nothing, so a position index here
	// would read as a prescribed item that does not exist.
	const passes = new Map<TrainingItem | null, number>();
	const totals = new Map<TrainingItem | null, number>();
	for (const block of blocks) {
		if (block.item) totals.set(block.item, (totals.get(block.item) ?? 0) + 1);
	}

	return blocks.map((block) => {
		let label = block.label;
		if (block.item && (totals.get(block.item) ?? 0) > 1) {
			const pass = (passes.get(block.item) ?? 0) + 1;
			passes.set(block.item, pass);
			label = `${label} (pass ${pass})`;
		}
		const config = block.item ? repeaterConfigOfItem(block.item) : null;
		return {
			label,
			reps: block.reps,
			sets: config ? groupRepsIntoSets(block.reps, config) : null
		};
	});
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
