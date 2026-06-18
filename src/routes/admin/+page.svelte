<script lang="ts">
	import { onMount } from 'svelte';
	import { apiClient, type CoachResponse } from '$lib/api/client';
	import AppShell from '$lib/components/AppShell.svelte';

	let pendingCoaches = $state<CoachResponse[]>([]);
	let loading = $state(true);
	let error = $state('');
	let processingId = $state<string | null>(null);

	onMount(async () => {
		await loadPendingCoaches();
	});

	async function loadPendingCoaches() {
		loading = true;
		error = '';
		try {
			const result = await apiClient.getPendingCoaches();
			pendingCoaches = result || [];
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load pending coaches';
		} finally {
			loading = false;
		}
	}

	async function validateCoach(id: string) {
		processingId = id;
		error = '';
		try {
			await apiClient.validateCoach(id);
			await loadPendingCoaches();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to validate coach';
		} finally {
			processingId = null;
		}
	}

	async function rejectCoach(id: string) {
		processingId = id;
		error = '';
		try {
			await apiClient.rejectCoach(id);
			await loadPendingCoaches();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to reject coach';
		} finally {
			processingId = null;
		}
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<AppShell title="Admin" breadcrumbs={[{ label: 'Studio' }, { label: 'Admin' }]}>
	<div style="padding: 24px 32px 40px; max-width: 1200px; margin: 0 auto;">
		{#if error}
			<div
				class="mb-6 border-2 border-red-600 bg-red-50 p-4"
				style="font-family: monospace; font-size: 13px; color: #B85450;"
			>
				{error}
			</div>
		{/if}

		<div class="mb-6">
			<h2 class="mb-4 text-2xl font-bold" style="font-family: monospace;">
				PENDING COACH APPROVALS
			</h2>
			<p style="font-family: monospace; font-size: 13px; color: #666;">
				Review and approve or reject coach registration requests
			</p>
		</div>

		{#if loading}
			<div class="py-12 text-center">
				<div
					class="inline-block h-8 w-8 animate-spin rounded-full border-2 border-black border-t-transparent"
				></div>
				<p class="mt-4" style="font-family: monospace; font-size: 13px; color: #666;">
					Loading pending coaches...
				</p>
			</div>
		{:else if pendingCoaches.length === 0}
			<div class="border-2 border-black bg-gray-50 p-8 text-center">
				<p style="font-family: monospace; font-size: 14px; color: #666;">
					No pending coach approvals
				</p>
			</div>
		{:else}
			<div class="space-y-4">
				{#each pendingCoaches as coach (coach.id)}
					<div class="border-2 border-black bg-white p-6 transition-colors hover:bg-gray-50">
						<div class="flex items-start justify-between">
							<div class="flex-1">
								<h3 class="mb-2 text-lg font-bold" style="font-family: monospace;">
									{coach.firstname}
									{coach.lastname}
								</h3>
								<div
									class="space-y-1"
									style="font-family: monospace; font-size: 13px; color: #666;"
								>
									<p>
										<span class="font-medium">Email:</span>
										{coach.email}
										{#if coach.email_verified}
											<span style="color: #4A7C4A; font-weight: 600;">(Verified)</span>
										{:else}
											<span style="color: #B85450; font-weight: 600;">(Not Verified)</span>
										{/if}
									</p>
									<p>
										<span class="font-medium">ID:</span>
										{coach.id}
									</p>
									<p>
										<span class="font-medium">Registered:</span>
										{formatDate(coach.created_at)}
									</p>
								</div>
							</div>

							<div class="ml-4 flex gap-2">
								<button
									onclick={() => validateCoach(coach.id)}
									disabled={processingId === coach.id}
									class="px-4 py-2 font-medium transition-opacity"
									style="font-family: monospace; font-size: 13px; background-color: #4A7C4A; color: white; opacity: {processingId ===
									coach.id
										? 0.6
										: 1};"
								>
									{processingId === coach.id ? 'PROCESSING...' : 'APPROVE'}
								</button>
								<button
									onclick={() => rejectCoach(coach.id)}
									disabled={processingId === coach.id}
									class="border-2 border-black px-4 py-2 font-medium transition-colors hover:bg-gray-100"
									style="font-family: monospace; font-size: 13px; opacity: {processingId ===
									coach.id
										? 0.6
										: 1};"
								>
									{processingId === coach.id ? 'PROCESSING...' : 'REJECT'}
								</button>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</AppShell>
