import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { authStore } from '$lib/stores/auth.svelte';
import { browser } from '$app/environment';

export const ssr = false;

export const load: PageLoad = async () => {
	if (!browser) {
		return {};
	}

	const user = await authStore.verifyUser();

	if (user) {
		if (user.is_admin) {
			throw redirect(307, '/admin');
		}
		throw redirect(307, '/dashboard');
	}

	return {};
};
