import type { TrainingItem, TrainingItemType, TrainingType } from '$lib/api/client';

export type ContainerType = 'circuit' | 'group' | 'emom';

const CONTAINER_TYPES: ContainerType[] = ['circuit', 'group', 'emom'];

export function isContainerType(type: TrainingItemType): type is ContainerType {
	return (CONTAINER_TYPES as TrainingItemType[]).includes(type);
}

// Every block a training can be made of, which is what a training puts no
// restriction on takes.
export const ALL_BLOCK_TYPES: readonly TrainingItemType[] = [
	'exercise',
	'circuit',
	'emom',
	'group',
	'repeater',
	'hangboard_rep',
	'free'
];

const LEAF_TYPES: TrainingItemType[] = ['exercise', 'repeater', 'hangboard_rep'];

// A note prescribes nothing: it is prose the athlete reads and confirms, so it
// belongs wherever a coach may want to say something between blocks, whatever
// depth that is. An emom is the one container it stays out of, because its
// rounds start on the clock and a step waiting for a tap inside one would hold
// that clock up.
const LEAF_AND_NOTE_TYPES: TrainingItemType[] = [...LEAF_TYPES, 'free'];
const ROOT_CIRCUIT_TYPES: TrainingItemType[] = [
	'exercise',
	'group',
	'repeater',
	'hangboard_rep',
	'free'
];

// A group at the root is the one container that takes an emom, so a coach can
// put the block inside the part of the session it belongs to. A circuit does
// not, and neither does a group sitting inside one: rounds started on a clock
// inside rounds that are not is two paces for one block, whether the emom is
// nested directly or through a group.
const GROUP_TYPES: TrainingItemType[] = [...LEAF_TYPES, 'emom', 'free'];

// What a container accepts, given the depth it sits at. A circuit at the root
// still takes a group, anything deeper takes leaf blocks only. The list a
// container hands its children and the check the grouping bar runs read the same
// answer from here, so a selection the bar offers to wrap cannot end up refused
// once wrapped.
//
// A training that restricts its blocks narrows that answer rather than
// replacing it: both rules hold at once. Letting the training's list win
// outright would hand an emom whatever the training allows and lose the one
// block the container itself refuses, which is how a stretching training ended
// up offering a note inside an emom.
export function containerChildTypes(
	containerType: ContainerType,
	depth: number,
	innerAllowedTypes?: readonly TrainingItemType[]
): readonly TrainingItemType[] {
	const byContainer = containerTypesAtDepth(containerType, depth);
	if (!innerAllowedTypes) return byContainer;
	return byContainer.filter((type) => innerAllowedTypes.includes(type));
}

function containerTypesAtDepth(
	containerType: ContainerType,
	depth: number
): readonly TrainingItemType[] {
	if (containerType === 'emom') return LEAF_TYPES;
	if (containerType === 'group') return depth < 1 ? GROUP_TYPES : LEAF_AND_NOTE_TYPES;
	return depth < 1 ? ROOT_CIRCUIT_TYPES : LEAF_AND_NOTE_TYPES;
}

// What a training of this type takes at its root. A stretching session is a
// list of stretches, optionally run as one circuit, so it takes no second
// circuit and none of the blocks that count rounds or hangs. A note is not one
// of those: what it says about how the session is run is exactly what a coach
// writing a stretching day needs a place for.
export function trainingAllowedTypes(
	trainingType: TrainingType | undefined,
	items: TrainingItem[],
	ignoreItemId?: string
): readonly TrainingItemType[] {
	if (trainingType !== 'stretching') return ALL_BLOCK_TYPES;
	const hasCircuit = items.some((item) => item.type === 'circuit' && item._id !== ignoreItemId);
	return hasCircuit ? ['exercise', 'free'] : ['exercise', 'circuit', 'free'];
}

// The most any container nested inside such a training may take, whatever the
// container is and however deep it sits. Each container narrows it further with
// its own rule, so this only ever takes blocks away. Undefined leaves the depth
// rules above alone.
export function trainingInnerAllowedTypes(
	trainingType: TrainingType | undefined
): readonly TrainingItemType[] | undefined {
	return trainingType === 'stretching' ? ['exercise', 'free'] : undefined;
}
