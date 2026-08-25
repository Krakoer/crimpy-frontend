import { apiClient, type AssessmentDefinition } from '$lib/api/client';
import { buildAssessmentCatalog, type AssessmentCatalog } from '$lib/assessments';

// The assessments the signed in coach may reference, loaded once and shared by
// every page that has to name one. The list is small and changes only when the
// coach writes an assessment, so a page asks for it on mount and takes the
// cached answer afterwards.
let definitions = $state<AssessmentDefinition[]>([]);
let loaded = $state(false);
let inFlight: Promise<void> | null = null;

export const assessmentCatalog = {
	get definitions() {
		return definitions;
	},
	get loaded() {
		return loaded;
	},
	// Keyed by id, which is what a result row and a percentage reference hold.
	get catalog(): AssessmentCatalog {
		return buildAssessmentCatalog(definitions);
	},
	// The custom ones alone, for a page listing what the coach has written.
	get custom(): AssessmentDefinition[] {
		return definitions.filter((definition) => !definition.is_builtin);
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
