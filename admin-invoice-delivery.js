(() => {
	const get = id => document.getElementById(id), dialog = get('invoice-delivery-dialog');
	let invoice = null, offset = 0, version = 0, busy = false;
	const format = value => new Intl.DateTimeFormat('ru-RU', {
		timeZone: 'Europe/Tallinn', dateStyle: 'short', timeStyle: 'medium',
	}).format(new Date(value));
	async function load() {
		if (!invoice || busy) return;
		const current = version; busy = true; get('invoice-delivery-more').disabled = true;
		get('invoice-delivery-status').textContent = 'Загружаем историю...';
		try {
			const result = await adminRequest(`/api/admin/invoices/${encodeURIComponent(invoice.id)}/deliveries?offset=${offset}`);
			if (current !== version) return;
			if (!Array.isArray(result.deliveries) || typeof result.more !== 'boolean' ||
				!result.deliveries.every(row => typeof row.email === 'string' &&
					['package','manual','automatic'].includes(row.source) && Number.isFinite(Date.parse(row.started_at)) &&
					(row.accepted_at === null || Number.isFinite(Date.parse(row.accepted_at))))) {
				throw new Error('Не удалось прочитать историю отправок.');
			}
			for (const row of result.deliveries) {
				const card = document.createElement('article'); card.className = 'order-card';
				for (const value of [
					row.accepted_at ? `Отправлен: ${format(row.accepted_at)}` : `Отправка не подтверждена · попытка ${format(row.started_at)}`,
					`Email: ${row.email}`,
					{ package: 'Счет за пакет', manual: 'Ручной счет', automatic: 'Автоматически после консультации' }[row.source],
				]) { const line = document.createElement('p'); line.textContent = value; card.append(line); }
				get('invoice-delivery-rows').append(card);
			}
			offset += result.deliveries.length;
			get('invoice-delivery-more').hidden = !result.more;
			get('invoice-delivery-status').textContent = offset ? '' : 'Этот счет еще не отправлялся.';
		} catch (error) {
			if (current === version) {
				get('invoice-delivery-status').textContent = error.message; get('invoice-delivery-more').hidden = false;
			}
		} finally { if (current === version) { busy = false; get('invoice-delivery-more').disabled = false; } }
	}
	window.adminInvoiceDelivery = { open(value) {
		version++; invoice = value; offset = 0; busy = false;
		get('invoice-delivery-title').textContent = `История отправок · счет № ${value.invoice_number}`;
		get('invoice-delivery-rows').replaceChildren(); get('invoice-delivery-more').hidden = true;
		dialog.showModal(); load();
	} };
	get('invoice-delivery-close').addEventListener('click', () => dialog.close());
	get('invoice-delivery-more').addEventListener('click', load);
	dialog.addEventListener('close', () => {
		version++; invoice = null; offset = 0; busy = false;
		get('invoice-delivery-rows').replaceChildren(); get('invoice-delivery-status').textContent = '';
	});
	document.addEventListener('admin-logout', () => { if (dialog.open) dialog.close(); });
})();
