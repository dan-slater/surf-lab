import { error } from '@sveltejs/kit';
import { spots, spotBySlug } from '#lib/spots/spots.ts';

export const entries = () => spots.map((s) => ({ slug: s.slug }));

export const load = ({ params }: { params: { slug: string } }) => {
	const spot = spotBySlug(params.slug);
	if (!spot) error(404, `No spot called ${params.slug}`);
	return { spot };
};
