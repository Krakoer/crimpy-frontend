import { AutoScroller, defaultPreset } from '@dnd-kit/dom';

// dnd-kit reserves a share of the scroll container as the band where a drag
// starts scrolling the page, and its default is a fifth of the height: 144
// pixels of a 720 pixel editor, top and bottom. A block card is several hundred
// pixels tall, so the handle of the block below the first one lands in that band
// on an ordinary coach screen, and pressing it scrolls the list out from under
// the pointer rather than picking the block up. A twentieth is 36 pixels, near
// enough to the edge that only a drag really aimed past the fold reaches it.
const AUTOSCROLL_EDGE_SHARE = 0.05;

// Every editor drives the same tree, so they share this the way they share the
// sensors rather than each restating it.
export const dndPlugins = defaultPreset.plugins.map((plugin) =>
	plugin === AutoScroller ? AutoScroller.configure({ threshold: AUTOSCROLL_EDGE_SHARE }) : plugin
);
