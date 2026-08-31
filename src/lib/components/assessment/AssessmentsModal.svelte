<script lang="ts">
	import type { AssessmentResponse } from '$lib/api/client';
	import Icon from '$lib/components/Icon.svelte';
	import AssessmentHistoryTable from './AssessmentHistoryTable.svelte';
	import AssessmentResultCard from './AssessmentResultCard.svelte';
	import { groupRecordedAssessments, measuredAt } from './assessment-records';

	interface Props {
		athleteName: string;
		records: AssessmentResponse[];
		onClose: () => void;
	}

	let { athleteName, records, onClose }: Props = $props();

	const recorded = $derived(groupRecordedAssessments(records));
	const history = $derived([...records].sort((a, b) => measuredAt(b) - measuredAt(a)).slice(0, 8));

	// Keyed by assessment id rather than by a discriminator, so a coach's own
	// assessment keeps its own grip and chart state.
	let selectedGrip = $state<Record<string, number>>({});
	let showChart = $state<Record<string, boolean>>({});

	$effect(() => {
		for (const assessment of recorded) {
			if (!assessment.hasGrips) continue;
			const grips = [...new Set(assessment.records.map((r) => r.grip_position ?? 0))];
			if (grips.length > 0 && !grips.includes(selectedGrip[assessment.id])) {
				selectedGrip[assessment.id] = grips.sort((a, b) => a - b)[0];
			}
		}
	});

	function formatAssessmentDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
	}

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
			{#if recorded.length === 0}
				<div
					style="background: var(--panel); border: 1px solid var(--bd); border-radius: var(--rl); padding: 32px 24px; text-align: center; font-size: 13px; color: var(--tx3);"
				>
					No assessment records yet, so every load written as a percentage falls back to the value
					set on the training.
				</div>
			{:else}
				<div
					role="list"
					aria-label="Assessment results"
					style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px;"
				>
					{#each recorded as assessment (assessment.id)}
						<AssessmentResultCard
							{assessment}
							selectedGrip={selectedGrip[assessment.id] ?? 0}
							onSelectGrip={(grip) => (selectedGrip[assessment.id] = grip)}
							showChart={showChart[assessment.id] ?? false}
							onToggleChart={() =>
								(showChart[assessment.id] = !(showChart[assessment.id] ?? false))}
						/>
					{/each}
				</div>

				<AssessmentHistoryTable records={history} formatDate={formatAssessmentDate} />
			{/if}
		</div>
	</div>
</div>
