import type { TrainingItem, TrainingItemType, TrainingType } from '$lib/api/client';
import {
	containerChildTypes,
	isContainerType,
	trainingAllowedTypes,
	trainingInnerAllowedTypes
} from '$lib/components/training/container-rules';
import { createTrainingItem } from '$lib/components/training/create-item';
import { arrayMove } from '$lib/sortable';
import { newItemId, newItemPayload } from '$lib/dnd-new-item';

export const ROOT_CONTAINER_ID = 'root';
const CONTAINER_ID_PREFIX = 'container:';

export function containerIdOf(itemId: string): string {
	return CONTAINER_ID_PREFIX + itemId;
}

function itemIdOf(containerId: string): string {
	return containerId.startsWith(CONTAINER_ID_PREFIX)
		? containerId.slice(CONTAINER_ID_PREFIX.length)
		: containerId;
}

// A drop target inside a container has to beat the container block itself,
// which encloses it and therefore collides with every pointer that reaches the
// inner list. dnd-kit settles equal priorities on the distance to the shape
// centre, which for a full width block is decided by the horizontal position
// and flips from one pixel to the next: the block a coach aimed at is not the
// one that wins. Ranking the targets by how deep they sit makes the innermost
// one under the pointer win outright.
export function itemCollisionPriority(depth: number): number {
	return depth * 2 + 1;
}

export function containerCollisionPriority(depth: number): number {
	return depth * 2;
}

export type TreeLocation = { container: TrainingItem[]; containerId: string; index: number };

export function findItemInTree(
	items: TrainingItem[],
	targetId: string,
	containerId = ROOT_CONTAINER_ID
): TreeLocation | null {
	for (let index = 0; index < items.length; index++) {
		if (items[index]._id === targetId) return { container: items, containerId, index };
		if (items[index].items) {
			const found = findItemInTree(items[index].items!, targetId, containerIdOf(items[index]._id!));
			if (found) return found;
		}
	}
	return null;
}

export function findItemById(items: TrainingItem[], id: string): TrainingItem | null {
	for (const item of items) {
		if (item._id === id) return item;
		if (item.items) {
			const found = findItemById(item.items, id);
			if (found) return found;
		}
	}
	return null;
}

// Containers reach the editor holding a list, whether they came from
// createTrainingItem or through prepareEditableTree, so this only ever reads the
// tree. A lookup that filled the list in as it went would edit the training
// merely by being dragged over.
export function findContainerArray(
	items: TrainingItem[],
	containerId: string
): TrainingItem[] | null {
	if (containerId === ROOT_CONTAINER_ID) return items;
	const itemId = itemIdOf(containerId);
	for (const item of items) {
		if (item._id === itemId) return item.items ?? null;
		if (item.items) {
			const found = findContainerArray(item.items, containerId);
			if (found !== null) return found;
		}
	}
	return null;
}

// The container a drop target names, and the depth of the list it sits in,
// which is what decides what it takes.
function findContainer(
	items: TrainingItem[],
	containerId: string,
	depth = 0
): { item: TrainingItem; depth: number } | null {
	const itemId = itemIdOf(containerId);
	for (const item of items) {
		if (item._id === itemId) return { item, depth };
		if (item.items) {
			const found = findContainer(item.items, containerId, depth + 1);
			if (found) return found;
		}
	}
	return null;
}

// Whether a drag may put this block here. It reads the same rules the add zone
// and the grouping bar read: a block the palette refuses to add must not be
// droppable into the same place instead.
export function isValidMove(
	items: TrainingItem[],
	trainingType: TrainingType | undefined,
	movedItem: TrainingItem,
	targetContainerId: string
): boolean {
	if (targetContainerId === ROOT_CONTAINER_ID) {
		// A circuit already at the root is not a second one on its way in.
		return trainingAllowedTypes(trainingType, items, movedItem._id).includes(movedItem.type);
	}
	const target = findContainer(items, targetContainerId);
	if (!target || !isContainerType(target.item.type)) return false;
	return containerChildTypes(
		target.item.type,
		target.depth,
		trainingInnerAllowedTypes(trainingType)
	).includes(movedItem.type);
}

// A container cannot be dropped inside itself: it would take the list it lands
// in out of the tree along with it.
function holdsList(item: TrainingItem, list: TrainingItem[]): boolean {
	if (!item.items) return false;
	return item.items === list || item.items.some((child) => holdsList(child, list));
}

export function moveCrossContainer(
	items: TrainingItem[],
	trainingType: TrainingType | undefined,
	sourceId: string,
	targetContainerId: string,
	insertIndex: number
): void {
	const source = findItemInTree(items, sourceId);
	if (!source) return;
	if (source.containerId === targetContainerId) return;
	if (!isValidMove(items, trainingType, source.container[source.index], targetContainerId)) return;
	const targetContainer = findContainerArray(items, targetContainerId);
	if (!targetContainer) return;
	if (holdsList(source.container[source.index], targetContainer)) return;
	const [moved] = source.container.splice(source.index, 1);
	targetContainer.splice(Math.min(insertIndex, targetContainer.length), 0, moved);
}

// What a drop target says about where the block would land. A sortable answers
// with its own slot, a container with its end.
export type DropTarget = { id: string; group?: string; index?: number };

export function targetContainerId(target: DropTarget, isSortableTarget: boolean): string {
	return isSortableTarget ? (target.group ?? ROOT_CONTAINER_ID) : String(target.id);
}

export function targetInsertIndex(target: DropTarget, isSortableTarget: boolean): number {
	return isSortableTarget ? (target.index ?? 0) : Infinity;
}

export function applyDragOver(
	items: TrainingItem[],
	trainingType: TrainingType | undefined,
	sourceId: string,
	target: DropTarget,
	isSortableTarget: boolean
): void {
	const containerId = targetContainerId(target, isSortableTarget);
	if (!isSortableTarget) {
		moveCrossContainer(items, trainingType, sourceId, containerId, Infinity);
		return;
	}
	const source = findItemInTree(items, sourceId);
	if (!source) return;
	if (source.containerId !== containerId) {
		moveCrossContainer(items, trainingType, sourceId, containerId, target.index ?? 0);
		return;
	}
	const over = findItemInTree(items, String(target.id));
	// A block dropped on itself has not moved.
	if (!over || over.index === source.index) return;
	arrayMove(source.container, source.index, over.index);
}

export function insertNewItem(
	items: TrainingItem[],
	trainingType: TrainingType | undefined,
	type: TrainingItemType,
	exerciseId: string | undefined,
	containerId: string,
	insertIndex: number
): boolean {
	if (!isValidMove(items, trainingType, { type } as TrainingItem, containerId)) return false;
	const container = findContainerArray(items, containerId);
	if (!container) return false;
	container.splice(
		Math.min(insertIndex, container.length),
		0,
		createTrainingItem(type, exerciseId)
	);
	return true;
}

// The training editor's half of the create-new drag id: a block type, and the
// exercise to build it around when the rail dragged a named one.
export function newBlockId(type: TrainingItemType, exerciseId?: string): string {
	return newItemId(exerciseId ? `${type}:${exerciseId}` : type);
}

export function parseNewItemId(id: string): { type: TrainingItemType; exerciseId?: string } | null {
	const payload = newItemPayload(id);
	if (payload === null) return null;
	const separator = payload.indexOf(':');
	return separator === -1
		? { type: payload as TrainingItemType }
		: {
				type: payload.slice(0, separator) as TrainingItemType,
				exerciseId: payload.slice(separator + 1)
			};
}
