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

<div bind:this={container} style="position: relative;" onkeydown={handleKeydown} role="none">
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		role="button"
		tabindex="0"
		onclick={openDropdown}
		onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDropdown(); } }}
		style="
			display: flex; min-height: 34px; width: 100%; cursor: pointer;
			flex-wrap: wrap; align-items: center; gap: 4px;
			border: 1px solid {open ? 'var(--pr)' : 'var(--bd)'};
			border-radius: var(--rs); padding: 5px 10px;
			background: var(--panel2); font-family: var(--font); font-size: 13px;
			transition: border-color 0.15s;
		"
	>
		{#each selectedTags as tag (tag.id)}
			<span
				style="
					display: inline-flex; align-items: center; gap: 4px;
					padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600;
					color: #fff; background: {tag.color};
				"
			>
				{tag.name}
				<button
					type="button"
					onclick={(e) => removeTag(tag.id, e)}
					style="
						background: none; border: none; cursor: pointer; padding: 0;
						color: rgba(255,255,255,0.8); font-size: 13px; line-height: 1;
						display: flex; align-items: center;
					"
					aria-label="Remove {tag.name}"
				>&times;</button>
			</span>
		{/each}
		{#if selectedTags.length === 0}
			<span style="color: var(--tx3); font-size: 12.5px;">{placeholder}</span>
		{/if}
	</div>

	{#if open}
		<div
			style="
				position: absolute; z-index: 50; margin-top: 4px; width: 100%;
				border: 1px solid var(--bd); border-radius: var(--rs);
				background: #fff; box-shadow: 0 4px 16px rgba(45,36,29,0.1);
				overflow: hidden;
			"
		>
			<div style="border-bottom: 1px solid var(--bd2); padding: 8px 10px;">
				<input
					bind:this={searchInput}
					type="text"
					bind:value={search}
					placeholder="Search tags..."
					style="
						width: 100%; border: none; outline: none; background: transparent;
						font-family: var(--font); font-size: 13px; color: var(--tx);
					"
				/>
			</div>
			<div style="max-height: 192px; overflow-y: auto;">
				{#each filtered as tag (tag.id)}
					<button
						type="button"
						onclick={() => addTag(tag)}
						style="
							display: flex; width: 100%; align-items: center; gap: 8px;
							padding: 8px 12px; text-align: left; background: none; border: none;
							cursor: pointer; font-family: var(--font); font-size: 13px; color: var(--tx);
						"
						onmouseenter={(e) => (e.currentTarget.style.background = 'var(--panel2)')}
						onmouseleave={(e) => (e.currentTarget.style.background = 'none')}
					>
						<span style="width: 10px; height: 10px; flex-shrink: 0; border-radius: 3px; background: {tag.color};"></span>
						<span>{tag.name}</span>
					</button>
				{/each}
				{#if filtered.length === 0}
					<p style="padding: 10px 12px; font-size: 12px; color: var(--tx3); font-family: var(--font);">
						{search.trim() ? 'No matching tags.' : selectedTags.length > 0 ? 'All tags applied.' : 'No tags yet.'}
					</p>
				{/if}
			</div>
		</div>
	{/if}
</div>
