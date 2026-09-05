import { createDragOperation } from '@dnd-kit/svelte';

// A container being dragged carries its own drop targets with it: the list
// inside it and every block in that list travel under the pointer for the whole
// drag. They rank deeper than anything the pointer is really over, so they
// would answer every collision and the block would never go anywhere. They
// stand down while the block holding them is the one moving.
export function createDragSourceGuard() {
	const operation = createDragOperation();
	let element = $state<HTMLElement | undefined>(undefined);

	return {
		attach(node: HTMLElement) {
			element = node;
			return () => {
				element = undefined;
			};
		},
		get insideDragSource() {
			const source = operation.source?.element;
			return Boolean(source && element && source !== element && source.contains(element));
		}
	};
}
