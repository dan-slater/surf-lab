// Host gate for surf-lab (CF Pages project `surf-lab`, direct upload).
//  - surf.danielslater.dev : the site. Served with noindex until Daniel has
//                            seen the renderer and says it can be indexed;
//                            set INDEX = true then.
//  - *.pages.dev and any other host: 404, so the project's pages.dev name is
//    never a second copy of the site.
const HOST = 'surf.danielslater.dev';
const INDEX = false;
export default {
	async fetch(request, env) {
		const host = new URL(request.url).hostname;
		if (host !== HOST && host !== 'localhost' && !host.startsWith('127.')) {
			return new Response('Not found', { status: 404 });
		}
		const res = await env.ASSETS.fetch(request);
		if (INDEX) return res;
		const headers = new Headers(res.headers);
		headers.set('x-robots-tag', 'noindex, nofollow');
		return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
	}
};
