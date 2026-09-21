/**
 * An attachment that puts the caret in a field the coach has just asked for.
 *
 * Used by the note fields, which mount when their own affordance is pressed:
 * the click that opens one is the coach saying they want to write in it, so the
 * focus follows the field rather than staying on a button that has gone. The
 * same field mounted because the block already carries text takes no focus,
 * which is why this takes the answer rather than assuming it.
 */
export function focusWhen(asked: boolean) {
	return (node: HTMLElement) => {
		if (asked) node.focus();
	};
}
