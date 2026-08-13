<script lang="ts">
	interface Props {
		title: string;
		message: string;
		confirmLabel?: string;
		cancelLabel?: string;
		busyLabel?: string;
		busy?: boolean;
		onconfirm: () => void;
		oncancel: () => void;
	}

	let {
		title,
		message,
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		busyLabel = 'Working...',
		busy = false,
		onconfirm,
		oncancel
	}: Props = $props();

	function focusOnMount(node: HTMLElement) {
		node.focus();
	}

	function onKeydownCapture(e: KeyboardEvent) {
		e.stopPropagation();
		if (e.key === 'Escape' && !busy) {
			e.preventDefault();
			oncancel();
		}
	}
</script>

<svelte:window onkeydowncapture={onKeydownCapture} />

<div
	style="position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; background: rgba(45,36,29,0.4);"
	role="dialog"
	aria-modal="true"
	aria-label={title}
>
	<div
		style="
			background: var(--panel); border-radius: var(--rl); border: 1px solid var(--bd);
			box-shadow: var(--sh-hi); padding: 28px 32px; min-width: 340px; max-width: 420px;
		"
	>
		<p style="font-size: 16px; font-weight: 700; color: var(--tx); margin-bottom: 6px;">
			{title}
		</p>
		<p style="font-size: 13.5px; color: var(--tx2); margin-bottom: 24px;">
			{message}
		</p>
		<div style="display: flex; gap: 10px;">
			<button
				onclick={onconfirm}
				disabled={busy}
				style="
					padding: 9px 18px; border-radius: var(--rs);
					border: 1px solid var(--rd); background: var(--rd); color: #fff;
					font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font);
					opacity: {busy ? 0.6 : 1};
				">{busy ? busyLabel : confirmLabel}</button
			>
			<button
				onclick={oncancel}
				disabled={busy}
				use:focusOnMount
				style="
					padding: 9px 18px; border-radius: var(--rs);
					border: 1px solid var(--bd); background: #fff; color: var(--tx);
					font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font);
				">{cancelLabel}</button
			>
		</div>
	</div>
</div>
