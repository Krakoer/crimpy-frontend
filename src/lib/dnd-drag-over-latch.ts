// Both editors move on drag over rather than on drop, so the list shows the
// result while the pointer is still down. That is what makes a hovered pair
// swap back and forth if every event is acted on: the swap slides the target
// out from under the pointer, the dragged item takes its place, and the next
// event swaps it straight back. Only a target the pointer has not just acted on
// is worth moving to.
//
// The dragged item hovering itself is not a change and does not clear the
// latch, so drifting back onto the item just passed does not swap it again.
// Leaving every target does clear it, so coming back to that item moves it.
export function createDragOverLatch() {
	let lastTargetId = '';

	return {
		clear() {
			lastTargetId = '';
		},

		// Whether this target is worth moving to, latching it when it is.
		accepts(sourceId: string, targetId: string): boolean {
			if (targetId === sourceId || targetId === lastTargetId) return false;
			lastTargetId = targetId;
			return true;
		}
	};
}
