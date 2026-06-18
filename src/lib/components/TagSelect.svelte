<script lang="ts">
	import { apiClient, type Tag } from '$lib/api/client';
	import Icon from '$lib/components/Icon.svelte';

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
			allTags = [...allTags, tag];
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

	function cancelEdit() {
		editingTagId = null;
		confirmDeleteId = null;
	}

	async function saveEdit() {
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

	async function deleteTag() {
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

<div bind:this={container} style="position: relative;" onkeydown={handleKeydown} role="none">
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		role="button"
		tabindex="0"
		onclick={openDropdown}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				openDropdown();
			}
		}}
		style="
			display: flex; min-height: 36px; width: 100%; cursor: pointer;
			flex-wrap: wrap; align-items: center; gap: 4px;
			border: 1px solid {open ? 'var(--pr)' : 'var(--bd)'};
			border-radius: var(--rs); padding: 5px 10px;
			background: var(--panel2); font-family: var(--font);
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
					aria-label="Remove {tag.name}">&times;</button
				>
			</span>
		{/each}
		{#if selectedTags.length === 0}
			<span style="color: var(--tx3); font-size: 12.5px;">Click to add tags</span>
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

			<div style="max-height: 224px; overflow-y: auto;">
				{#each filtered as tag (tag.id)}
					{#if editingTagId === tag.id}
						<div style="border-bottom: 1px solid var(--bd2); padding: 10px 12px;">
							<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
								<input
									type="color"
									bind:value={editColor}
									onclick={(e) => e.stopPropagation()}
									style="
										width: 24px; height: 24px; flex-shrink: 0; cursor: pointer;
										border: 1px solid var(--bd); border-radius: 4px; padding: 1px; background: none;
									"
									aria-label="Tag color"
								/>
								<input
									type="text"
									bind:value={editName}
									onclick={(e) => e.stopPropagation()}
									style="
										flex: 1; border: none; border-bottom: 1px solid var(--bd); outline: none;
										font-family: var(--font); font-size: 13px; color: var(--tx);
										padding-bottom: 2px; background: transparent;
									"
								/>
								<button
									type="button"
									onclick={saveEdit}
									disabled={editSaving || !editName.trim()}
									style="
										padding: 4px 10px; border-radius: var(--rs); border: none;
										background: var(--pr); color: #fff; font-size: 11.5px; font-weight: 600;
										cursor: pointer; font-family: var(--font);
										opacity: {editSaving || !editName.trim() ? 0.6 : 1};
									">{editSaving ? '...' : 'Save'}</button
								>
								<button
									type="button"
									onclick={cancelEdit}
									style="
										padding: 4px 10px; border-radius: var(--rs);
										border: 1px solid var(--bd); background: #fff; color: var(--tx);
										font-size: 11.5px; font-weight: 600; cursor: pointer; font-family: var(--font);
									">Cancel</button
								>
							</div>
							{#if confirmDeleteId === tag.id}
								<div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
									<span style="font-size: 11.5px; color: var(--tx2); font-family: var(--font);"
										>Delete tag permanently?</span
									>
									<button
										type="button"
										onclick={deleteTag}
										disabled={editDeleting}
										style="
											padding: 3px 8px; border-radius: var(--rs);
											border: 1px solid var(--rd); color: var(--rd); background: #fff5f5;
											font-size: 11px; font-weight: 600; cursor: pointer; font-family: var(--font);
											opacity: {editDeleting ? 0.6 : 1};
										">{editDeleting ? '...' : 'Confirm'}</button
									>
									<button
										type="button"
										onclick={(e) => {
											e.stopPropagation();
											confirmDeleteId = null;
										}}
										style="
											padding: 3px 8px; border-radius: var(--rs);
											border: 1px solid var(--bd); background: #fff; color: var(--tx);
											font-size: 11px; font-weight: 600; cursor: pointer; font-family: var(--font);
										">No</button
									>
								</div>
							{:else}
								<button
									type="button"
									onclick={(e) => {
										e.stopPropagation();
										confirmDeleteId = tag.id;
									}}
									style="
										background: none; border: none; cursor: pointer; padding: 0;
										font-size: 11.5px; color: var(--rd); font-family: var(--font);
										text-decoration: underline; margin-top: 2px;
									">Delete tag</button
								>
							{/if}
						</div>
					{:else}
						<div
							class="tag-row"
							style="display: flex; width: 100%; align-items: center;"
							role="none"
						>
							<button
								type="button"
								onclick={() => toggleTag(tag)}
								style="
									display: flex; flex: 1; align-items: center; gap: 8px;
									padding: 8px 12px; text-align: left; background: none; border: none;
									cursor: pointer; font-family: var(--font); font-size: 13px; color: var(--tx);
								"
							>
								<span
									style="width: 10px; height: 10px; flex-shrink: 0; border-radius: 3px; background: {tag.color};"
								></span>
								<span style="flex: 1;">{tag.name}</span>
								{#if isSelected(tag)}
									<Icon name="check" size={13} color="var(--pr)" />
								{/if}
							</button>
							{#if !tag.is_builtin}
								<button
									type="button"
									onclick={(e) => startEdit(tag, e)}
									class="tag-edit-btn"
									style="
										padding: 8px 10px; background: none; border: none; cursor: pointer;
										color: var(--tx3); opacity: 0; transition: opacity 0.1s;
									"
									aria-label="Edit {tag.name}"
								>
									<Icon name="edit" size={13} color="var(--tx3)" />
								</button>
							{/if}
						</div>
					{/if}
				{/each}

				{#if filtered.length === 0 && !showCreate}
					<p
						style="padding: 10px 12px; font-size: 12px; color: var(--tx3); font-family: var(--font);"
					>
						{search.trim() ? 'No matching tags.' : 'No tags yet.'}
					</p>
				{/if}

				{#if showCreate}
					<button
						type="button"
						onclick={createAndSelectTag}
						disabled={creating}
						style="
							display: flex; width: 100%; align-items: center; gap: 8px;
							padding: 8px 12px; text-align: left; background: none; border: none;
							cursor: pointer; font-family: var(--font); font-size: 13px; color: var(--pr);
							font-weight: 600; border-top: 1px solid var(--bd2);
							opacity: {creating ? 0.6 : 1};
						"
						onmouseenter={(e) => (e.currentTarget.style.background = 'var(--pr-fog)')}
						onmouseleave={(e) => (e.currentTarget.style.background = '')}
					>
						{creating ? 'Creating...' : `+ Create "${search.trim()}"`}
					</button>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.tag-row:hover {
		background: var(--panel2);
	}
	.tag-row:hover .tag-edit-btn {
		opacity: 1 !important;
	}
</style>
