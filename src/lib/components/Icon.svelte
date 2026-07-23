<script lang="ts">
	let {
		name,
		size = 18,
		color = 'currentColor',
		fill = 'none'
	}: { name: string; size?: number; color?: string; fill?: string } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke={color}
	stroke-width="1.6"
	stroke-linecap="round"
	stroke-linejoin="round"
	style="display:block; flex-shrink:0;"
>
	{#if name === 'home'}
		<path d="M4 11 12 4l8 7" /><path d="M6 10v9h12v-9" /><path d="M10 19v-5h4v5" />
	{:else if name === 'users'}
		<circle cx="9" cy="9" r="3.2" /><path d="M3 19c.5-3 3-4.5 6-4.5s5.5 1.5 6 4.5" /><circle
			cx="17"
			cy="8"
			r="2.4"
		/><path d="M15 14.5c2.6-.2 5 .8 6 4.5" />
	{:else if name === 'dumbbell'}
		<path d="M4 9v6M7 7v10M17 7v10M20 9v6" /><path d="M7 12h10" />
	{:else if name === 'calendar'}
		<rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
	{:else if name === 'shield'}
		<path d="M12 3.5 5 6v6c0 4.2 3 7.5 7 8.5 4-1 7-4.3 7-8.5V6l-7-2.5Z" />
	{:else if name === 'bell'}
		<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2H4.5L6 16Z" /><path d="M10 19a2 2 0 0 0 4 0" />
	{:else if name === 'search'}
		<circle cx="11" cy="11" r="6" /><path d="m20 20-4.3-4.3" />
	{:else if name === 'plus'}
		<path d="M12 5v14M5 12h14" />
	{:else if name === 'chevron'}
		<path d="m9 6 6 6-6 6" />
	{:else if name === 'chevron-down'}
		<path d="m6 9 6 6 6-6" />
	{:else if name === 'arrow-left'}
		<path d="M19 12H5M12 5l-7 7 7 7" />
	{:else if name === 'arrow-up'}
		<path d="M12 19V5M5 12l7-7 7 7" />
	{:else if name === 'arrow-down'}
		<path d="M12 5v14M5 12l7 7 7-7" />
	{:else if name === 'check'}
		<path d="m5 12 4.5 4.5L19 7" />
	{:else if name === 'dots'}
		<circle cx="6" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle
			cx="18"
			cy="12"
			r="1.4"
		/>
	{:else if name === 'filter'}
		<path d="M4 6h16M7 12h10M10 18h4" />
	{:else if name === 'layers'}
		<path d="M12 3 3 8l9 5 9-5-9-5Z" /><path d="M3 13l9 5 9-5" />
	{:else if name === 'spark'}
		<path d="M3 17l5-7 4 4 4-6 5 7" />
	{:else if name === 'logout'}
		<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /><path d="M10 8l-4 4 4 4M6 12h11" />
	{:else if name === 'settings'}
		<circle cx="12" cy="12" r="3" /><path
			d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.4.9a7 7 0 0 0-2.1-1.2L14 3h-4l-.4 2.6a7 7 0 0 0-2.1 1.2l-2.4-.9-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.4-.9c.6.5 1.4 1 2.1 1.2L10 21h4l.4-2.6c.7-.3 1.5-.7 2.1-1.2l2.4.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z"
		/>
	{:else if name === 'grip'}
		<circle cx="8" cy="7" r="1.2" /><circle cx="16" cy="7" r="1.2" /><circle
			cx="8"
			cy="12"
			r="1.2"
		/><circle cx="16" cy="12" r="1.2" /><circle cx="8" cy="17" r="1.2" /><circle
			cx="16"
			cy="17"
			r="1.2"
		/>
	{:else if name === 'link'}
		<path d="M9 15a3 3 0 0 0 4.2 0l3-3a3 3 0 0 0-4.2-4.2l-1 1" /><path
			d="M15 9a3 3 0 0 0-4.2 0l-3 3a3 3 0 0 0 4.2 4.2l1-1"
		/>
	{:else if name === 'copy'}
		<rect x="8" y="8" width="12" height="12" rx="2" /><path
			d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"
		/>
	{:else if name === 'paste'}
		<rect x="7" y="4" width="10" height="16" rx="2" /><path
			d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"
		/><path d="M10 11h4M10 15h3" />
	{:else if name === 'play'}
		<path d="M7 5v14l12-7z" fill={color} stroke="none" />
	{:else if name === 'trash'}
		<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />
	{:else if name === 'edit'}
		<path d="M4 20h4l11-11-4-4L4 16v4Z" /><path d="m14 6 4 4" />
	{:else if name === 'flame'}
		<path d="M12 3c1 4 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8Z" />
	{:else if name === 'mountain'}
		<path d="M3 19 10 8l4 6 2-3 5 8H3Z" />
	{:else if name === 'clock'}
		<circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" />
	{:else if name === 'star'}
		<path
			d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
			{fill}
		/>
	{:else if name === 'x'}
		<path d="M18 6L6 18M6 6l12 12" />
	{:else}
		<circle cx="12" cy="12" r="6" />
	{/if}
</svg>
