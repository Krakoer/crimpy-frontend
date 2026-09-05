// A drag source id meaning "create one of these", as opposed to a sortable id,
// which names something already in the list being dropped into. Both editors
// put a rail of new things beside the list, so they share the marker that tells
// the two kinds apart on drop. What follows it is each editor's own to shape:
// the training editor writes a block type and an optional exercise, the program
// writes a training id, and neither can read the other's payload by accident.
const NEW_ITEM_PREFIX = '__new__:';

export function newItemId(payload: string): string {
	return NEW_ITEM_PREFIX + payload;
}

// What the rail put after the marker, or null when the id names something that
// already exists.
export function newItemPayload(id: string): string | null {
	return id.startsWith(NEW_ITEM_PREFIX) ? id.slice(NEW_ITEM_PREFIX.length) : null;
}
