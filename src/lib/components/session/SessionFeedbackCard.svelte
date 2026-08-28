<script lang="ts">
	import { apiClient } from '$lib/api/client';
	import type { SessionResponse } from '$lib/api/client';
	import Icon from '$lib/components/Icon.svelte';
	import { snackbar } from '$lib/stores/snackbar.svelte';
	import { formatSessionDateShort } from '$lib/sessions';

	interface Props {
		userId: string;
		session: SessionResponse;
		// Handed the session as the server holds it after a reply is written, so
		// the listing behind the modal can drop its awaiting-reply marker without
		// refetching every session.
		onReplied?: (session: SessionResponse) => void;
	}

	let { userId, session, onReplied }: Props = $props();

	// What a reply written from here produced, so the read receipt and the date
	// shown are the ones the server answered with rather than the copy the modal
	// loaded before the write. Guarded on the id so a card reused for another
	// session does not show the previous one's reply.
	let written = $state<SessionResponse | null>(null);
	const current = $derived<SessionResponse>(
		written && written.id === session.id ? written : session
	);
	const replied = $derived(Boolean(current.coach_reply));
	const notes = $derived(current.notes?.trim() ?? '');

	// The text in the box. Null while the coach has not typed, which is what lets
	// it follow the stored reply instead of freezing at whatever it was on mount.
	let draft = $state<string | null>(null);
	const reply = $derived(draft ?? current.coach_reply ?? '');

	// An existing reply is shown rather than edited until the coach asks for it;
	// a session with none opens straight into the box.
	let editRequested = $state(false);
	const editing = $derived(editRequested || !current.coach_reply);

	let saving = $state(false);
	const canSave = $derived(!saving && (replied || reply.trim() !== ''));

	async function save() {
		saving = true;
		try {
			const updated = await apiClient.setClientSessionReply(userId, current.id, reply);
			written = updated;
			draft = null;
			editRequested = false;
			onReplied?.(updated);
			snackbar.show(updated.coach_reply ? 'Reply sent to the athlete' : 'Reply removed');
		} catch (e) {
			snackbar.show(e instanceof Error ? e.message : 'Failed to save the reply', 'error');
		} finally {
			saving = false;
		}
	}

	function cancel() {
		draft = null;
		editRequested = false;
	}
</script>

<div
	style="background: var(--panel); border: 1px solid var(--bd); border-radius: var(--rl); box-shadow: var(--sh); overflow: hidden;"
>
	<div
		class="flex items-center gap-2"
		style="padding: 14px 18px; border-bottom: 1px solid var(--bd2);"
	>
		<Icon name="message" size={15} color="var(--pr)" />
		<h3 style="font-size: 13px; font-weight: 700; color: var(--tx);">Feedback</h3>
	</div>

	{#if notes}
		<div style="padding: 14px 18px; border-bottom: 1px solid var(--bd2);">
			<div
				style="font-size: 10.5px; color: var(--tx3); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 6px;"
			>
				How the athlete felt
			</div>
			<p style="font-size: 13px; color: var(--tx2); line-height: 1.6; white-space: pre-wrap;">
				{notes}
			</p>
		</div>
	{:else}
		<div style="padding: 14px 18px; border-bottom: 1px solid var(--bd2);">
			<p style="font-size: 12.5px; color: var(--tx3);">
				The athlete left no feedback on this session.
			</p>
		</div>
	{/if}

	<div style="padding: 14px 18px;">
		<div class="flex items-center justify-between" style="margin-bottom: 8px;">
			<div
				style="font-size: 10.5px; color: var(--tx3); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;"
			>
				Your reply
			</div>
			{#if replied && !editing}
				<div class="flex items-center gap-3">
					<span
						style="font-size: 11.5px; color: {current.coach_reply_read
							? 'var(--gn)'
							: 'var(--gd)'};"
					>
						{current.coach_reply_read ? 'Read by the athlete' : 'Not read yet'}
					</span>
					<button
						onclick={() => (editRequested = true)}
						class="flex items-center gap-1.5"
						style="padding: 4px 10px; border-radius: var(--rs); border: 1px solid var(--bd); background: var(--panel); color: var(--tx2); font-size: 12px; font-weight: 600; cursor: pointer; font-family: var(--font);"
					>
						<Icon name="edit" size={12} color="var(--tx2)" />
						Edit
					</button>
				</div>
			{/if}
		</div>

		{#if replied && !editing}
			<p style="font-size: 13px; color: var(--tx); line-height: 1.6; white-space: pre-wrap;">
				{current.coach_reply}
			</p>
			{#if current.coach_reply_at}
				<div style="font-size: 11.5px; color: var(--tx3); margin-top: 8px;">
					Sent {formatSessionDateShort(current.coach_reply_at)}
				</div>
			{/if}
		{:else}
			<label for="coach-reply" class="sr-only">Reply to the athlete</label>
			<textarea
				id="coach-reply"
				value={reply}
				oninput={(e) => (draft = e.currentTarget.value)}
				placeholder="Noted, I edited your program to rest more next time."
				rows={3}
				maxlength={4000}
				style="width: 100%; padding: 10px 14px; border: 1px solid var(--bd); border-radius: var(--rs); font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; resize: vertical; background: var(--panel);"
			></textarea>
			<div class="flex items-center justify-end gap-2" style="margin-top: 10px;">
				{#if replied}
					<button
						onclick={cancel}
						disabled={saving}
						style="padding: 8px 16px; border-radius: var(--rs); border: 1px solid var(--bd); background: var(--panel); color: var(--tx); font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font);"
						>Cancel</button
					>
				{/if}
				<button
					onclick={save}
					disabled={!canSave}
					class="flex items-center gap-1.5"
					style="
						padding: 8px 16px; border-radius: var(--rs);
						background: var(--pr); color: #fff; border: none;
						font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font);
						opacity: {canSave ? 1 : 0.6};
					"
				>
					<Icon name="check" size={14} color="#fff" />
					{saving ? 'Sending...' : replied ? 'Update reply' : 'Send reply'}
				</button>
			</div>
			<!-- An empty reply is how a coach takes an answer back, so the button
			     stays live once one exists even when the box has been cleared. -->
			{#if replied && reply.trim() === ''}
				<div style="font-size: 11.5px; color: var(--tx3); margin-top: 6px;">
					Saving an empty reply removes it.
				</div>
			{/if}
		{/if}
	</div>
</div>
