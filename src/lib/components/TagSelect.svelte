<script lang="ts">
	import { apiClient, type Tag } from '$lib/api/client';

	interface Props {
		selectedTags: Tag[];
		onchange: (tags: Tag[]) => void;
	}

	let { selectedTags, onchange }: Props = $props();

	let open = $state(false);
	let search = $state('');
	let allTags = $state<Tag[]>([]);
	let creating = $state(false);
	let container: HTMLDivElement;
	let searchInput = $state<HTMLInputElement | undefined>(undefined);

	let editingTagId = $state<string | null>(null);
	let editName = $state('');
	let editColor = $state('');
	let confirmDeleteId = $state<string | null>(null);
	let editSaving = $state(false);
	let editDeleting = $state(false);

	const TAG_COLORS = [
		'#E53935',
		'#8E24AA',
		'#1E88E5',
		'#00ACC1',
		'#43A047',
		'#FB8C00',
		'#6D4C41',
		'#546E7A'
	];

	let filtered = $derived.by(() => {
		const q = search.trim().toLowerCase();
		const list = q ? allTags.filter((t) => t.name.toLowerCase().includes(q)) : allTags;
		const sliced = list.slice(0, 10);
		if (editingTagId && !sliced.some((t) => t.id === editingTagId)) {
			const editing = allTags.find((t) => t.id === editingTagId);
			if (editing) return [editing, ...sliced.slice(0, 9)];
		}
		return sliced;
	});

	let showCreate = $derived.by(() => {
		const q = search.trim();
		return q.length > 0 && !allTags.some((t) => t.name.toLowerCase() === q.toLowerCase());
	});

	async function openDropdown() {
		if (open) return;
		open = true;
		if (allTags.length === 0) {
			allTags = await apiClient.getTags();
		}
		setTimeout(() => searchInput?.focus(), 0);
	}

	function isSelected(tag: Tag): boolean {
		return selectedTags.some((t) => t.id === tag.id);
	}

	function toggleTag(tag: Tag) {
		if (isSelected(tag)) {
			onchange(selectedTags.filter((t) => t.id !== tag.id));
		} else {
			onchange([...selectedTags, tag]);
		}
	}

	function removeTag(tagId: string, e: MouseEvent) {
		e.stopPropagation();
		onchange(selectedTags.filter((t) => t.id !== tagId));
	}

	async function createAndSelectTag() {
		const name = search.trim();
		if (!name || creating) return;
		creating = true;
		try {
			const color = TAG_COLORS[allTags.length % TAG_COLORS.length];
			const tag = await apiClient.createTag({ name, color });
			allTags = [tag, ...allTags];
			onchange([...selectedTags, tag]);
			search = '';
		} finally {
			creating = false;
		}
	}

	function startEdit(tag: Tag, e: MouseEvent) {
		e.stopPropagation();
		editingTagId = tag.id;
		editName = tag.name;
		editColor = tag.color;
		confirmDeleteId = null;
	}

	function cancelEdit(e?: MouseEvent) {
		e?.stopPropagation();
		editingTagId = null;
		confirmDeleteId = null;
	}

	async function saveEdit(e: MouseEvent) {
		e.stopPropagation();
		if (!editingTagId || !editName.trim() || editSaving) return;
		editSaving = true;
		try {
			const updated = await apiClient.updateTag(editingTagId, {
				name: editName.trim(),
				color: editColor
			});
			allTags = allTags.map((t) => (t.id === updated.id ? updated : t));
			if (selectedTags.some((t) => t.id === updated.id)) {
				onchange(selectedTags.map((t) => (t.id === updated.id ? updated : t)));
			}
			editingTagId = null;
		} finally {
			editSaving = false;
		}
	}

	async function deleteTag(e: MouseEvent) {
		e.stopPropagation();
		if (!confirmDeleteId || editDeleting) return;
		editDeleting = true;
		try {
			await apiClient.deleteTag(confirmDeleteId);
			const deletedId = confirmDeleteId;
			allTags = allTags.filter((t) => t.id !== deletedId);
			if (selectedTags.some((t) => t.id === deletedId)) {
				onchange(selectedTags.filter((t) => t.id !== deletedId));
			}
			editingTagId = null;
			confirmDeleteId = null;
		} finally {
			editDeleting = false;
		}
	}

	function handleWindowClick(e: MouseEvent) {
		if (open && container && !container.contains(e.target as Node)) {
			open = false;
			search = '';
			editingTagId = null;
			confirmDeleteId = null;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (editingTagId) {
				e.stopPropagation();
				editingTagId = null;
				confirmDeleteId = null;
			} else if (open) {
				e.stopPropagation();
				open = false;
				search = '';
			}
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
			<span style="color: #999; font-family: monospace; font-size: 13px;">Click to add tags</span>
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

			<div class="max-h-56 overflow-y-auto">
				{#each filtered as tag (tag.id)}
					{#if editingTagId === tag.id}
						<div class="border-b border-gray-100 px-3 py-2">
							<div class="flex items-center gap-2">
								<input
									type="color"
									bind:value={editColor}
									onclick={(e) => e.stopPropagation()}
									class="h-6 w-6 flex-shrink-0 cursor-pointer border-0 p-0"
									style="background: none;"
									aria-label="Tag color"
								/>
								<input
									type="text"
									bind:value={editName}
									onclick={(e) => e.stopPropagation()}
									class="flex-1 border-b border-gray-300 outline-none focus:border-black"
									style="font-family: monospace; font-size: 13px;"
								/>
								<button
									type="button"
									onclick={saveEdit}
									disabled={editSaving || !editName.trim()}
									class="px-2 py-0.5 text-white disabled:opacity-50"
									style="font-family: monospace; font-size: 11px; background-color: #C6613F;"
								>{editSaving ? '...' : 'save'}</button>
								<button
									type="button"
									onclick={cancelEdit}
									class="px-2 py-0.5 text-black hover:bg-gray-100"
									style="font-family: monospace; font-size: 11px; border: 1px solid #ccc;"
								>cancel</button>
							</div>
							{#if confirmDeleteId === tag.id}
								<div class="mt-2 flex items-center gap-2">
									<span style="font-family: monospace; font-size: 11px; color: #666;">Delete tag permanently?</span>
									<button
										type="button"
										onclick={deleteTag}
										disabled={editDeleting}
										class="px-2 py-0.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
										style="font-family: monospace; font-size: 11px; border: 1px solid #dc2626;"
									>{editDeleting ? '...' : 'confirm'}</button>
									<button
										type="button"
										onclick={(e) => { e.stopPropagation(); confirmDeleteId = null; }}
										class="px-2 py-0.5 hover:bg-gray-100"
										style="font-family: monospace; font-size: 11px; border: 1px solid #ccc;"
									>no</button>
								</div>
							{:else}
								<button
									type="button"
									onclick={(e) => { e.stopPropagation(); confirmDeleteId = tag.id; }}
									class="mt-1.5 text-red-500 hover:underline"
									style="font-family: monospace; font-size: 11px;"
								>Delete tag</button>
							{/if}
						</div>
					{:else}
						<div class="group flex w-full items-center">
							<button
								type="button"
								onclick={() => toggleTag(tag)}
								class="flex flex-1 items-center gap-2 px-3 py-2 text-left hover:bg-gray-50"
								style="font-family: monospace; font-size: 13px;"
							>
								<span
									class="h-3 w-3 flex-shrink-0 rounded-sm"
									style="background-color: {tag.color};"
								></span>
								<span class="flex-1">{tag.name}</span>
								{#if isSelected(tag)}
									<span style="color: #C6613F; font-size: 11px; font-family: monospace;">x</span>
								{/if}
							</button>
							{#if !tag.is_builtin}
							<button
								type="button"
								onclick={(e) => startEdit(tag, e)}
								class="px-2 py-2 opacity-0 transition-opacity hover:text-black group-hover:opacity-100"
								style="font-family: monospace; font-size: 10px; color: #999;"
								aria-label="Edit {tag.name}"
							>edit</button>
						{/if}
						</div>
					{/if}
				{/each}

				{#if filtered.length === 0 && !showCreate}
					<p class="px-3 py-2" style="font-family: monospace; font-size: 12px; color: #999;">
						{search.trim() ? 'No matching tags.' : 'No tags yet.'}
					</p>
				{/if}

				{#if showCreate}
					<button
						type="button"
						onclick={createAndSelectTag}
						disabled={creating}
						class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 disabled:opacity-50"
						style="font-family: monospace; font-size: 13px; color: #C6613F; {filtered.length > 0 ? 'border-top: 1px solid #e5e7eb;' : ''}"
					>
						{creating ? 'Creating...' : `+ Create "${search.trim()}"`}
					</button>
				{/if}
			</div>
		</div>
	{/if}
</div>
