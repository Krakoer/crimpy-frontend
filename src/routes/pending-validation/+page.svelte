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

    if (!authStore.isCoach) {
      goto('/dashboard');
      return;
    }

    if (authStore.isValidatedCoach) {
      goto('/dashboard');
      return;
    }
  });

  function handleLogout() {
    authStore.logout();
    goto('/');
  }
</script>

<div class="min-h-screen bg-white p-6 flex items-center justify-center">
  <div class="max-w-2xl w-full">
    <div class="text-center mb-8">
      <h1 class="text-4xl font-black mb-2" style="font-family: monospace; letter-spacing: -0.5px;">CRIMPY</h1>
      <p class="text-gray-600" style="font-family: monospace; font-size: 13px;">Climbing Training Platform</p>
    </div>

    <div class="border-2 border-black p-8 bg-white">
      <div class="text-center mb-6">
        <div class="inline-flex items-center justify-center w-16 h-16 border-2 border-yellow-600 bg-yellow-50 mb-4">
          <span class="text-3xl">!</span>
        </div>
        <h2 class="text-2xl font-bold mb-2" style="font-family: monospace;">PENDING VALIDATION</h2>
      </div>

      <div class="space-y-4" style="font-family: monospace; font-size: 14px; line-height: 1.6;">
        <p>
          Thank you for registering as a coach, {authStore.user?.firstname}!
        </p>
        <p>
          Your account is currently pending admin validation. You will receive access to the coach portal once an administrator has reviewed and approved your account.
        </p>
        <div class="p-4 border border-gray-300 bg-gray-50">
          <p class="font-medium mb-2" style="font-size: 12px; color: #666;">ACCOUNT DETAILS</p>
          <p style="font-size: 12px; color: #666;">Email: {authStore.user?.email}</p>
          <p style="font-size: 12px; color: #666;">Name: {authStore.user?.firstname} {authStore.user?.lastname}</p>
        </div>
        <p style="font-size: 12px; color: #999;">
          This process typically takes 1-2 business days. You will be notified by email once your account has been validated.
        </p>
      </div>

      <div class="mt-6 text-center">
        <button
          onclick={handleLogout}
          class="px-6 py-2 border border-black font-medium hover:bg-gray-100 transition-colors"
          style="font-family: monospace; font-size: 13px;"
        >
          LOGOUT
        </button>
      </div>
    </div>
  </div>
</div>
