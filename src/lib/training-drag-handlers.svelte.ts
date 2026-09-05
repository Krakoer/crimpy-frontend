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
import { createDragOverLatch } from '$lib/dnd-drag-over-latch';

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
	const latch = createDragOverLatch();

	return {
		onDragStart() {
			latch.clear();
			// $state.snapshot already hands back a copy detached from the reactive
			// tree, which is the whole of what a revert needs.
			itemsSnapshot = $state.snapshot(draft().items) as TrainingItem[];
		},

		onDragOver({ operation: { source, target } }) {
			if (!source || !isSortable(source as never)) return;
			if (!target) {
				latch.clear();
				return;
			}

			const sourceId = String((source as { id: string }).id);
			if (!latch.accepts(sourceId, String((target as DropTarget).id))) return;

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
