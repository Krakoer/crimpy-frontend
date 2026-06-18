<script lang="ts">
	import { untrack } from 'svelte';
	import { apiClient } from '$lib/api/client';
	import type { Exercise, Tag } from '$lib/api/client';
	import { snackbar } from '$lib/stores/snackbar.svelte';
	import TagSelect from '$lib/components/TagSelect.svelte';

	interface Props {
		onCreated: (exercise: Exercise) => void;
		onClose: () => void;
		initialTags?: Tag[];
	}

	let { onCreated, onClose, initialTags = [] }: Props = $props();

	function focusOnMount(node: HTMLElement) {
		node.focus();
	}

	let name = $state('');
	let description = $state('');
	let comment = $state('');
	let videoLink = $state('');
	let selectedTags = $state<Tag[]>(untrack(() => initialTags));
	let saving = $state(false);
	let error = $state('');

	async function handleSave() {
		if (!name.trim()) return;
		saving = true;
		error = '';
		try {
			const exercise = await apiClient.createExercise({
				name: name.trim(),
				description: description.trim() || undefined,
				comment: comment.trim() || undefined,
				video_link: videoLink.trim() || undefined
			});
			if (selectedTags.length > 0) {
				await Promise.all(
					selectedTags.map((t) => apiClient.assignTagToExercise(exercise.id, t.id))
				);
				exercise.tags = selectedTags;
			}
			snackbar.show('Exercise created');
			onCreated(exercise);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to create exercise.';
		} finally {
			saving = false;
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div
	style="position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background: rgba(45,36,29,0.4);"
	role="dialog"
	aria-modal="true"
>
	<div
		style="
			width: 100%; max-width: 460px;
			background: #fff; border-radius: var(--rl);
			box-shadow: var(--sh-hi); border: 1px solid var(--bd);
		"
	>
		<div
			style="
				display: flex; align-items: center; justify-content: space-between;
				padding: 18px 24px; border-bottom: 1px solid var(--bd);
				border-radius: var(--rl) var(--rl) 0 0;
			"
		>
			<h2 style="font-size: 15px; font-weight: 700; color: var(--tx);">New exercise</h2>
			<button
				onclick={onClose}
				style="
					display: flex; align-items: center; justify-content: center;
					width: 28px; height: 28px; border-radius: var(--rs);
					border: 1px solid var(--bd); background: #fff;
					cursor: pointer; font-size: 16px; color: var(--tx2);
				"
				aria-label="Close">x</button
			>
		</div>

		<div style="padding: 20px 24px; display: flex; flex-direction: column; gap: 16px;">
			{#if error}
				<div
					style="border: 1px solid var(--rd); background: #fff5f5; border-radius: var(--rs); padding: 12px; font-size: 12.5px; color: var(--rd);"
				>
					{error}
				</div>
			{/if}

			<div>
				<label
					for="cem-name"
					style="display: block; font-size: 11px; color: var(--tx3); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; margin-bottom: 6px;"
				>
					Name *
				</label>
				<input
					id="cem-name"
					type="text"
					bind:value={name}
					placeholder="Exercise name"
					style="
						width: 100%; border: 1px solid var(--bd); border-radius: var(--rs);
						padding: 9px 12px; font-family: var(--font); font-size: 13.5px; color: var(--tx);
						outline: none; background: #fff;
					"
					use:focusOnMount
				/>
			</div>

			<div>
				<label
					for="cem-description"
					style="display: block; font-size: 11px; color: var(--tx3); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; margin-bottom: 6px;"
				>
					Description
				</label>
				<textarea
					id="cem-description"
					bind:value={description}
					rows="2"
					placeholder="What this exercise is"
					style="
						width: 100%; resize: none; border: 1px solid var(--bd); border-radius: var(--rs);
						padding: 9px 12px; font-family: var(--font); font-size: 13.5px; color: var(--tx);
						outline: none; background: #fff;
					"
				></textarea>
			</div>

			<div>
				<label
					for="cem-comment"
					style="display: block; font-size: 11px; color: var(--tx3); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; margin-bottom: 6px;"
				>
					Execution notes
				</label>
				<textarea
					id="cem-comment"
					bind:value={comment}
					rows="2"
					placeholder="How to perform it correctly"
					style="
						width: 100%; resize: none; border: 1px solid var(--bd); border-radius: var(--rs);
						padding: 9px 12px; font-family: var(--font); font-size: 13.5px; color: var(--tx);
						outline: none; background: #fff;
					"
				></textarea>
			</div>

			<div>
				<label
					for="cem-video"
					style="display: block; font-size: 11px; color: var(--tx3); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; margin-bottom: 6px;"
				>
					Video link
				</label>
				<input
					id="cem-video"
					type="url"
					bind:value={videoLink}
					placeholder="https://..."
					style="
						width: 100%; border: 1px solid var(--bd); border-radius: var(--rs);
						padding: 9px 12px; font-family: var(--font); font-size: 13.5px; color: var(--tx);
						outline: none; background: #fff;
					"
				/>
			</div>

			<div>
				<p
					style="font-size: 11px; color: var(--tx3); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; margin-bottom: 6px;"
				>
					Tags
				</p>
				<TagSelect {selectedTags} onchange={(tags) => (selectedTags = tags)} />
			</div>
		</div>

		<div
			style="display: flex; gap: 10px; padding: 16px 24px; border-top: 1px solid var(--bd); border-radius: 0 0 var(--rl) var(--rl);"
		>
			<button
				onclick={handleSave}
				disabled={saving || !name.trim()}
				style="
					flex: 1; padding: 9px 16px; border-radius: var(--rs);
					background: var(--pr); color: #fff; border: 1px solid var(--pr);
					font-size: 13.5px; font-weight: 600; cursor: pointer; font-family: var(--font);
					opacity: {saving || !name.trim() ? 0.5 : 1};
				"
			>
				{saving ? 'Creating...' : 'Create'}
			</button>
			<button
				onclick={onClose}
				style="
					padding: 9px 16px; border-radius: var(--rs);
					background: #fff; color: var(--tx); border: 1px solid var(--bd);
					font-size: 13.5px; font-weight: 600; cursor: pointer; font-family: var(--font);
				"
			>
				Cancel
			</button>
		</div>
	</div>
</div>
