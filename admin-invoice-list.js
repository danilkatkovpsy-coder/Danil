(() => {
	const get = id => document.getElementById(id);
	const rows = get('invoice-list-rows'), status = get('invoice-list-status'), all = get('invoice-list-all');
	const dialog = get('invoice-list-preview'), previewPages = get('invoice-list-preview-pages');
	const pageSize = 50, selected = new Set(), excluded = new Set();
	let page = 0, total = 0, search = '', sort = 'desc', from = '', through = '', invoices = [];
	let loaded = false, loading = false, busy = false, allSelected = false, generation = 0, previewVersion = 0;
	let previewInvoice = null;
	const pendingSends = new Map();
	const pendingKey = id => `admin-invoice-resend:${id}`;
	const isSelected = id => allSelected ? !excluded.has(id) : selected.has(id);
	const selectedCount = () => allSelected ? Math.max(0, total - excluded.size) : selected.size;
	const listUrl = offset => `/api/admin/invoices?${new URLSearchParams({ search, sort, from, through, offset: String(offset) })}`;
	const filename = invoice => `Arve_${invoice.invoice_number.replace(/[^0-9-]/g, '-')}_${invoice.id}.pdf`;
	const validRow = row => row && typeof row.id === 'string' && /^[a-f0-9-]{36}$/i.test(row.id) &&
		['name','email','invoice_number','invoice_date'].every(key => typeof row[key] === 'string') &&
		Number.isFinite(Date.parse(row.invoice_date)) && Number.isSafeInteger(row.price_cents) && row.price_cents > 0 &&
		typeof row.invoice_sent === 'boolean' && typeof row.invoice_paid === 'boolean' &&
		typeof row.invoice_overdue === 'boolean' && (row.invoice_due_day === null ||
			(typeof row.invoice_due_day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.invoice_due_day)));
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
		get('invoice-list-report').disabled = disabled || !loaded || total === 0;
		rows.querySelectorAll('input,button').forEach(el => { el.disabled = disabled; });
		for (const key of ['download','delete','history','send']) get(`invoice-list-preview-${key}`).disabled = disabled || !previewInvoice;
		get('invoice-list-preview-paid').disabled = disabled || !previewInvoice;
		get('invoice-list-preview-paid').textContent = previewInvoice?.invoice_paid ? 'Снять отметку оплаты' : 'Пометить оплаченным';
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
			row.tabIndex = 0;
			row.className = invoice.invoice_overdue && !invoice.invoice_paid ? 'invoice-is-overdue' : '';
			if (invoice.invoice_due_day) row.title = `Срок: ${invoice.invoice_due_day}${invoice.invoice_paid ? ' · Оплачен' : invoice.invoice_overdue ? ' · Просрочен' : ''}`;
			row.setAttribute('aria-label', `Открыть счет ${invoice.invoice_number}, ${invoice.name}`);
			const openRow = event => {
				if (busy || loading || event.target.closest('input,button,a,label')) return;
				if (invoice.invoice_editable === true) window.adminInvoiceEditor.open(invoice.id);
				else showPreview(invoice);
			};
			row.addEventListener('click', openRow);
			row.addEventListener('keydown', event => {
				if (event.target !== row || !['Enter',' '].includes(event.key)) return;
				event.preventDefault(); openRow(event);
			});
			choice.type = 'checkbox'; choice.checked = isSelected(invoice.id);
			choice.setAttribute('aria-label', `Выбрать счет ${invoice.invoice_number}, ${invoice.name}`);
			choice.addEventListener('change', () => {
				if (allSelected) { if (choice.checked) excluded.delete(invoice.id); else excluded.add(invoice.id); }
				else { if (choice.checked) selected.add(invoice.id); else selected.delete(invoice.id); }
				controls();
			});
			cell(row, String(page * pageSize + index + 1));
			cell(row, invoice.name); cell(row, invoice.email);
			cell(row, invoice.invoice_number);
			const sent = document.createElement('span');
			sent.className = `invoice-sent-indicator${invoice.invoice_sent ? ' is-sent' : ''}`;
			sent.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v14H3zM3 5l9 7 9-7"/></svg>';
			sent.setAttribute('role', 'img');
			sent.setAttribute('aria-label', invoice.invoice_sent ? 'Счет отправлялся' : 'Нет подтвержденных отправок');
			sent.title = invoice.invoice_sent ? 'Счет отправлялся хотя бы один раз' : 'Нет подтвержденных отправок';
			cell(row, '').append(sent);
			cell(row, new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(invoice.price_cents / 100));
			cell(row, 'EUR');
			cell(row, new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Tallinn', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(invoice.invoice_date)));
			const paidCell = cell(row, '');
			if (invoice.invoice_paid) {
				const paid = document.createElement('span'); paid.className = 'invoice-paid-indicator';
				paid.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9"/><path d="m5.5 10 3 3 6-6"/></svg>';
				paid.setAttribute('role','img'); paid.setAttribute('aria-label','Счет оплачен'); paid.title = 'Счет оплачен'; paidCell.append(paid);
			}
			cell(row, '').append(choice);
			rows.append(row);
		}
		if (!invoices.length) { const row = document.createElement('tr'); cell(row, 'Счета не найдены.').colSpan = 10; rows.append(row); }
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
	async function markPaid(invoice) {
		if (busy || loading || typeof invoice.invoice_paid !== 'boolean') return;
		const paid = !invoice.invoice_paid;
		if (!confirm(paid ? `Пометить счет № ${invoice.invoice_number} оплаченным?` : `Снять отметку оплаты со счета № ${invoice.invoice_number}?`)) return;
		const current = generation; busy = true; controls();
		try {
			const result = await adminRequest(`/api/admin/invoices/${encodeURIComponent(invoice.id)}/payment`, {
				method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paid}),
			});
			if (current !== generation) return;
			if (result.ok !== true || result.invoice_paid !== paid || typeof result.invoice_overdue !== 'boolean') throw new Error('Изменение оплаты не подтверждено.');
			Object.assign(invoice,result);
			const listed = invoices.find(item => item.id === invoice.id); if (listed) Object.assign(listed,result);
			if (previewInvoice?.id === invoice.id) Object.assign(previewInvoice,result);
			render();
			const text = paid ? 'Счет помечен оплаченным.' : 'Отметка оплаты снята.';
			status.textContent = text;
			if (previewInvoice?.id === invoice.id) get('invoice-list-preview-action-status').textContent = text;
			return result;
		} catch (error) {
			if (current === generation) {
				status.textContent = error.message;
				if (previewInvoice?.id === invoice.id) get('invoice-list-preview-action-status').textContent = error.message;
			}
		} finally { if (current === generation) { busy = false; controls(); } }
	}
	async function sendInvoice(invoice, corrected = false) {
		if (busy || loading) return false;
		const prompt=corrected
			? `Новая версия счета № ${invoice.invoice_number} сохранена. Отправить ее на ${invoice.email}?`
			: `Отправить сохраненный счет № ${invoice.invoice_number} на ${invoice.email}? Если счет уже отправлялся, клиент получит его повторно.`;
		if(!confirm(prompt))return false;
		const current = generation; busy = true; controls();
		const message = value => {
			status.textContent = value;
			if (previewInvoice?.id === invoice.id) get('invoice-list-preview-action-status').textContent = value;
		};
		message('Отправляем счет...');
		try {
			let deliveryId = pendingSends.get(invoice.id) || sessionStorage.getItem(pendingKey(invoice.id));
			if (!deliveryId) {
				deliveryId = crypto.randomUUID();
				sessionStorage.setItem(pendingKey(invoice.id), deliveryId);
			}
			if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(deliveryId)) {
				throw new Error('Некорректный идентификатор сохраненной отправки. Обратитесь к администратору.');
			}
			pendingSends.set(invoice.id, deliveryId);
			const result = await adminRequest(`/api/admin/invoices/${encodeURIComponent(invoice.id)}/send`, {
				method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deliveryId }),
			});
			if (current !== generation) return;
			if (result.ok !== true || result.invoiceEmailSent !== true) throw new Error('Отправка не подтверждена.');
			sessionStorage.removeItem(pendingKey(invoice.id)); pendingSends.delete(invoice.id);
			invoice.invoice_sent = true;
			const listed=invoices.find(item=>item.id===invoice.id);if(listed)listed.invoice_sent=true;
			render();
			message(`Счет отправлен на ${invoice.email}. Отправка сохранена в истории.`);
			return true;
		} catch (error) {
			if (current === generation) message(`${error.message} Если запрос уже ушел, нажмите «Отправить» снова: сохраненный запрос будет повторен без нового письма. После 23 часов проверьте статус в Resend.`);
			return false;
		} finally { if (current === generation) { busy = false; controls(); } }
	}
	async function hideInvoice(invoice) {
		if (busy || loading || !confirm(`Удалить счет № ${invoice.invoice_number} из списка? PDF и история отправок сохранятся. Отправленное письмо не отзывается.`)) return;
		const current = generation; busy = true; controls(); status.textContent = 'Удаляем счет из списка...';
		try {
			const result = await adminRequest(`/api/admin/invoices/${encodeURIComponent(invoice.id)}`, { method: 'DELETE' });
			if (current !== generation) return;
			if (result.ok !== true) throw new Error('Удаление счета не подтверждено.');
			if (previewInvoice?.id === invoice.id) dialog.close();
			resetSelection(); busy = false;
			await load(true);
			if (current === generation && loaded) status.textContent = 'Счет удален из списка. PDF и история сохранены.';
			return true;
		} catch (error) {
			if (current === generation) {
				status.textContent = error.message;
				if (previewInvoice?.id === invoice.id) get('invoice-list-preview-action-status').textContent = error.message;
			}
		}
		finally { if (current === generation) { busy = false; controls(); } }
	}
	async function pdfBytes(invoice, current, report = false) {
		const response = await window.siteFetch(report
			? `/api/admin/invoices/report?${new URLSearchParams({search,sort,from,through})}`
			: `/api/admin/invoices/${encodeURIComponent(invoice.id)}/pdf`, {
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
		} catch (error) {
			if (current === generation) {
				status.textContent = error.message;
				if (previewInvoice?.id === invoice.id) get('invoice-list-preview-action-status').textContent = error.message;
			}
		}
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
	async function downloadReport() {
		if (busy || loading || !loaded || total === 0) return;
		const current = generation; busy = true; controls(); status.textContent = 'Формируем PDF списка всех результатов поиска...';
		try {
			const bytes = await pdfBytes(null,current,true);
			if (current !== generation) return;
			save(new Blob([bytes],{type:'application/pdf'}),'Invoices-list.pdf');
			status.textContent = 'PDF списка счетов передан на скачивание.';
		} catch (error) { if (current === generation) status.textContent = error.message; }
		finally { if (current === generation) { busy = false; controls(); } }
	}
	async function showPreview(invoice) {
		if (busy || loading) return;
		const current = generation, version = ++previewVersion;
		previewInvoice = invoice; controls();
		if (get('invoice-list-preview-edit')) get('invoice-list-preview-edit').hidden = invoice.invoice_editable !== true;
		get('invoice-list-preview-action-status').textContent = '';
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
	get('invoice-list-preview-download').addEventListener('click', () => { if (previewInvoice && !busy && !loading) downloadOne(previewInvoice); });
	get('invoice-list-preview-paid').addEventListener('click', () => { if (previewInvoice) return markPaid(previewInvoice); });
	get('invoice-list-preview-delete').addEventListener('click', () => { if (previewInvoice) hideInvoice(previewInvoice); });
	get('invoice-list-preview-send').addEventListener('click', () => { if (previewInvoice) return sendInvoice(previewInvoice); });
	get('invoice-list-preview-history').addEventListener('click', () => { if (previewInvoice && !busy && !loading) window.adminInvoiceDelivery.open(previewInvoice); });
	get('invoice-list-preview-edit')?.addEventListener('click', () => {
		if (!previewInvoice || busy || loading) return;
		const id = previewInvoice.id; dialog.close(); window.adminInvoiceEditor.open(id);
	});
	dialog.addEventListener('close', () => { previewVersion++; previewInvoice = null; previewPages.replaceChildren(); get('invoice-list-preview-action-status').textContent = ''; controls(); });
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
	get('invoice-list-report').addEventListener('click', downloadReport);
	for (const [key, target] of [['first', () => 0], ['prev', () => page - 1], ['next', () => page + 1], ['last', () => Math.max(0, Math.ceil(total / pageSize) - 1)]]) {
		get(`invoice-list-${key}`).addEventListener('click', () => { if (loading || busy) return; page = target(); load(true); });
	}
	document.addEventListener('admin-login', () => { if (!get('invoices-section').hidden && !get('invoice-panel-list').hidden) load(); });
	document.addEventListener('admin-logout', () => {
		generation++; previewVersion++; loaded = false; loading = false; busy = false;
		pendingSends.clear();
		page = 0; total = 0; invoices = []; search = ''; sort = 'desc'; from = ''; through = ''; resetSelection();
		get('invoice-list-filter').reset(); rows.replaceChildren(); status.textContent = '';
		if (dialog.open) dialog.close();
		previewPages.replaceChildren(); controls();
	});
	window.adminInvoiceList = { load, paid: markPaid, send: sendInvoice, download: downloadOne, remove: hideInvoice, preview: showPreview,
		refresh: () => { resetSelection(); return load(true); } };
	controls();
})();
