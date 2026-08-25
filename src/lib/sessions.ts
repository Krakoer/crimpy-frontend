import type { PrescriptionSnapshot, RepData, RepHand, TrainingItem } from '$lib/api/client';
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

// The single letter a rep row names its hand with. A two handed hang gets its
// own letter rather than borrowing one of the single hands.
export function handShort(hand: RepHand): string {
	return { left: 'L', right: 'R', both: 'B' }[hand] ?? '--';
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
	splitHand: boolean;
	// A rep hung with two hands is one rep on one board, so its set is not cut
	// into a right and a left half the way the other modes are.
	bothHands: boolean;
	// How many hands a set works before the next one starts. Two when the hands
	// alternate inside the set, one when the block hangs a single hand, so a set
	// is not measured out as twice the reps it actually holds.
	handsPerSet: 1 | 2;
}

// The repeater settings a prescription item carries, which is where the set
// shape of a played block lives: a session records none of its own.
export function repeaterConfigOfItem(item: TrainingItem): RepeaterConfig | null {
	if (item.type !== 'repeater') return null;
	const sets = item.cycles ?? 0;
	const repsPerSet = item.reps ?? 0;
	if (sets <= 0 || repsPerSet <= 0) return null;
	return {
		sets,
		repsPerSet,
		// Only 'split' works each hand as its own half-set; a plain one-handed
		// block is a single run of reps that happens to use one hand.
		splitHand: item.hand === 'split',
		bothHands: item.hand === 'both',
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
// order they were performed and the caller has already dropped the rests, so a
// set is measured out by its rep count alone.
export function groupRepsIntoSets(reps: RepData[], config: RepeaterConfig): RepSet[] {
	const sets: RepSet[] = [];
	let index = 0;

	for (let set = 0; set < config.sets && index < reps.length; set++) {
		if (config.splitHand) {
			// Each hand is worked as its own block, so it reads as its own set.
			for (const rightHand of [true, false]) {
				const handReps = reps.slice(index, index + config.repsPerSet);
				index += handReps.length;
				if (handReps.length > 0) {
					sets.push({ label: `Set ${set + 1} - ${rightHand ? 'Right' : 'Left'}`, reps: handReps });
				}
			}
		} else if (config.bothHands) {
			// Two hands on the board for a single rep, so there is no hand to name
			// and nothing to split the set into.
			const setReps = reps.slice(index, index + config.repsPerSet);
			index += setReps.length;
			if (setReps.length > 0) sets.push({ label: `Set ${set + 1}`, reps: setReps });
		} else {
			// Both hands alternate within the set, but they are shown grouped.
			const rightHand: RepData[] = [];
			const leftHand: RepData[] = [];
			const setReps = reps.slice(index, index + config.repsPerSet * config.handsPerSet);
			index += setReps.length;
			for (const rep of setReps) {
				(rep.hand === 'right' ? rightHand : leftHand).push(rep);
			}
			if (rightHand.length > 0) sets.push({ label: `Set ${set + 1} - Right`, reps: rightHand });
			if (leftHand.length > 0) sets.push({ label: `Set ${set + 1} - Left`, reps: leftHand });
		}
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
	workTime: number;
	// Both are null for a session that played more than one block. Averaging
	// hangs at 34 kg with hangs at 24 kg gives a load no block prescribed and no
	// rep pulled, and one ratio over blocks graded against different targets
	// hides which of them was missed. The card states them per block instead.
	// Work time, work reps and peak load still aggregate over the whole session,
	// peak load for the reason its own note below gives.
	//
	// The block count is the test, not the loads: two blocks worked at the same
	// target pool nothing, but they still read honestly one block at a time.
	//
	// The average is also null for a session whose sensor measured none of it,
	// and states the reps it did measure otherwise.
	avgWeight: number | null;
	// Null for that same session, and for no other reason: a peak load pools
	// nothing, since the heaviest rep of a run is one rep whichever block it was
	// hung in. A run nothing weighed has no heaviest rep either, and the zeros it
	// stored are the absence of a reading rather than a load, so the stat is
	// dropped alongside the mean rather than reading 0.0 kg.
	maxWeight: number | null;
	onTarget: OnTargetCount | null;
}

// How many of a run's reps reached the load they were given, out of how many the
// run could grade, plus the ones it prescribed a load for and never measured.
export interface OnTargetCount {
	onTarget: number;
	total: number;
	unmeasured: number;
}

// A rep counts as on target once it reaches 90% of the prescribed load, which is
// the threshold the app grades sessions with.
export const ON_TARGET_RATIO = 0.9;

export function isOnTarget(rep: RepData): boolean {
	return rep.target_weight > 0 && rep.average_weight / rep.target_weight >= ON_TARGET_RATIO;
}

// How many of a run's reps reached the load they were given, rests left out.
//
// Null when no rep carries a target: a ratio over reps the training never gave
// one grades every single one as missed, which is an athlete's own logged run
// rather than a failed one. Reps without a target still count in the total once
// any of its neighbours has one, so a block reads as the whole run it was.
//
// A rep whose target was lost to a sensor that dropped mid run is the one
// exception: it was prescribed a load and performed, but nothing measured it, so
// grading it either way states something the run does not know. It leaves the
// ratio entirely and is counted apart. Kept equal to onTargetCount in
// crimpy-app/lib/utils/rep_blocks.dart so an athlete and their coach read a
// session the same way.
export function onTargetCount(reps: RepData[]): OnTargetCount | null {
	const workReps = reps.filter((rep) => !rep.is_rest);
	const graded = measuredReps(reps);
	// Asked of the reps the run could grade, not of every rep: a group whose only
	// targets went unmeasured has nothing to state a ratio over, and 0/0 reads as
	// a run that met nothing.
	if (!graded.some((rep) => rep.target_weight > 0)) return null;
	return {
		onTarget: graded.filter(isOnTarget).length,
		total: graded.length,
		unmeasured: workReps.length - graded.length
	};
}

// The work reps a run actually weighed: the set every load stated over a run is
// counted on, and the same one onTargetCount grades. A rep whose target was lost
// to a sensor that dropped mid run was performed and weighed nothing, so it is
// not one of them. Kept equal to measuredReps in
// crimpy-app/lib/utils/rep_blocks.dart.
export function measuredReps(reps: RepData[]): RepData[] {
	return reps.filter((rep) => !rep.is_rest && !rep.target_unmeasured);
}

// The mean load over the reps a run weighed, or null when it weighed none.
//
// A rep the sensor missed carries an average of 0 it never pulled. Averaged in,
// it states a load lighter than anything the athlete held, on the same line as a
// ratio that already leaves that rep out, and above a row that reads "not
// measured" for it. Every load of the card counts the same reps instead. Kept
// equal to measuredAvgWeight in crimpy-app/lib/utils/rep_blocks.dart.
export function measuredAvgWeight(reps: RepData[]): number | null {
	const weighed = weighedReps(reps);
	if (weighed.length === 0) return null;
	return weighed.reduce((sum, rep) => sum + rep.average_weight, 0) / weighed.length;
}

// The heaviest load over the reps a run weighed, or null when it weighed none.
//
// A max is not pooled by the blocks a session played, since the heaviest rep of
// a run is one rep whichever block it was hung in, so the only run that states
// none is the one nothing ever weighed. There a zero does not lose the max the
// way it loses an average: it is the only value left, and reads as a load the
// athlete never pulled beside a mean that is correctly absent. The two stats
// count the same reps and appear together. Kept equal to measuredMaxWeight in
// crimpy-app/lib/utils/rep_blocks.dart.
export function measuredMaxWeight(reps: RepData[]): number | null {
	const weighed = weighedReps(reps);
	if (weighed.length === 0) return null;
	// Not floored at zero: a sensor tared under load reads its whole run below
	// it, and a peak stated as 0.0 kg there is the same load no rep pulled this
	// function exists to stop stating. The mean already reads such a run as it
	// was measured, and the app's reduce carries no seed either.
	return weighed.map((rep) => rep.average_weight).reduce((max, w) => Math.max(max, w));
}

// Whether the run got a reading for one rep. False for a rep it weighed nothing
// for: one whose target a dropped sensor lost, and one played from a block that
// measures nothing at all, a two handed hang included. Both are stored at
// exactly zero against no target, which is the absence of a reading rather than
// a load the athlete pulled, so no surface states a load for them.
//
// A reading is anything the sensor answered with, the zero it read against a
// target and the below zero run of a sensor tared under load included: both are
// what the athlete pulled, and the peak already reads the second one as it was
// read. Kept equal to repWeighed in crimpy-app/lib/utils/rep_blocks.dart.
export function repWeighed(rep: RepData): boolean {
	return rep.average_weight !== 0 || rep.target_weight > 0;
}

// The reps a run put a load on: the set every load stated over it is counted on,
// so the header, the block line and the rows cannot state loads over different
// reps. Empty for a run whose sensor never answered, and for a block that was
// never meant to be weighed. Kept equal to weighedReps in
// crimpy-app/lib/utils/rep_blocks.dart.
function weighedReps(reps: RepData[]): RepData[] {
	return measuredReps(reps).filter(repWeighed);
}

// Names how much of a run went unmeasured, or null when the run measured all of
// it. Stated next to a ratio so a denominator shrunk by a dropped sensor is not
// read as a shorter run than the athlete performed.
export function unmeasuredNote(count: OnTargetCount): string | null {
	return count.unmeasured === 0 ? null : `${count.unmeasured} unmeasured`;
}

// The line every surface states a ratio with, so the header badge and the block
// line of the same card cannot drift apart.
export function onTargetLabel(count: OnTargetCount): string {
	const unmeasured = unmeasuredNote(count);
	return `${count.onTarget}/${count.total} on target${unmeasured ? ` (${unmeasured})` : ''}`;
}

export function sessionPerformance(
	reps: RepData[],
	blocks: RepBlock[] | null
): SessionPerformance | null {
	const workReps = reps.filter((rep) => !rep.is_rest);
	if (workReps.length === 0) return null;
	const spansMultipleBlocks = (blocks?.length ?? 0) > 1;
	return {
		workReps: workReps.length,
		workTime: workReps.reduce((sum, rep) => sum + rep.duration, 0),
		avgWeight: spansMultipleBlocks ? null : measuredAvgWeight(workReps),
		maxWeight: measuredMaxWeight(workReps),
		onTarget: spansMultipleBlocks ? null : onTargetCount(workReps)
	};
}
