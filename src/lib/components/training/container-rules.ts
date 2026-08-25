import type { TrainingItemType } from '$lib/api/client';

export type ContainerType = 'circuit' | 'group' | 'emom';

const LEAF_TYPES: TrainingItemType[] = ['exercise', 'repeater', 'hangboard_rep'];
const ROOT_CIRCUIT_TYPES: TrainingItemType[] = ['exercise', 'group', 'repeater', 'hangboard_rep'];

// A group is the one container that takes an emom, so a coach can put the block
// inside the part of the session it belongs to. A circuit does not: rounds
// started on a clock inside rounds that are not is two paces for one block.
const GROUP_TYPES: TrainingItemType[] = [...LEAF_TYPES, 'emom'];

// What a container accepts, given the depth it sits at. A circuit at the root
// still takes a group, anything deeper takes leaf blocks only, and a training
// that restricts its blocks overrides both. The list a container hands its
// children and the check the grouping bar runs read the same answer from here,
// so a selection the bar offers to wrap cannot end up refused once wrapped.
export function containerChildTypes(
	containerType: ContainerType,
	depth: number,
	innerAllowedTypes?: TrainingItemType[]
): TrainingItemType[] {
	if (innerAllowedTypes) return innerAllowedTypes;
	if (containerType === 'group') return GROUP_TYPES;
	if (containerType === 'circuit' && depth < 1) return ROOT_CIRCUIT_TYPES;
	return LEAF_TYPES;
}
