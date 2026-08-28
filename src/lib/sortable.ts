// Moving an item onto another one inside the same list. The index of the item
// dropped on is read before the removal, so inserting at it is enough for both
// directions: going up it is the slot the over item is pushed out of, going
// down it is the slot the over item vacates by shifting back one, which is what
// makes the last slot of a list reachable by dropping.
export function arrayMove<T>(items: T[], fromIndex: number, overIndex: number): void {
	if (fromIndex === overIndex) return;
	if (fromIndex < 0 || fromIndex >= items.length) return;
	if (overIndex < 0 || overIndex >= items.length) return;
	const [item] = items.splice(fromIndex, 1);
	items.splice(overIndex, 0, item);
}
