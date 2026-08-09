<script lang="ts">
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation';

	interface Props {
		dirty: boolean;
	}

	let { dirty }: Props = $props();

	let showModal = $state(false);
	let pendingUrl: URL | null = null;
	let pendingDelta: number | undefined = undefined;
	let pendingIsRoute = false;
	let leaveConfirmed = false;

	function focusOnMount(node: HTMLElement) {
		node.focus();
	}

	beforeNavigate((navigation) => {
		if (leaveConfirmed) {
			leaveConfirmed = false;
			return;
		}
		if (!dirty) return;
		if (navigation.to && navigation.to.url.href === navigation.from?.url.href) return;
		navigation.cancel();
		if (navigation.type === 'leave') return;
		pendingUrl = navigation.to?.url ?? null;
		pendingDelta = navigation.delta;
		pendingIsRoute = navigation.to?.route?.id != null;
		showModal = true;
	});

	afterNavigate(() => {
		leaveConfirmed = false;
	});

	function leave() {
		showModal = false;
		const target = pendingUrl;
		const delta = pendingDelta;
		const targetIsRoute = pendingIsRoute;
		pendingUrl = null;
		pendingDelta = undefined;
		if (delta !== undefined) {
			leaveConfirmed = true;
			history.go(delta);
		} else if (target) {
			leaveConfirmed = true;
			if (targetIsRoute) goto(target);
			else window.location.href = target.href;
		}
	}

	function stay() {
		showModal = false;
		pendingUrl = null;
		pendingDelta = undefined;
	}

	function onKeydownCapture(e: KeyboardEvent) {
		if (!showModal) return;
		e.stopPropagation();
		if (e.key === 'Escape') {
			e.preventDefault();
			stay();
		}
	}
</script>

<svelte:window onkeydowncapture={onKeydownCapture} />

{#if showModal}
	<div
		style="position: fixed; inset: 0; z-index: 2000; display: flex; align-items: center; justify-content: center; background: rgba(45,36,29,0.3);"
		role="dialog"
		aria-modal="true"
		aria-label="Unsaved changes"
	>
		<div
			style="
				background: var(--panel); border-radius: var(--rl); border: 1px solid var(--bd);
				box-shadow: var(--sh-hi); padding: 28px 32px; min-width: 340px;
			"
		>
			<p style="font-size: 16px; font-weight: 700; color: var(--tx); margin-bottom: 6px;">
				Unsaved changes
			</p>
			<p style="font-size: 13.5px; color: var(--tx2); margin-bottom: 24px;">
				Leave without saving?
			</p>
			<div style="display: flex; gap: 10px;">
				<button
					onclick={leave}
					style="
						padding: 9px 18px; border-radius: var(--rs);
						border: 1px solid var(--bd); background: #fff; color: var(--tx);
						font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font);
					">Leave</button
				>
				<button
					onclick={stay}
					use:focusOnMount
					style="
						padding: 9px 18px; border-radius: var(--rs);
						border: 1px solid var(--pr); background: var(--pr); color: #fff;
						font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font);
					">Stay</button
				>
			</div>
		</div>
	</div>
{/if}
