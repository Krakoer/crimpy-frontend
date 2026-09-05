import { KeyboardSensor, PointerSensor } from '@dnd-kit/svelte';
import { PointerActivationConstraints } from '@dnd-kit/dom';

// Eight pixels of travel before a press counts as a drag, so a click on a block
// still opens it rather than picking it up.
//
// The keyboard sensor is half of what dnd-kit binds by default, and naming any
// sensor at all replaces that default pair rather than adding to it. Listing
// only the pointer is what took reordering away from anyone not holding one:
// Space or Enter picks a block up, the arrow keys move it, Space, Enter or Tab
// drops it, Escape puts it back. Every editor drives the same tree, so they
// share the same sensors rather than each restating them.
export const dndSensors = [
	PointerSensor.configure({
		activationConstraints: [new PointerActivationConstraints.Distance({ value: 8 })]
	}),
	KeyboardSensor
];
