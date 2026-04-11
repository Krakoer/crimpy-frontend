<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '$lib/stores/auth.svelte';
  import { goto } from '$app/navigation';
  import { apiClient, type CoachResponse } from '$lib/api/client';

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

  function handleLogout() {
    authStore.logout();
    goto('/');
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

<div class="min-h-screen bg-white p-6">
    <div class="max-w-6xl mx-auto">
      <div class="flex justify-between items-center mb-8 pb-4 border-b-2 border-black">
        <div>
          <h1 class="text-4xl font-black mb-2" style="font-family: monospace; letter-spacing: -0.5px;">ADMIN DASHBOARD</h1>
          <p style="font-family: monospace; font-size: 13px; color: #666;">
            Welcome, {authStore.user?.firstname || 'Admin'}
          </p>
        </div>
        <button
          onclick={handleLogout}
          class="px-4 py-2 border border-black font-medium hover:bg-gray-100 transition-colors"
          style="font-family: monospace; font-size: 13px;"
        >
          LOGOUT
        </button>
      </div>

      {#if error}
        <div class="mb-6 p-4 border-2 border-red-600 bg-red-50" style="font-family: monospace; font-size: 13px; color: #B85450;">
          {error}
        </div>
      {/if}

      <div class="mb-6">
        <h2 class="text-2xl font-bold mb-4" style="font-family: monospace;">PENDING COACH APPROVALS</h2>
        <p style="font-family: monospace; font-size: 13px; color: #666;">
          Review and approve or reject coach registration requests
        </p>
      </div>

      {#if loading}
        <div class="text-center py-12">
          <div class="inline-block w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
          <p class="mt-4" style="font-family: monospace; font-size: 13px; color: #666;">Loading pending coaches...</p>
        </div>
      {:else if pendingCoaches.length === 0}
        <div class="border-2 border-black p-8 text-center bg-gray-50">
          <p style="font-family: monospace; font-size: 14px; color: #666;">
            No pending coach approvals
          </p>
        </div>
      {:else}
        <div class="space-y-4">
          {#each pendingCoaches as coach (coach.id)}
            <div class="border-2 border-black p-6 bg-white hover:bg-gray-50 transition-colors">
              <div class="flex justify-between items-start">
                <div class="flex-1">
                  <h3 class="text-lg font-bold mb-2" style="font-family: monospace;">
                    {coach.firstname} {coach.lastname}
                  </h3>
                  <div class="space-y-1" style="font-family: monospace; font-size: 13px; color: #666;">
                    <p>
                      <span class="font-medium">Email:</span> {coach.email}
                    </p>
                    <p>
                      <span class="font-medium">ID:</span> {coach.id}
                    </p>
                    <p>
                      <span class="font-medium">Registered:</span> {formatDate(coach.created_at)}
                    </p>
                  </div>
                </div>

                <div class="flex gap-2 ml-4">
                  <button
                    onclick={() => validateCoach(coach.id)}
                    disabled={processingId === coach.id}
                    class="px-4 py-2 font-medium transition-opacity"
                    style="font-family: monospace; font-size: 13px; background-color: #4A7C4A; color: white; opacity: {processingId === coach.id ? 0.6 : 1};"
                  >
                    {processingId === coach.id ? 'PROCESSING...' : 'APPROVE'}
                  </button>
                  <button
                    onclick={() => rejectCoach(coach.id)}
                    disabled={processingId === coach.id}
                    class="px-4 py-2 border-2 border-black font-medium hover:bg-gray-100 transition-colors"
                    style="font-family: monospace; font-size: 13px; opacity: {processingId === coach.id ? 0.6 : 1};"
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
  </div>
