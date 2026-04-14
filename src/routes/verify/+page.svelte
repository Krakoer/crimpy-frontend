<script lang="ts">
  import { onMount } from 'svelte';
  import { apiClient } from '$lib/api/client';
  import { page } from '$app/stores';

  let verifying = $state(true);
  let success = $state(false);
  let errorMessage = $state('');
  let successMessage = $state('');

  onMount(async () => {
    const token = $page.url.searchParams.get('token');

    if (!token) {
      errorMessage = 'No verification token provided. Please check your email link.';
      verifying = false;
      return;
    }

    try {
      const response = await apiClient.verifyEmail(token);
      success = true;
      successMessage = response.message || 'Email verified successfully!';
    } catch (e) {
      success = false;
      errorMessage = e instanceof Error ? e.message : 'Email verification failed. The token may be invalid or expired.';
    } finally {
      verifying = false;
    }
  });
</script>

<div class="min-h-screen bg-white p-6 flex items-center justify-center">
  <div class="max-w-2xl w-full">
    <div class="text-center mb-8">
      <h1 class="text-4xl font-black mb-2" style="font-family: monospace; letter-spacing: -0.5px;">CRIMPY</h1>
      <p class="text-gray-600" style="font-family: monospace; font-size: 13px;">Climbing Training Platform</p>
    </div>

    <div class="border-2 border-black p-8 bg-white">
      <div class="text-center">
        {#if verifying}
          <div class="inline-flex items-center justify-center w-20 h-20 border-2 border-gray-400 bg-gray-50 mb-6">
            <div class="animate-spin">
              <svg class="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          </div>
          <h2 class="text-2xl font-bold mb-4" style="font-family: monospace;">VERIFYING EMAIL</h2>
          <p class="text-gray-600" style="font-family: monospace; font-size: 14px;">
            Please wait while we verify your email address...
          </p>
        {:else if success}
          <div class="inline-flex items-center justify-center w-20 h-20 border-2 border-green-600 bg-green-50 mb-6">
            <svg class="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <h2 class="text-2xl font-bold mb-4 text-green-600" style="font-family: monospace;">EMAIL VERIFIED</h2>
          <div class="p-4 border-2 border-green-600 bg-green-50 mb-6">
            <p class="text-green-800" style="font-family: monospace; font-size: 14px; line-height: 1.6;">
              {successMessage}
            </p>
          </div>
          <p class="text-gray-600 mb-6" style="font-family: monospace; font-size: 13px;">
            Your email has been successfully verified. An admin will validate your account soon.
          </p>
        {:else}
          <div class="inline-flex items-center justify-center w-20 h-20 border-2 border-red-600 bg-red-50 mb-6">
            <svg class="w-12 h-12 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </div>
          <h2 class="text-2xl font-bold mb-4 text-red-600" style="font-family: monospace;">VERIFICATION FAILED</h2>
          <div class="p-4 border-2 border-red-600 bg-red-50 mb-6">
            <p class="text-red-800" style="font-family: monospace; font-size: 14px; line-height: 1.6;">
              {errorMessage}
            </p>
          </div>
          <div class="space-y-4">
            <p class="text-gray-600" style="font-family: monospace; font-size: 13px;">
              Please try the following:
            </p>
            <ul class="text-left list-disc list-inside space-y-2 text-gray-600" style="font-family: monospace; font-size: 13px;">
              <li>Check that you clicked the complete link from your email</li>
              <li>Request a new verification email if the link has expired</li>
              <li>Contact support if the problem persists</li>
            </ul>
          </div>
        {/if}
      </div>

      {#if !verifying}
        <div class="mt-8 text-center">
          <a
            href="/"
            class="inline-block px-8 py-3 border-2 border-black font-bold hover:bg-black hover:text-white transition-colors"
            style="font-family: monospace; font-size: 14px;"
          >
            {success ? 'GO TO LOGIN' : 'BACK TO HOME'}
          </a>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .animate-spin {
    animation: spin 1s linear infinite;
  }
</style>
