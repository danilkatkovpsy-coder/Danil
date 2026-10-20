(() => {
	const remote = 'https://puipyonlhlyirbhwmsdq.supabase.co/functions/v1';
	const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
	const endpoints = {
		'/api/availability': 'availability',
		'/api/book': 'book',
		'/api/package-purchases': 'package-purchases',
		'/api/vouchers/validate': 'voucher-validate',
		'/api/vouchers/history': 'voucher-history',
	};
	const pending = new Map();
	window.siteFetch = async (input, init = {}) => {
		const url = new URL(input, location.origin);
		let endpoint = endpoints[url.pathname];
		if (url.pathname.startsWith('/api/admin/')) endpoint = `admin/${url.pathname.slice('/api/admin/'.length)}`;
		if (!endpoint) throw new Error('Неизвестный адрес API.');
		const options = { ...init };
		const needsId = ['/api/book', '/api/package-purchases', '/api/admin/vouchers/gift'].includes(url.pathname);
		let fingerprint;
		if (needsId) {
			const body = JSON.parse(options.body);
			fingerprint = `${url.pathname}:${JSON.stringify(body)}`;
			if (!pending.has(fingerprint)) pending.set(fingerprint, crypto.randomUUID());
			options.body = JSON.stringify({ ...body, requestId: pending.get(fingerprint) });
		}
		const response = await fetch(local ? input : `${remote}/${endpoint}${url.search}`, options);
		// Keep IDs for the lifetime of this page, including repeated successful submits.
		// Editing the form creates a different fingerprint and a new request.
		return response;
	};
})();
