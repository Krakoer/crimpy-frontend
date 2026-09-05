import { isSortable } from '@dnd-kit/svelte/sortable';
import type { TrainingItem, TrainingItemType, TrainingType } from '$lib/api/client';
import {
	applyDragOver,
	insertNewItem,
	parseNewItemId,
	targetContainerId,
	targetInsertIndex,
	type DropTarget
} from '$lib/training-drag';

// Both training editors drive the same tree with the same three handlers, and a
// guard that only half of them carried is a guard the other half is missing.
export interface TrainingDragHandlers {
	onDragStart(): void;
	onDragOver(event: { operation: { source: unknown; target: unknown } }): void;
	onDragEnd(event: { canceled: boolean; operation: { source: unknown; target: unknown } }): void;
}

export function createTrainingDragHandlers(
	draft: () => { items: TrainingItem[]; training_type?: TrainingType },
	onBlockCreated: (type: TrainingItemType, exerciseId?: string) => void
): TrainingDragHandlers {
	let itemsSnapshot: TrainingItem[] | null = null;
	// The block only moves when the target under the pointer changes, and a block
	// hovering itself is no change. Acting on every event instead made a hovered
	// block swap back and forth: the swap slides the target out from under the
	// pointer, the block itself takes its place, and the next event swaps it
	// straight back. A pointer that leaves every target clears the latch, so
	// coming back to a block moves it again.
	let lastTargetId = '';

	return {
		onDragStart() {
			lastTargetId = '';
			itemsSnapshot = structuredClone($state.snapshot(draft().items) as TrainingItem[]);
		},

		onDragOver({ operation: { source, target } }) {
			if (!source || !isSortable(source as never)) return;
			if (!target) {
				lastTargetId = '';
				return;
			}

			const sourceId = String((source as { id: string }).id);
			const targetId = String((target as DropTarget).id);
			if (targetId === sourceId || targetId === lastTargetId) return;
			lastTargetId = targetId;

			applyDragOver(
				draft().items,
				draft().training_type,
				sourceId,
				target as DropTarget,
				isSortable(target as never)
			);
		},

		onDragEnd({ canceled, operation: { source, target } }) {
			if (canceled) {
				if (itemsSnapshot) draft().items = itemsSnapshot;
				itemsSnapshot = null;
				return;
			}
			itemsSnapshot = null;

			if (!source || !target) return;
			if (isSortable(source as never)) return;

			const newBlock = parseNewItemId(String((source as { id: string }).id));
			if (!newBlock) return;

			const isSortableTarget = isSortable(target as never);
			const added = insertNewItem(
				draft().items,
				draft().training_type,
				newBlock.type,
				newBlock.exerciseId,
				targetContainerId(target as DropTarget, isSortableTarget),
				targetInsertIndex(target as DropTarget, isSortableTarget)
			);
			if (added) onBlockCreated(newBlock.type, newBlock.exerciseId);
		}
	};
}
