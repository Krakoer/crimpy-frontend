<script lang="ts">
	import { apiClient } from '$lib/api/client';
	import type { Exercise } from '$lib/api/client';
	import { snackbar } from '$lib/stores/snackbar.svelte';

	interface Props {
		onCreated: (exercise: Exercise) => void;
		onClose: () => void;
	}

	let { onCreated, onClose }: Props = $props();

	function focusOnMount(node: HTMLElement) {
		node.focus();
	}

	let name = $state('');
	let description = $state('');
	let comment = $state('');
	let videoLink = $state('');
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
	class="fixed inset-0 z-50 flex items-center justify-center"
	style="background: rgba(0,0,0,0.4);"
	role="dialog"
	aria-modal="true"
>
	<div class="w-full max-w-md border-2 border-black bg-white">
		<div class="flex items-center justify-between border-b border-black px-6 py-4">
			<h2 class="font-black" style="font-family: monospace; font-size: 16px; letter-spacing: -0.5px;">
				New exercise
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

		<div class="space-y-4 px-6 py-5">
			{#if error}
				<p style="font-family: monospace; font-size: 13px; color: #B85450;">{error}</p>
			{/if}

			<div>
				<label for="cem-name" class="mb-1 block font-medium" style="font-family: monospace; font-size: 11px; letter-spacing: 0.5px; color: #666;">
					NAME *
				</label>
				<input
					id="cem-name"
					type="text"
					bind:value={name}
					class="w-full border border-black px-3 py-2 outline-none focus:border-2"
					style="font-family: monospace; font-size: 13px;"
					placeholder="Exercise name"
					use:focusOnMount
				/>
			</div>

			<div>
				<label for="cem-description" class="mb-1 block font-medium" style="font-family: monospace; font-size: 11px; letter-spacing: 0.5px; color: #666;">
					DESCRIPTION
				</label>
				<textarea
					id="cem-description"
					bind:value={description}
					rows="2"
					class="w-full resize-none border border-black px-3 py-2 outline-none focus:border-2"
					style="font-family: monospace; font-size: 13px;"
					placeholder="What this exercise is"
				></textarea>
			</div>

			<div>
				<label for="cem-comment" class="mb-1 block font-medium" style="font-family: monospace; font-size: 11px; letter-spacing: 0.5px; color: #666;">
					EXECUTION NOTES
				</label>
				<textarea
					id="cem-comment"
					bind:value={comment}
					rows="2"
					class="w-full resize-none border border-black px-3 py-2 outline-none focus:border-2"
					style="font-family: monospace; font-size: 13px;"
					placeholder="How to perform it correctly"
				></textarea>
			</div>

			<div>
				<label for="cem-video" class="mb-1 block font-medium" style="font-family: monospace; font-size: 11px; letter-spacing: 0.5px; color: #666;">
					VIDEO LINK
				</label>
				<input
					id="cem-video"
					type="url"
					bind:value={videoLink}
					class="w-full border border-black px-3 py-2 outline-none focus:border-2"
					style="font-family: monospace; font-size: 13px;"
					placeholder="https://..."
				/>
			</div>
		</div>

		<div class="flex gap-3 border-t border-black px-6 py-4">
			<button
				onclick={handleSave}
				disabled={saving || !name.trim()}
				class="flex-1 border-2 px-4 py-2 font-bold transition-colors disabled:opacity-50"
				style="font-family: monospace; font-size: 13px; background-color: #C6613F; color: white; border-color: #C6613F;"
			>
				{saving ? 'SAVING...' : 'CREATE'}
			</button>
			<button
				onclick={onClose}
				class="border border-black px-4 py-2 transition-colors hover:bg-gray-100"
				style="font-family: monospace; font-size: 13px;"
			>
				CANCEL
			</button>
		</div>
	</div>
</div>
