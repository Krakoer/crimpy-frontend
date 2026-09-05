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
	'hangboard_rep'
];

const LEAF_TYPES: TrainingItemType[] = ['exercise', 'repeater', 'hangboard_rep'];
const ROOT_CIRCUIT_TYPES: TrainingItemType[] = ['exercise', 'group', 'repeater', 'hangboard_rep'];

// A group at the root is the one container that takes an emom, so a coach can
// put the block inside the part of the session it belongs to. A circuit does
// not, and neither does a group sitting inside one: rounds started on a clock
// inside rounds that are not is two paces for one block, whether the emom is
// nested directly or through a group.
const GROUP_TYPES: TrainingItemType[] = [...LEAF_TYPES, 'emom'];

// What a container accepts, given the depth it sits at. A circuit at the root
// still takes a group, anything deeper takes leaf blocks only, and a training
// that restricts its blocks overrides both. The list a container hands its
// children and the check the grouping bar runs read the same answer from here,
// so a selection the bar offers to wrap cannot end up refused once wrapped.
export function containerChildTypes(
	containerType: ContainerType,
	depth: number,
	innerAllowedTypes?: readonly TrainingItemType[]
): readonly TrainingItemType[] {
	if (innerAllowedTypes) return innerAllowedTypes;
	if (containerType === 'group') return depth < 1 ? GROUP_TYPES : LEAF_TYPES;
	if (containerType === 'circuit' && depth < 1) return ROOT_CIRCUIT_TYPES;
	return LEAF_TYPES;
}

// What a training of this type takes at its root. A stretching session is a
// list of stretches, optionally run as one circuit, so it takes no second
// circuit and none of the blocks that count rounds or hangs.
export function trainingAllowedTypes(
	trainingType: TrainingType | undefined,
	items: TrainingItem[],
	ignoreItemId?: string
): readonly TrainingItemType[] {
	if (trainingType !== 'stretching') return ALL_BLOCK_TYPES;
	const hasCircuit = items.some((item) => item.type === 'circuit' && item._id !== ignoreItemId);
	return hasCircuit ? ['exercise'] : ['exercise', 'circuit'];
}

// What every container nested inside such a training takes, whatever the
// container is and however deep it sits. Undefined leaves the depth rules
// above in charge.
export function trainingInnerAllowedTypes(
	trainingType: TrainingType | undefined
): readonly TrainingItemType[] | undefined {
	return trainingType === 'stretching' ? ['exercise'] : undefined;
}
