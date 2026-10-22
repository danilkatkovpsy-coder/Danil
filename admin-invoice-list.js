(() => {
	const get = id => document.getElementById(id);
	const rows = get('invoice-list-rows'), status = get('invoice-list-status'), all = get('invoice-list-all');
	const dialog = get('invoice-list-preview'), previewPages = get('invoice-list-preview-pages');
	const pageSize = 50, selected = new Set(), excluded = new Set();
	let page = 0, total = 0, search = '', sort = 'desc', from = '', through = '', invoices = [];
	let loaded = false, loading = false, busy = false, allSelected = false, generation = 0, previewVersion = 0;
	const isSelected = id => allSelected ? !excluded.has(id) : selected.has(id);
	const selectedCount = () => allSelected ? Math.max(0, total - excluded.size) : selected.size;
	const listUrl = offset => `/api/admin/invoices?${new URLSearchParams({ search, sort, from, through, offset: String(offset) })}`;
	const filename = invoice => `Arve_${invoice.invoice_number.replace(/[^0-9-]/g, '-')}_${invoice.id}.pdf`;
	const validRow = row => row && typeof row.id === 'string' && /^[a-f0-9-]{36}$/i.test(row.id) &&
		['name','email','invoice_number','invoice_date'].every(key => typeof row[key] === 'string') &&
		Number.isFinite(Date.parse(row.invoice_date)) && Number.isSafeInteger(row.price_cents) && row.price_cents > 0;
	const validateList = result => {
		if (!result || !Number.isSafeInteger(result.total) || result.total < 0 || !Array.isArray(result.invoices) ||
			result.invoices.length > pageSize || !result.invoices.every(validRow)) throw new Error('Не удалось прочитать список счетов.');
		return result;
	};
	function controls() {
		const disabled = busy || loading;
		get('invoice-list-filter').querySelectorAll('input,select,button').forEach(el => { el.disabled = disabled; });
		get('invoice-list-refresh').disabled = disabled;
		all.disabled = disabled || !loaded || total === 0;
		all.checked = total > 0 && selectedCount() === total;
		all.indeterminate = selectedCount() > 0 && !all.checked;
		get('invoice-list-selected').textContent = `Выбрано: ${selectedCount()} из ${total}`;
		get('invoice-list-download').disabled = disabled || !loaded || selectedCount() === 0;
		rows.querySelectorAll('input,button').forEach(el => { el.disabled = disabled; });
		for (const key of ['first','prev']) get(`invoice-list-${key}`).disabled = disabled || page === 0;
		for (const key of ['next','last']) get(`invoice-list-${key}`).disabled = disabled || (page + 1) * pageSize >= total;
		get('invoice-list-page').textContent = `Страница ${page + 1} / ${Math.max(1, Math.ceil(total / pageSize))} · Счетов: ${total}`;
	}
	const cell = (row, value) => {
		const td = document.createElement('td'); td.textContent = value; row.append(td); return td;
	};
	function render() {
		rows.replaceChildren();
		for (const [index, invoice] of invoices.entries()) {
			const row = document.createElement('tr'), choice = document.createElement('input');
			choice.type = 'checkbox'; choice.checked = isSelected(invoice.id);
			choice.setAttribute('aria-label', `Выбрать счет ${invoice.invoice_number}, ${invoice.name}`);
			choice.addEventListener('change', () => {
				if (allSelected) { if (choice.checked) excluded.delete(invoice.id); else excluded.add(invoice.id); }
				else { if (choice.checked) selected.add(invoice.id); else selected.delete(invoice.id); }
				controls();
			});
			cell(row, '').append(choice);
			cell(row, String(page * pageSize + index + 1));
			cell(row, invoice.name); cell(row, invoice.email);
			cell(row, new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'EUR' }).format(invoice.price_cents / 100));
			cell(row, invoice.invoice_number);
			cell(row, new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Tallinn', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(invoice.invoice_date)));
			const actions = document.createElement('div'); actions.className = 'invoice-list-row-actions';
			for (const [label, action] of [['Предпросмотр', () => showPreview(invoice)], ['Скачать', () => downloadOne(invoice)]]) {
				const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
				button.addEventListener('click', action); actions.append(button);
			}
			cell(row, '').append(actions); rows.append(row);
			const history = document.createElement('button'); history.type = 'button'; history.textContent = 'История отправок';
			history.addEventListener('click', () => window.adminInvoiceDelivery.open(invoice));
			cell(row, '').append(history);
		}
		if (!invoices.length) { const row = document.createElement('tr'); cell(row, 'Счета не найдены.').colSpan = 9; rows.append(row); }
		controls();
	}
	async function load(force = false) {
		if (get('admin-workspace').hidden || (loaded && !force) || loading || busy) return;
		const current = generation;
		loading = true; controls(); status.textContent = 'Загружаем счета...';
		try {
			const result = validateList(await adminRequest(listUrl(page * pageSize)));
			if (current !== generation) return;
			total = result.total;
			if (page > 0 && page * pageSize >= total) {
				page = Math.max(0, Math.ceil(total / pageSize) - 1);
				const last = validateList(await adminRequest(listUrl(page * pageSize)));
				if (current !== generation) return;
				total = last.total; invoices = last.invoices;
			} else invoices = result.invoices;
			loaded = true; render(); status.textContent = '';
		} catch (error) {
			if (current === generation) { loaded = false; invoices = []; rows.replaceChildren(); status.textContent = error.message; }
		} finally { if (current === generation) { loading = false; controls(); } }
	}
	function resetSelection() { allSelected = false; selected.clear(); excluded.clear(); }
	async function pdfBytes(invoice, current) {
		const response = await window.siteFetch(`/api/admin/invoices/${encodeURIComponent(invoice.id)}/pdf`, {
			headers: { 'x-admin-key': get('admin-key').value },
		});
		if (current !== generation) throw new Error('Сеанс завершен. Откройте список счетов заново.');
		if (!response.ok) {
			if (response.headers.get('content-type')?.includes('application/json')) {
				const result = await response.json();
				throw new Error(result.error || `Не удалось скачать счет (HTTP ${response.status}).`);
			}
			throw new Error(`Не удалось скачать счет (HTTP ${response.status}).`);
		}
		const bytes = new Uint8Array(await response.arrayBuffer());
		if (current !== generation) throw new Error('Сеанс завершен.');
		if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw new Error('Сервер вернул некорректный PDF.');
		return bytes;
	}
	function save(blob, name) {
		const url = URL.createObjectURL(blob), link = document.createElement('a');
		link.href = url; link.download = name; link.hidden = true; document.body.append(link); link.click(); link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 60000);
	}
	async function downloadOne(invoice) {
		const current = generation; busy = true; controls(); status.textContent = 'Скачиваем счет...';
		try {
			const bytes = await pdfBytes(invoice, current);
			save(new Blob([bytes], { type: 'application/pdf' }), filename(invoice));
			status.textContent = 'Счет передан на скачивание.';
		} catch (error) { if (current === generation) status.textContent = error.message; }
		finally { if (current === generation) { busy = false; controls(); } }
	}
	async function downloadSelected() {
		const current = generation, chosen = [], ids = new Set(), expectedTotal = total;
		busy = true; controls(); status.textContent = 'Собираем выбранные счета...';
		try {
			if (selectedCount() > 65535) throw new Error('Выберите до 65535 счетов для одного архива.');
			for (let offset = 0; offset < expectedTotal; offset += pageSize) {
				const result = validateList(await adminRequest(listUrl(offset)));
				if (current !== generation) return;
				if (result.total !== expectedTotal || !result.invoices.length) throw new Error('Список счетов изменился. Обновите его и выберите счета заново.');
				for (const invoice of result.invoices) {
					if (ids.has(invoice.id)) throw new Error('Список счетов изменился. Обновите его и повторите выбор.');
					ids.add(invoice.id);
					if (isSelected(invoice.id)) chosen.push(invoice);
				}
			}
			if (!chosen.length || chosen.length !== selectedCount() || ids.size !== expectedTotal) throw new Error('Выбранные счета изменились. Обновите список и повторите выбор.');
			const files = []; let size = 0;
			for (const [index, invoice] of chosen.entries()) {
				status.textContent = `Загружаем PDF: ${index + 1} из ${chosen.length}...`;
				const bytes = await pdfBytes(invoice, current);
				size += bytes.length;
				if (size > 250 * 1024 * 1024) throw new Error('Архив превышает 250 МБ. Выберите меньше счетов и скачайте частями.');
				files.push({ name: filename(invoice), bytes });
			}
			if (current !== generation) return;
			save(window.createInvoiceZip(files), 'Invoices.zip');
			status.textContent = `ZIP с ${files.length} счетами передан на скачивание.`;
		} catch (error) { if (current === generation) status.textContent = error.message; }
		finally { if (current === generation) { busy = false; controls(); } }
	}
	async function showPreview(invoice) {
		const current = generation, version = ++previewVersion;
		get('invoice-list-preview-title').textContent = `Счет ${invoice.invoice_number} · ${invoice.name}`;
		previewPages.replaceChildren(); get('invoice-list-preview-status').textContent = 'Загружаем PDF...';
		dialog.showModal();
		try {
			const bytes = await pdfBytes(invoice, current);
			const pdfjs = await import('./vendor/pdfjs/pdf.mjs');
			pdfjs.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.mjs', location.href).href;
			const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false });
			try {
				const pdf = await task.promise, canvases = [];
				for (let index = 1; index <= pdf.numPages; index++) {
					if (version !== previewVersion || current !== generation) return;
					const pdfPage = await pdf.getPage(index);
					const viewport = pdfPage.getViewport({ scale: Math.max(600, previewPages.clientWidth) * Math.min(devicePixelRatio || 1, 2) / pdfPage.getViewport({ scale: 1 }).width });
					const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
					const context = canvas.getContext('2d');
					if (!context) throw new Error('Браузер не поддерживает отображение PDF.');
					await pdfPage.render({ canvasContext: context, viewport }).promise; canvases.push(canvas);
				}
				if (version !== previewVersion || current !== generation) return;
				previewPages.replaceChildren(...canvases); get('invoice-list-preview-status').textContent = '';
			} finally { await task.destroy(); }
		} catch (error) {
			if (version === previewVersion && current === generation) get('invoice-list-preview-status').textContent = error.message;
		}
	}
	get('invoice-list-preview-close').addEventListener('click', () => dialog.close());
	dialog.addEventListener('close', () => { previewVersion++; previewPages.replaceChildren(); });
	get('invoice-list-filter').addEventListener('submit', event => {
		event.preventDefault(); if (loading || busy) return;
		const start = get('invoice-list-from').value, end = get('invoice-list-through').value;
		if (start && end && start > end) { status.textContent = 'Дата начала периода должна быть не позже даты окончания.'; return; }
		from = start; through = end;
		search = get('invoice-list-search').value.trim(); sort = get('invoice-list-sort').value;
		page = 0; resetSelection(); load(true);
	});
	get('invoice-list-sort').addEventListener('change', () => get('invoice-list-filter').requestSubmit());
	get('invoice-list-refresh').addEventListener('click', () => { resetSelection(); load(true); });
	get('invoice-list-reset').addEventListener('click', () => {
		if (loading || busy) return;
		get('invoice-list-filter').reset(); get('invoice-list-filter').requestSubmit();
	});
	all.addEventListener('change', () => { resetSelection(); allSelected = all.checked; render(); });
	get('invoice-list-download').addEventListener('click', downloadSelected);
	for (const [key, target] of [['first', () => 0], ['prev', () => page - 1], ['next', () => page + 1], ['last', () => Math.max(0, Math.ceil(total / pageSize) - 1)]]) {
		get(`invoice-list-${key}`).addEventListener('click', () => { if (loading || busy) return; page = target(); load(true); });
	}
	document.addEventListener('admin-login', () => { if (!get('invoices-section').hidden && !get('invoice-panel-list').hidden) load(); });
	document.addEventListener('admin-logout', () => {
		generation++; previewVersion++; loaded = false; loading = false; busy = false;
		page = 0; total = 0; invoices = []; search = ''; sort = 'desc'; from = ''; through = ''; resetSelection();
		get('invoice-list-filter').reset(); rows.replaceChildren(); status.textContent = '';
		if (dialog.open) dialog.close();
		previewPages.replaceChildren(); controls();
	});
	window.adminInvoiceList = { load };
	controls();
})();
