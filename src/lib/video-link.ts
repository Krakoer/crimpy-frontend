// A coach types the exercise video field by hand and nothing validates it on
// write, so what arrives is whatever they typed: an address, a sentence, or a
// scheme no browser should be handed. On a session's frozen prescription the
// value was typed by the prescribing coach, who is not always the one reading
// it, so a "javascript:" url would run in the reader's origin.
//
// This mirrors videoLinkUri in crimpy-app/lib/utils/video_link.dart. The two
// have to agree, or the same stored value is a working link on one surface and
// inert text on the other.

// A dotted name ending in a letters-only suffix, or a dotted quad, each with an
// optional port. This is what tells an address from a sentence.
const HOST_AND_PORT =
	/^(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}|(?:\d{1,3}\.){3}\d{1,3})(?::\d{1,5})?$/;

/**
 * The address to link to, or null when the value is not one. A link written
 * without a scheme is read as https rather than dropped, since that is what a
 * coach types and the field they type it into does not make them add one.
 */
export function videoLinkHref(link: string | null | undefined): string | null {
	const trimmed = link?.trim() ?? '';
	// An address has no whitespace in it. A sentence does.
	if (trimmed === '' || /\s/.test(trimmed)) return null;

	if (/^https?:\/\//i.test(trimmed)) {
		try {
			return new URL(trimmed).hostname === '' ? null : trimmed;
		} catch {
			return null;
		}
	}

	// Anything else is only an address if what stands where the host would is
	// host shaped, which is also what refuses "javascript:alert(1)".
	const authority = trimmed.split(/[/?#]/)[0];
	return HOST_AND_PORT.test(authority) ? `https://${trimmed}` : null;
}
