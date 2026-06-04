<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { apiClient } from '$lib/api/client';
	import { goto } from '$app/navigation';
	import type { TrainingSummary, TrainingType } from '$lib/api/client';
	import { snackbar } from '$lib/stores/snackbar.svelte';
	import AppShell from '$lib/components/AppShell.svelte';
	import Icon from '$lib/components/Icon.svelte';

	type TypeInfo = { bg: string; tint: string; label: string; initials: string };

	const TYPE_INFO: Record<string, TypeInfo> = {
		workout: { bg: 'var(--pr)', tint: '#fbebe2', label: 'Workout', initials: 'WO' },
		climbing: { bg: 'var(--gd)', tint: '#fbf1de', label: 'Climbing', initials: 'CL' },
		stretching: { bg: 'var(--gn)', tint: '#e6efe6', label: 'Stretching', initials: 'ST' },
		crimpy: { bg: 'var(--pl)', tint: '#efeaf1', label: 'Crimpy', initials: 'CR' }
	};

	const ALL_TYPES: TrainingType[] = ['workout', 'stretching', 'climbing'];

	let trainings = $state<TrainingSummary[]>([]);
	let loading = $state(false);
	let confirmDeleteId = $state<string | null>(null);
	let deleting = $state(false);
	let deleteError = $state('');
	let search = $state('');
	let typeFilter = $state<TrainingType | null>(null);
	let view = $state<'grid' | 'list'>('grid');

	let filtered = $derived.by(() => {
		const q = search.trim().toLowerCase();
		return trainings.filter((t) => {
			if (q && !t.title.toLowerCase().includes(q)) return false;
			if (typeFilter) {
				const effectiveType = t.training_type ?? 'workout';
				if (effectiveType !== typeFilter) return false;
			}
			return true;
		});
	});

	onMount(() => {
		authStore.initialize();
		if (!authStore.isAuthenticated) { goto('/'); return; }
		if (!authStore.isEmailVerified) { goto('/verify-email'); return; }
		if (!authStore.isValidatedCoach) { goto('/dashboard'); return; }
		loadTrainings();
	});

	async function loadTrainings() {
		loading = true;
		try {
			trainings = await apiClient.getTrainings();
		} finally {
			loading = false;
		}
	}

	async function handleDelete(id: string) {
		deleting = true;
		deleteError = '';
		try {
			await apiClient.deleteTraining(id);
			trainings = trainings.filter((s) => s.id !== id);
			confirmDeleteId = null;
			snackbar.show('Training deleted');
		} catch (e) {
			deleteError = e instanceof Error ? e.message : 'Failed to delete training.';
		} finally {
			deleting = false;
		}
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
	}

	function typeInfo(t: TrainingSummary): TypeInfo {
		return TYPE_INFO[t.training_type ?? 'workout'] ?? TYPE_INFO.workout;
	}
</script>

<AppShell
	title="Trainings"
	breadcrumbs={[{ label: 'Studio' }, { label: 'Trainings' }]}
>
	{#snippet actions()}
		<button
			onclick={() => goto('/trainings/new')}
			style="
				display: inline-flex; align-items: center; gap: 7px;
				padding: 9px 16px; border-radius: var(--rs);
				background: var(--pr); color: #fff; border: 1px solid var(--pr);
				font-size: 13.5px; font-weight: 600; cursor: pointer; font-family: var(--font);
			"
		>
			<Icon name="plus" size={14} color="#fff" />
			New training
		</button>
	{/snippet}

	<div style="padding: 24px 32px 40px; display: flex; flex-direction: column; gap: 18px;">

		{#if deleteError}
			<div
				style="border: 1px solid var(--rd); background: #fff5f5; border-radius: var(--rs); padding: 12px; font-size: 12.5px; color: var(--rd);"
			>
				{deleteError}
			</div>
		{/if}

		<!-- Filter row -->
		<div style="display: flex; align-items: center; gap: 12px;">
			<div
				style="display: flex; gap: 4px; background: #fff; border: 1px solid var(--bd); border-radius: var(--rs); padding: 3px;"
			>
				<button
					onclick={() => (typeFilter = null)}
					style="
						padding: 7px 14px; font-size: 12.5px; font-weight: 600;
						border-radius: 6px; border: none; cursor: pointer;
						background: {typeFilter === null ? 'var(--pr-fog)' : 'transparent'};
						color: {typeFilter === null ? 'var(--pr)' : 'var(--tx2)'};
						font-family: var(--font);
					"
				>
					All
				</button>
				{#each ALL_TYPES as t}
					<button
						onclick={() => (typeFilter = typeFilter === t ? null : t)}
						style="
							padding: 7px 14px; font-size: 12.5px; font-weight: 600;
							border-radius: 6px; border: none; cursor: pointer;
							background: {typeFilter === t ? 'var(--pr-fog)' : 'transparent'};
							color: {typeFilter === t ? 'var(--pr)' : 'var(--tx2)'};
							font-family: var(--font);
						"
					>
						{TYPE_INFO[t]?.label ?? t}
					</button>
				{/each}
			</div>

			<!-- Search -->
			<div
				style="
					flex: 1; display: flex; align-items: center; gap: 8px;
					background: #fff; border: 1px solid var(--bd); border-radius: var(--rs);
					padding: 9px 12px; max-width: 320px;
				"
			>
				<Icon name="search" size={14} color="var(--tx3)" />
				<input
					type="text"
					bind:value={search}
					placeholder="Search trainings..."
					style="
						flex: 1; border: none; outline: none; background: transparent;
						font-family: var(--font); font-size: 13.5px; color: var(--tx);
					"
				/>
			</div>

			<div style="flex: 1;"></div>

			<!-- View toggle -->
			<div
				style="display: flex; gap: 4px; background: #fff; border: 1px solid var(--bd); border-radius: var(--rs); padding: 3px;"
			>
				<button
					onclick={() => (view = 'grid')}
					style="
						width: 32px; height: 28px; border-radius: 6px;
						border: none; cursor: pointer;
						background: {view === 'grid' ? 'var(--pr-fog)' : 'transparent'};
						display: flex; align-items: center; justify-content: center;
					"
				>
					<Icon name="grip" size={14} color={view === 'grid' ? 'var(--pr)' : 'var(--tx3)'} />
				</button>
				<button
					onclick={() => (view = 'list')}
					style="
						width: 32px; height: 28px; border-radius: 6px;
						border: none; cursor: pointer;
						background: {view === 'list' ? 'var(--pr-fog)' : 'transparent'};
						display: flex; align-items: center; justify-content: center;
					"
				>
					<Icon name="filter" size={14} color={view === 'list' ? 'var(--pr)' : 'var(--tx3)'} />
				</button>
			</div>
		</div>

		{#if loading}
			<div style="display: flex; align-items: center; gap: 12px; padding: 32px 0; color: var(--tx3); font-size: 13px;">
				<div
					style="width: 16px; height: 16px; border: 2px solid var(--bd); border-top-color: var(--pr); border-radius: 50%; animation: spin 0.8s linear infinite;"
				></div>
				Loading trainings...
			</div>
		{:else if trainings.length === 0}
			<div
				style="
					background: var(--pr-fog); border-radius: var(--rl); border: 1.5px dashed var(--pr-lt);
					padding: 48px; text-align: center;
					display: flex; flex-direction: column; align-items: center; gap: 12px; color: var(--pr);
				"
			>
				<div
					style="
						width: 44px; height: 44px; border-radius: 50%;
						background: #fff; border: 1px solid var(--pr-lt);
						display: flex; align-items: center; justify-content: center;
					"
				>
					<Icon name="plus" size={20} color="var(--pr)" />
				</div>
				<div style="font-size: 13.5px; font-weight: 600;">No trainings yet</div>
				<div style="font-size: 12px; color: var(--pr); opacity: 0.7;">
					Create your first training to get started.
				</div>
			</div>
		{:else if view === 'grid'}
			<!-- Grid view -->
			<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;">
				{#each filtered as training (training.id)}
					{@const tc = typeInfo(training)}
					<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
					<div
						onclick={(e) => { if (!(e.target as HTMLElement).closest('button')) goto(`/trainings/${training.id}`); }}
						style="
							background: #fff; border-radius: var(--rl); border: 1px solid var(--bd);
							box-shadow: var(--sh); overflow: hidden; position: relative;
							display: flex; flex-direction: column; cursor: pointer;
						"
						onmouseenter={(e) => (e.currentTarget.style.borderColor = 'var(--pr-lt)')}
						onmouseleave={(e) => (e.currentTarget.style.borderColor = 'var(--bd)')}
					>
						<div style="height: 4px; background: {tc.bg};"></div>
						<div style="padding: 16px 18px 14px; flex: 1; display: flex; flex-direction: column; gap: 10px;">
							<div style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px;">
								<span
									style="
										display: inline-flex; align-items: center;
										background: {tc.tint}; color: {tc.bg};
										font-size: 11px; font-weight: 600;
										padding: 3px 9px; border-radius: 999px;
									"
								>
									{tc.label}
								</span>
								<div style="display: flex; gap: 4px;">
									{#if confirmDeleteId === training.id}
										<button
											onclick={() => handleDelete(training.id)}
											disabled={deleting}
											style="
												padding: 4px 10px; border-radius: 6px;
												border: 1px solid var(--rd); color: var(--rd);
												background: #fff5f5; font-size: 11px; font-weight: 600;
												cursor: pointer; font-family: var(--font);
											"
										>
											{deleting ? '...' : 'Confirm'}
										</button>
										<button
											onclick={() => (confirmDeleteId = null)}
											style="
												padding: 4px 10px; border-radius: 6px;
												border: 1px solid var(--bd); color: var(--tx2);
												background: #fff; font-size: 11px; font-weight: 600;
												cursor: pointer; font-family: var(--font);
											"
										>
											Cancel
										</button>
									{:else}
										<button
											onclick={() => (confirmDeleteId = training.id)}
											style="
												width: 28px; height: 28px; border-radius: 6px;
												border: none; background: transparent;
												display: flex; align-items: center; justify-content: center;
												cursor: pointer; color: var(--tx3);
											"
										>
											<Icon name="trash" size={14} color="var(--tx3)" />
										</button>
									{/if}
								</div>
							</div>

							<div style="font-size: 15.5px; font-weight: 700; color: var(--tx); letter-spacing: -0.01em; line-height: 1.25;">
								{training.title}
							</div>

							{#if training.description}
								<div
									style="font-size: 12.5px; color: var(--tx2); line-height: 1.45; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;"
								>
									{training.description}
								</div>
							{/if}

							<div style="height: 1px; background: var(--bd2);"></div>
							<div style="display: flex; align-items: center; gap: 12px; font-size: 11.5px; color: var(--tx3);">
								<span style="display: inline-flex; align-items: center; gap: 4px;">
									<Icon name="clock" size={12} color="var(--tx3)" />
									Created {formatDate(training.created_at)}
								</span>
							</div>
						</div>
					</div>
				{/each}

				<!-- New training tile -->
				<button
					onclick={() => goto('/trainings/new')}
					style="
						background: var(--pr-fog); border-radius: var(--rl);
						border: 1.5px dashed var(--pr-lt);
						padding: 18px; cursor: pointer;
						display: flex; flex-direction: column; align-items: center; justify-content: center;
						min-height: 200px; gap: 10px; color: var(--pr);
						font-family: var(--font);
					"
				>
					<div
						style="
							width: 44px; height: 44px; border-radius: 50%;
							background: #fff; border: 1px solid var(--pr-lt);
							display: flex; align-items: center; justify-content: center;
						"
					>
						<Icon name="plus" size={20} color="var(--pr)" />
					</div>
					<div style="font-size: 13.5px; font-weight: 600;">Create a training</div>
					<div style="font-size: 11.5px; color: var(--pr); opacity: 0.7; text-align: center; max-width: 180px;">
						Build from scratch or start from a template.
					</div>
				</button>
			</div>
		{:else}
			<!-- List view -->
			<div
				style="background: #fff; border-radius: var(--rl); border: 1px solid var(--bd); overflow: hidden; box-shadow: var(--sh);"
			>
				{#each filtered as training, i (training.id)}
					{@const tc = typeInfo(training)}
					<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
					<div
						onclick={(e) => { if (!(e.target as HTMLElement).closest('button')) goto(`/trainings/${training.id}`); }}
						style="
							display: grid; grid-template-columns: 48px 1.6fr 1fr 1fr 1fr 40px;
							align-items: center; gap: 14px; padding: 14px 20px; cursor: pointer;
							border-bottom: {i < filtered.length - 1 ? '1px solid var(--bd2)' : 'none'};
						"
						onmouseenter={(e) => (e.currentTarget.style.background = 'var(--panel2)')}
						onmouseleave={(e) => (e.currentTarget.style.background = '')}
					>
						<div
							style="
								width: 48px; height: 48px; border-radius: var(--rs);
								background: {tc.tint}; color: {tc.bg};
								display: flex; align-items: center; justify-content: center;
								font-size: 12px; font-weight: 700;
							"
						>
							{tc.initials}
						</div>
						<div style="font-family: var(--font);">
							<div style="font-size: 14px; font-weight: 600; color: var(--tx);">{training.title}</div>
							{#if training.description}
								<div
									style="font-size: 12px; color: var(--tx2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 40ch;"
								>
									{training.description}
								</div>
							{/if}
						</div>
						<div>
							<span
								style="
									display: inline-flex; align-items: center;
									background: {tc.tint}; color: {tc.bg};
									font-size: 11px; font-weight: 600;
									padding: 3px 9px; border-radius: 999px;
								"
							>
								{tc.label}
							</span>
						</div>
						<div style="font-size: 12.5px; color: var(--tx2);">Created {formatDate(training.created_at)}</div>
						<div>
							{#if confirmDeleteId === training.id}
								<div style="display: flex; gap: 4px;">
									<button
										onclick={() => handleDelete(training.id)}
										disabled={deleting}
										style="
											padding: 4px 10px; border-radius: 6px;
											border: 1px solid var(--rd); color: var(--rd);
											background: #fff5f5; font-size: 11px; font-weight: 600;
											cursor: pointer; font-family: var(--font);
										"
									>
										{deleting ? '...' : 'Confirm'}
									</button>
									<button
										onclick={() => (confirmDeleteId = null)}
										style="
											padding: 4px 10px; border-radius: 6px;
											border: 1px solid var(--bd); color: var(--tx2);
											background: #fff; font-size: 11px; font-weight: 600;
											cursor: pointer; font-family: var(--font);
										"
									>
										Cancel
									</button>
								</div>
							{:else}
								<button
									onclick={() => (confirmDeleteId = training.id)}
									style="
										padding: 4px 10px; border-radius: 6px;
										border: 1px solid var(--bd); color: var(--tx3);
										background: transparent; font-size: 12px; font-weight: 500;
										cursor: pointer; font-family: var(--font);
									"
								>
									Delete
								</button>
							{/if}
						</div>
						<div style="display: flex; justify-content: flex-end;">
							<Icon name="chevron" size={16} color="var(--tx3)" />
						</div>
					</div>
				{/each}
			</div>
		{/if}

		{#if !loading && filtered.length === 0 && trainings.length > 0}
			<div style="text-align: center; padding: 32px 0; color: var(--tx3); font-size: 13.5px;">
				No results for your current filters.
			</div>
		{/if}
	</div>
</AppShell>

<style>
	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>
