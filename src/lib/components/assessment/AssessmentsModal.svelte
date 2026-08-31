<script lang="ts">
	import type { AssessmentResponse } from '$lib/api/client';
	import Icon from '$lib/components/Icon.svelte';
	import AssessmentResults from './AssessmentResults.svelte';

	interface Props {
		athleteName: string;
		records: AssessmentResponse[];
		failed?: boolean;
		onClose: () => void;
	}

	let { athleteName, records, failed = false, onClose }: Props = $props();

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div
	style="position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(45,36,29,0.4);"
	role="dialog"
	aria-modal="true"
	aria-label="Assessment results"
>
	<div
		class="flex flex-col"
		style="
			width: 100%; max-width: 900px; max-height: 88vh;
			background: var(--panel); border-radius: var(--rl);
			border: 1px solid var(--bd); box-shadow: var(--sh-hi); overflow: hidden;
		"
	>
		<div
			class="flex shrink-0 items-center gap-3"
			style="padding: 18px 20px; background: var(--pr-fog); border-bottom: 1px solid var(--bd);"
		>
			<div
				class="flex items-center justify-center"
				style="width: 40px; height: 40px; border-radius: var(--rs); background: var(--panel); flex-shrink: 0;"
			>
				<Icon name="spark" size={20} color="var(--pl)" />
			</div>
			<div style="min-width: 0; flex: 1;">
				<div
					style="font-size: 11px; font-weight: 700; color: var(--pr); letter-spacing: 0.06em; text-transform: uppercase;"
				>
					Assessments
				</div>
				<h2
					class="truncate"
					style="font-size: 17px; font-weight: 700; color: var(--tx); margin-top: 1px;"
				>
					{athleteName}
				</h2>
			</div>
			<button
				onclick={onClose}
				class="flex items-center justify-center"
				style="width: 30px; height: 30px; border-radius: var(--rs); border: 1px solid var(--bd); background: var(--panel); cursor: pointer; color: var(--tx2); flex-shrink: 0;"
				aria-label="Close"
			>
				<Icon name="x" size={15} color="var(--tx2)" />
			</button>
		</div>

		<div class="space-y-3 overflow-y-auto" style="padding: 18px 20px; background: var(--bg);">
			<AssessmentResults {records} {failed} />
		</div>
	</div>
</div>
