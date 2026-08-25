<script lang="ts">
	import { onMount } from 'svelte';
	import { apiClient } from '$lib/api/client';
	import type { RepData, SessionAssessment, SessionDetail, SessionResponse } from '$lib/api/client';
	import Icon from '$lib/components/Icon.svelte';
	import SessionRepsCard from '$lib/components/session/SessionRepsCard.svelte';
	import SessionPrescriptionCard from '$lib/components/session/SessionPrescriptionCard.svelte';
	import {
		formatDuration,
		formatSessionDate,
		formatSessionDateShort,
		formatSessionTime,
		gripLabel,
		sessionActivityInfo
	} from '$lib/sessions';

	interface Props {
		userId: string;
		session: SessionResponse;
		onClose: () => void;
	}

	let { userId, session, onClose }: Props = $props();

	// The listing already carries enough to draw the header, so the summary is
	// shown straight away and the fetched detail takes over once it lands.
	let loaded = $state<SessionDetail | null>(null);
	let loading = $state(true);
	let error = $state('');

	const detail = $derived<SessionResponse>(loaded?.session ?? session);
	const reps = $derived<RepData[]>(loaded?.rep_datas ?? []);
	// Whether there are measurements to show is decided by the reps the session
	// carries, not by what it was labelled: a hangboard block a coach filed under
	// any activity still comes back with every rep the sensor recorded. Played
	// sessions with no reps yet still get the layout, so the empty state below can
	// say so rather than the session looking like a hand-written log.
	const hasRepData = $derived(reps.length > 0 || detail.origin === 'played');
	const assessments = $derived<SessionAssessment[]>(loaded?.assessments ?? []);
	const type = $derived(sessionActivityInfo(detail.activity));

	onMount(async () => {
		try {
			loaded = await apiClient.getClientSession(userId, session.id);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load the session.';
		} finally {
			loading = false;
		}
	});

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	// The result rows carry their own definition, so a value is formatted from the
	// unit it was measured in without a catalog to look anything up in.
	function formatValue(value: number | null | undefined, unit: string): string {
		if (value === null || value === undefined) return '--';
		return unit === 'kilograms' ? value.toFixed(1) : value.toFixed(0);
	}

	const UNIT_LABELS: Record<string, string> = {
		kilograms: 'kg',
		seconds: 's',
		repetitions: 'reps'
	};
</script>

<svelte:window onkeydown={onKeydown} />

<div
	style="position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(45,36,29,0.4);"
	role="dialog"
	aria-modal="true"
	aria-label="Session details"
>
	<div
		class="flex flex-col"
		style="
			width: 100%; max-width: 720px; max-height: 88vh;
			background: var(--panel); border-radius: var(--rl);
			border: 1px solid var(--bd); box-shadow: var(--sh-hi); overflow: hidden;
		"
	>
		<div
			class="flex shrink-0 items-center gap-3"
			style="padding: 18px 20px; background: {type.tint}; border-bottom: 1px solid var(--bd);"
		>
			<div
				class="flex items-center justify-center"
				style="width: 40px; height: 40px; border-radius: var(--rs); background: var(--panel); flex-shrink: 0;"
			>
				<Icon name={type.icon} size={20} color={type.color} />
			</div>
			<div style="min-width: 0; flex: 1;">
				<div
					style="font-size: 11px; font-weight: 700; color: {type.color}; letter-spacing: 0.06em; text-transform: uppercase;"
				>
					{type.label}{detail.is_assessment ? ' - Assessment' : ''}
				</div>
				<h2
					class="truncate"
					style="font-size: 17px; font-weight: 700; color: var(--tx); margin-top: 1px;"
				>
					{detail.name}
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

		<!-- Block flow, not a flex column: flex children would shrink below their
		     own content instead of letting this container scroll, which clips the
		     cards of a long session. -->
		<div class="space-y-3 overflow-y-auto" style="padding: 18px 20px; background: var(--bg);">
			{#if error}
				<div
					style="border: 1px solid var(--rd); background: var(--panel); border-radius: var(--rs); padding: 12px; font-size: 12.5px; color: var(--rd);"
				>
					{error}
				</div>
			{/if}

			{#if hasRepData}
				<div
					class="grid grid-cols-4"
					style="background: var(--panel); border: 1px solid var(--bd); border-radius: var(--rl); box-shadow: var(--sh); overflow: hidden;"
				>
					{#each [{ k: 'Date', v: formatSessionDateShort(detail.date) }, { k: 'Time', v: formatSessionTime(detail.date) }, { k: 'Duration', v: formatDuration(detail.duration) }, { k: 'Reps', v: loading ? '--' : String(reps.filter((rep) => !rep.is_rest).length) }] as stat (stat.k)}
						<div style="padding: 14px 16px;">
							<div
								style="font-size: 10.5px; color: var(--tx3); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;"
							>
								{stat.k}
							</div>
							<div
								class="truncate"
								style="font-size: 14px; font-weight: 700; color: var(--tx); margin-top: 3px;"
								title={stat.v}
							>
								{stat.v}
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div
					class="flex items-center gap-5"
					style="background: var(--panel); border: 1px solid var(--bd); border-radius: var(--rl); box-shadow: var(--sh); padding: 20px;"
				>
					<div style="flex-shrink: 0;">
						<div style="font-size: 32px; font-weight: 700; color: {type.color}; line-height: 1;">
							{formatDuration(detail.duration)}
						</div>
						<div
							style="font-size: 10.5px; color: var(--tx3); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; margin-top: 4px;"
						>
							Duration
						</div>
					</div>
					<div style="width: 1px; align-self: stretch; background: var(--bd2);"></div>
					<div class="flex flex-col gap-2" style="min-width: 0;">
						<div class="flex items-center gap-2">
							<Icon name="calendar" size={15} color="var(--tx3)" />
							<span style="font-size: 13px; color: var(--tx);"
								>{formatSessionDate(detail.date)}</span
							>
						</div>
						<div class="flex items-center gap-2">
							<Icon name="clock" size={15} color="var(--tx3)" />
							<span style="font-size: 13px; color: var(--tx);"
								>{formatSessionTime(detail.date)}</span
							>
						</div>
						<div style="font-size: 11.5px; color: var(--tx3);">
							Logged by the athlete, so it carries no sensor measurements.
						</div>
					</div>
				</div>
			{/if}

			{#if loading}
				<div
					style="background: var(--panel); border: 1px solid var(--bd); border-radius: var(--rl); padding: 24px; text-align: center; font-size: 13px; color: var(--tx3);"
				>
					Loading session details...
				</div>
			{:else}
				{#if hasRepData}
					<SessionRepsCard session={detail} {reps} accent={type.color} />
				{/if}

				<!-- Next to the measurements rather than paired rep by rep: a
				     prescribed item is a template of sets, a rep is one measured
				     hang, and the two stop lining up as soon as the athlete cut a
				     set short. What each rep was aiming at is already on the rep
				     itself, through target_weight in the card above. -->
				{#if detail.prescription}
					<SessionPrescriptionCard prescription={detail.prescription} />
				{:else if detail.origin === 'played'}
					<div
						style="background: var(--panel); border: 1px solid var(--bd); border-radius: var(--rl); padding: 16px 18px; font-size: 12.5px; color: var(--tx3);"
					>
						Played from the athlete's own library, so there is nothing prescribed to compare it to.
					</div>
				{/if}

				{#if assessments.length > 0}
					<div
						style="background: var(--panel); border: 1px solid var(--bd); border-radius: var(--rl); box-shadow: var(--sh); overflow: hidden;"
					>
						<div style="padding: 14px 18px; border-bottom: 1px solid var(--bd2);">
							<h3 style="font-size: 13px; font-weight: 700; color: var(--tx);">
								Assessment results
							</h3>
						</div>
						{#each assessments as assessment (assessment.id)}
							{@const unitLabel = UNIT_LABELS[assessment.unit] ?? ''}
							<div
								class="flex items-center justify-between"
								style="padding: 12px 18px; border-bottom: 1px solid var(--bd2);"
							>
								<div style="min-width: 0;">
									<div style="font-size: 13px; font-weight: 600; color: var(--tx);">
										{assessment.label}
									</div>
									<!-- A grip only means something on a hangboard assessment, which is
									     what the builtins are. A pull up count has no grip. -->
									{#if !assessment.training_id}
										<div style="font-size: 11.5px; color: var(--tx3);">
											{gripLabel(assessment.grip_position ?? 0)}
										</div>
									{/if}
								</div>
								<div class="flex gap-6" style="flex-shrink: 0;">
									{#if assessment.per_hand}
										{#each [{ hand: 'Left', value: assessment.left_value, color: 'var(--gn)' }, { hand: 'Right', value: assessment.right_value, color: 'var(--pl)' }] as side (side.hand)}
											<div style="text-align: right;">
												<div
													style="font-size: 10px; font-weight: 700; color: {side.color}; letter-spacing: 0.06em; text-transform: uppercase;"
												>
													{side.hand}
												</div>
												<div style="font-size: 15px; font-weight: 700; color: var(--tx);">
													{formatValue(side.value, assessment.unit)}
													<span style="font-size: 11px; color: var(--tx3); font-weight: 600;"
														>{unitLabel}</span
													>
												</div>
											</div>
										{/each}
									{:else}
										<div style="text-align: right;">
											<div style="font-size: 15px; font-weight: 700; color: var(--tx);">
												{formatValue(
													assessment.right_value ?? assessment.left_value,
													assessment.unit
												)}
												<span style="font-size: 11px; color: var(--tx3); font-weight: 600;"
													>{unitLabel}</span
												>
											</div>
										</div>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{/if}

				{#if hasRepData && reps.length === 0 && !error}
					<div
						style="background: var(--panel); border: 1px solid var(--bd); border-radius: var(--rl); padding: 24px; text-align: center; font-size: 13px; color: var(--tx3);"
					>
						No rep data was recorded for this session.
					</div>
				{/if}
			{/if}

			{#if detail.notes?.trim()}
				<div
					style="background: var(--panel); border: 1px solid var(--bd); border-radius: var(--rl); box-shadow: var(--sh); overflow: hidden;"
				>
					<div style="padding: 14px 18px; border-bottom: 1px solid var(--bd2);">
						<h3 style="font-size: 13px; font-weight: 700; color: var(--tx);">Athlete notes</h3>
					</div>
					<p
						style="padding: 14px 18px; font-size: 13px; color: var(--tx2); line-height: 1.6; white-space: pre-wrap;"
					>
						{detail.notes}
					</p>
				</div>
			{/if}
		</div>
	</div>
</div>
