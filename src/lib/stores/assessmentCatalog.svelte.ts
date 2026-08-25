import { apiClient, type AssessmentDefinition } from '$lib/api/client';
import { buildAssessmentCatalog, type AssessmentCatalog } from '$lib/assessments';
import { snackbar } from '$lib/stores/snackbar.svelte';

// The assessments the signed in coach may reference, loaded once and shared by
// every page that has to name one. The list is small and changes only when the
// coach writes an assessment, so a page asks for it on mount and takes the
// cached answer afterwards.
let definitions = $state<AssessmentDefinition[]>([]);
let loaded = $state(false);
let inFlight: Promise<void> | null = null;
const catalog = $derived(buildAssessmentCatalog(definitions));

export const assessmentCatalog = {
	// Keyed by id, which is what a result row and a percentage reference hold.
	// Derived, so the map is built once per change rather than once per read: it
	// is passed as a prop to every node of the item tree.
	get catalog(): AssessmentCatalog {
		return catalog;
	},
	async load(): Promise<void> {
		if (loaded) return;
		// Two components mounting together must not each fetch the list.
		inFlight ??= apiClient
			.getAssessmentDefinitions()
			.then((list) => {
				definitions = list;
				loaded = true;
			})
			.catch(() =>
				snackbar.show(
					'Could not load the assessments, so a percentage of one cannot be prescribed.',
					'error'
				)
			)
			.finally(() => {
				inFlight = null;
			});
		return inFlight;
	},
	// Called after writing an assessment, so the next read sees it.
	async refresh(): Promise<void> {
		loaded = false;
		return this.load();
	}
};
