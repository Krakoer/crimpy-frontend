<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '$lib/stores/auth.svelte';
  import { goto } from '$app/navigation';

  onMount(() => {
    authStore.initialize();

    if (!authStore.isAuthenticated) {
      goto('/');
      return;
    }

    if (authStore.isCoach && !authStore.isValidatedCoach) {
      goto('/pending-validation');
      return;
    }
  });

  function handleLogout() {
    authStore.logout();
    goto('/');
  }
</script>

<div class="min-h-screen bg-white p-6">
  <div class="max-w-6xl mx-auto">
    <div class="flex justify-between items-center mb-8 pb-4 border-b-2 border-black">
      <div>
        <h1 class="text-4xl font-black mb-2" style="font-family: monospace; letter-spacing: -0.5px;">DASHBOARD</h1>
        <p style="font-family: monospace; font-size: 13px; color: #666;">
          Welcome, {authStore.user?.firstname || 'User'}
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

    <div class="border-2 border-black p-8 bg-white">
      <h2 class="text-2xl font-bold mb-4" style="font-family: monospace;">
        {#if authStore.isValidatedCoach}
          COACH PORTAL
        {:else}
          USER PORTAL
        {/if}
      </h2>
      <p style="font-family: monospace; font-size: 14px; color: #666;">
        Dashboard features coming soon...
      </p>

      <div class="mt-6 p-4 border border-gray-300 bg-gray-50">
        <h3 class="font-bold mb-2" style="font-family: monospace; font-size: 13px;">ACCOUNT STATUS</h3>
        <div class="space-y-1" style="font-family: monospace; font-size: 12px; color: #666;">
          <p><span class="font-medium">Email:</span> {authStore.user?.email}</p>
          <p><span class="font-medium">Name:</span> {authStore.user?.firstname} {authStore.user?.lastname}</p>
          <p><span class="font-medium">Role:</span> {authStore.isValidatedCoach ? 'Validated Coach' : 'User'}</p>
        </div>
      </div>
    </div>
  </div>
</div>
