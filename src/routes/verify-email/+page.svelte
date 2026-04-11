<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '$lib/stores/auth.svelte';
  import { apiClient } from '$lib/api/client';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  let verifying = $state(false);
  let verified = $state(false);
  let error = $state('');
  let resendCooldown = $state(0);
  let resending = $state(false);
  let resendMessage = $state('');

  let cooldownInterval: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    authStore.initialize();

    if (!authStore.isAuthenticated) {
      goto('/');
      return;
    }

    if (authStore.user?.email_verified) {
      if (authStore.isCoach && !authStore.user?.coach_validated) {
        goto('/pending-validation');
      } else {
        goto('/dashboard');
      }
      return;
    }

    const token = $page.url.searchParams.get('token');
    if (token) {
      handleVerification(token);
    }

    return () => {
      if (cooldownInterval) {
        clearInterval(cooldownInterval);
      }
    };
  });

  async function handleVerification(token: string) {
    verifying = true;
    error = '';
    try {
      await apiClient.verifyEmail(token);
      verified = true;
      if (authStore.user) {
        authStore.user.email_verified = true;
        authStore.saveUser();
      }
      setTimeout(() => {
        if (authStore.isCoach) {
          goto('/pending-validation');
        } else {
          goto('/dashboard');
        }
      }, 2000);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Email verification failed';
    } finally {
      verifying = false;
    }
  }

  async function handleResend() {
    if (!authStore.user?.email || resendCooldown > 0) return;

    resending = true;
    error = '';
    resendMessage = '';
    try {
      await apiClient.resendVerification(authStore.user.email);
      resendMessage = 'Verification email sent! Please check your inbox.';
      resendCooldown = 600;

      if (cooldownInterval) {
        clearInterval(cooldownInterval);
      }

      cooldownInterval = setInterval(() => {
        resendCooldown--;
        if (resendCooldown <= 0 && cooldownInterval) {
          clearInterval(cooldownInterval);
          cooldownInterval = null;
        }
      }, 1000);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to resend verification email';
      if (errorMessage.includes('cooldown')) {
        error = 'Please wait before requesting another verification email.';
      } else {
        error = errorMessage;
      }
    } finally {
      resending = false;
    }
  }

  function handleLogout() {
    authStore.logout();
    goto('/');
  }

  function formatCooldown(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
        {#if verifying}
          <div class="inline-flex items-center justify-center w-16 h-16 border-2 border-gray-400 bg-gray-50 mb-4">
            <span class="text-3xl">...</span>
          </div>
          <h2 class="text-2xl font-bold mb-2" style="font-family: monospace;">VERIFYING EMAIL</h2>
        {:else if verified}
          <div class="inline-flex items-center justify-center w-16 h-16 border-2 border-green-600 bg-green-50 mb-4">
            <span class="text-3xl">✓</span>
          </div>
          <h2 class="text-2xl font-bold mb-2" style="font-family: monospace;">EMAIL VERIFIED</h2>
        {:else}
          <div class="inline-flex items-center justify-center w-16 h-16 border-2 border-yellow-600 bg-yellow-50 mb-4">
            <span class="text-3xl">@</span>
          </div>
          <h2 class="text-2xl font-bold mb-2" style="font-family: monospace;">VERIFY YOUR EMAIL</h2>
        {/if}
      </div>

      <div class="space-y-4" style="font-family: monospace; font-size: 14px; line-height: 1.6;">
        {#if verifying}
          <p class="text-center">
            Please wait while we verify your email address...
          </p>
        {:else if verified}
          <p class="text-center">
            Your email has been successfully verified!
          </p>
          {#if authStore.isCoach}
            <p class="text-center" style="font-size: 12px; color: #666;">
              Redirecting to pending validation page...
            </p>
          {:else}
            <p class="text-center" style="font-size: 12px; color: #666;">
              Redirecting to dashboard...
            </p>
          {/if}
        {:else}
          <p>
            Thank you for registering, {authStore.user?.firstname}!
          </p>
          <p>
            We have sent a verification email to <strong>{authStore.user?.email}</strong>. Please check your inbox and click the verification link to continue.
          </p>

          {#if error}
            <div class="p-3 border border-red-600 bg-red-50" style="font-size: 12px; color: #B85450;">
              {error}
            </div>
          {/if}

          {#if resendMessage}
            <div class="p-3 border border-green-600 bg-green-50" style="font-size: 12px; color: #22863a;">
              {resendMessage}
            </div>
          {/if}

          <div class="p-4 border border-gray-300 bg-gray-50">
            <p class="font-medium mb-2" style="font-size: 12px; color: #666;">NEXT STEPS</p>
            <ol class="list-decimal list-inside space-y-1" style="font-size: 12px; color: #666;">
              <li>Check your email inbox (and spam folder)</li>
              <li>Click the verification link in the email</li>
              {#if authStore.isCoach}
                <li>Wait for admin validation to access the coach portal</li>
              {:else}
                <li>Access your dashboard</li>
              {/if}
            </ol>
          </div>

          <div class="text-center pt-4">
            <p style="font-size: 12px; color: #999;" class="mb-3">
              Did not receive the email?
            </p>
            <button
              onclick={handleResend}
              disabled={resending || resendCooldown > 0}
              class="px-6 py-2 border border-black font-medium transition-opacity"
              style="font-family: monospace; font-size: 13px; opacity: {resending || resendCooldown > 0 ? 0.5 : 1}; background-color: {resendCooldown > 0 ? '#f3f4f6' : 'white'};"
            >
              {#if resending}
                SENDING...
              {:else if resendCooldown > 0}
                RESEND IN {formatCooldown(resendCooldown)}
              {:else}
                RESEND VERIFICATION EMAIL
              {/if}
            </button>
          </div>
        {/if}
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
