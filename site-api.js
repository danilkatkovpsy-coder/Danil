(() => {
	const remote = 'https://puipyonlhlyirbhwmsdq.supabase.co/functions/v1';
	const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
	const endpoints = {
		'/api/site-logo': 'site-logo',
		'/api/site-reviews': 'site-reviews',
		'/api/site-contacts': 'site-contacts',
		'/api/site-texts': 'site-texts',
		'/api/prices': 'prices',
		'/api/availability': 'availability',
		'/api/book': 'book',
		'/api/package-purchases': 'package-purchases',
		'/api/vouchers/validate': 'voucher-validate',
		'/api/vouchers/history': 'voucher-history',
	};
	const pending = new Map();
	const previewMode=new URL(location.search||'',location.origin).searchParams.get('admin-preview')==='1';
	const preview=previewMode&&window.parent!==window?window.parent.adminTextPreview?.read(window):null;
	window.siteFetch = async (input, init = {}) => {
		const url = new URL(input, location.origin);
		if(previewMode){
			if(!preview)throw new Error('Предпросмотр недоступен. Откройте его из редактора текстов.');
			if((init.method||'GET').toUpperCase()!=='GET')return Response.json({error:'В предпросмотре отправка отключена. Вернитесь в редактор кнопкой «Назад».'},{status:403});
			if(url.pathname==='/api/site-texts')return Response.json({texts:preview.texts});
			if(url.pathname==='/api/site-logo'&&Object.hasOwn(preview,'logo'))return Response.json({image:preview.logo});
		}
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
