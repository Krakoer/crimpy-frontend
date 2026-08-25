import type { TrainingItemType } from '$lib/api/client';

export type ContainerType = 'circuit' | 'group';

const LEAF_TYPES: TrainingItemType[] = ['exercise', 'repeater', 'hangboard_rep'];
const ROOT_CIRCUIT_TYPES: TrainingItemType[] = ['exercise', 'group', 'repeater', 'hangboard_rep'];

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
	if (containerType === 'circuit' && depth < 1) return ROOT_CIRCUIT_TYPES;
	return LEAF_TYPES;
}
