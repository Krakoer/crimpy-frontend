<script lang="ts">
	import { apiClient, type Tag } from '$lib/api/client';

	interface Props {
		selectedTags: Tag[];
		onchange: (tags: Tag[]) => void;
		placeholder?: string;
	}

	let { selectedTags, onchange, placeholder = 'Filter by tag...' }: Props = $props();

	let open = $state(false);
	let search = $state('');
	let allTags = $state<Tag[]>([]);
	let container: HTMLDivElement;
	let searchInput = $state<HTMLInputElement | undefined>(undefined);

	let filtered = $derived.by(() => {
		const q = search.trim().toLowerCase();
		const unselected = allTags.filter((t) => !selectedTags.some((s) => s.id === t.id));
		const list = q ? unselected.filter((t) => t.name.toLowerCase().includes(q)) : unselected;
		return list.slice(0, 10);
	});

	async function openDropdown() {
		if (open) return;
		open = true;
		if (allTags.length === 0) {
			allTags = await apiClient.getTags();
		}
		setTimeout(() => searchInput?.focus(), 0);
	}

	function addTag(tag: Tag) {
		onchange([...selectedTags, tag]);
	}

	function removeTag(tagId: string, e: MouseEvent) {
		e.stopPropagation();
		onchange(selectedTags.filter((t) => t.id !== tagId));
	}

	function handleWindowClick(e: MouseEvent) {
		if (open && container && !container.contains(e.target as Node)) {
			open = false;
			search = '';
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			e.stopPropagation();
			open = false;
			search = '';
		}
	}
</script>

<svelte:window onclick={handleWindowClick} />

<div bind:this={container} class="relative" onkeydown={handleKeydown} role="none">
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		role="button"
		tabindex="0"
		onclick={openDropdown}
		onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDropdown(); } }}
		class="flex min-h-[38px] w-full cursor-pointer flex-wrap items-center gap-1 border px-3 py-2"
		style="font-family: monospace; font-size: 13px; border-color: black; border-width: {open ? '2px' : '1px'};"
	>
		{#each selectedTags as tag (tag.id)}
			<span
				class="inline-flex items-center gap-1 px-2 py-0.5 text-white"
				style="background-color: {tag.color}; font-family: monospace; font-size: 11px;"
			>
				{tag.name}
				<button
					type="button"
					onclick={(e) => removeTag(tag.id, e)}
					class="leading-none text-white/80 hover:text-white"
					style="font-size: 14px;"
					aria-label="Remove {tag.name}"
				>&times;</button>
			</span>
		{/each}
		{#if selectedTags.length === 0}
			<span style="color: #999; font-family: monospace; font-size: 13px;">{placeholder}</span>
		{/if}
	</div>

	{#if open}
		<div class="absolute z-50 mt-1 w-full border border-black bg-white shadow-sm">
			<div class="border-b border-gray-200 px-3 py-2">
				<input
					bind:this={searchInput}
					type="text"
					bind:value={search}
					placeholder="Search tags..."
					class="w-full outline-none"
					style="font-family: monospace; font-size: 13px;"
				/>
			</div>
			<div class="max-h-48 overflow-y-auto">
				{#each filtered as tag (tag.id)}
					<button
						type="button"
						onclick={() => addTag(tag)}
						class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50"
						style="font-family: monospace; font-size: 13px;"
					>
						<span class="h-3 w-3 flex-shrink-0 rounded-sm" style="background-color: {tag.color};"></span>
						<span>{tag.name}</span>
					</button>
				{/each}
				{#if filtered.length === 0}
					<p class="px-3 py-2" style="font-family: monospace; font-size: 12px; color: #999;">
						{search.trim() ? 'No matching tags.' : selectedTags.length > 0 ? 'All tags applied.' : 'No tags yet.'}
					</p>
				{/if}
			</div>
		</div>
	{/if}
</div>
