<script lang="ts">
	import type { Exercise, Tag } from '$lib/api/client';
	import TagFilterSelect from '$lib/components/TagFilterSelect.svelte';

	interface Props {
		exercises: Exercise[];
		onSelect: (exercise: Exercise) => void;
		onClose: () => void;
	}

	let { exercises, onSelect, onClose }: Props = $props();

	function focusOnMount(node: HTMLElement) {
		node.focus();
	}

	let search = $state('');
	let favoritesOnly = $state(false);
	let filterTags = $state<Tag[]>([]);

	let filtered = $derived.by(() => {
		let base = favoritesOnly ? exercises.filter((e) => e.is_favorite) : exercises;
		const q = search.trim().toLowerCase();
		if (q) base = base.filter((e) => e.name.toLowerCase().includes(q));
		if (filterTags.length > 0) {
			base = base.filter((e) => filterTags.every((t) => e.tags?.some((et) => et.id === t.id)));
		}
		return base;
	});
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onClose(); }} />

<div
	class="fixed inset-0 z-50 flex items-center justify-center"
	style="background: rgba(0,0,0,0.4);"
	role="dialog"
	aria-modal="true"
>
	<div class="flex w-full max-w-sm flex-col border-2 border-black bg-white" style="max-height: 80vh;">
		<div class="flex items-center justify-between border-b border-black px-5 py-3">
			<h2 class="font-black" style="font-family: monospace; font-size: 15px; letter-spacing: -0.5px;">
				Select exercise
			</h2>
			<button
				onclick={onClose}
				class="text-gray-400 transition-colors hover:text-black"
				style="font-family: monospace; font-size: 18px; line-height: 1;"
				aria-label="Close"
			>
				x
			</button>
		</div>

		<div class="flex gap-2 border-b border-gray-100 px-5 py-3">
			<input
				type="text"
				bind:value={search}
				placeholder="Search..."
				class="flex-1 border border-gray-200 px-2 py-1 outline-none focus:border-gray-400"
				style="font-family: monospace; font-size: 14px;"
				use:focusOnMount
			/>
			<button
				onclick={() => (favoritesOnly = !favoritesOnly)}
				class="border px-2 py-1 transition-colors"
				style="font-family: monospace; font-size: 12px; {favoritesOnly ? 'background-color: #C6613F; color: white; border-color: #C6613F;' : 'border-color: #ccc; color: #999;'}"
				title="Show favorites only"
			>
				fav
			</button>
		</div>

		<div class="border-b border-gray-100 px-5 py-3">
			<TagFilterSelect
				selectedTags={filterTags}
				onchange={(tags) => (filterTags = tags)}
			/>
		</div>

		<div class="flex-1 overflow-y-auto px-5 py-2">
			{#if filtered.length === 0}
				<p style="font-family: monospace; font-size: 13px; color: #bbb; padding: 8px 0;">
					No exercises found
				</p>
			{:else}
				{#each filtered as ex (ex.id)}
					<button
						onclick={() => onSelect(ex)}
						class="w-full border-b border-gray-50 px-2 py-2 text-left transition-colors hover:bg-gray-50"
						style="font-family: monospace; font-size: 14px;"
					>
						{ex.name}
						{#if ex.description}
							<span style="font-size: 12px; color: #999; margin-left: 8px;">{ex.description}</span>
						{/if}
					</button>
				{/each}
			{/if}
		</div>
	</div>
</div>
