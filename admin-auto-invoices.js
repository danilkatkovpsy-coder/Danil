(() => {
	const get = id => document.getElementById(id);
	const enabled = get('auto-invoice-enabled'), delay = get('auto-invoice-delay'), status = get('auto-invoice-status');
	const hours = get('auto-invoice-delay-hours'), days = get('auto-invoice-delay-days');
	const delayFields = [days, hours, delay];
	let settings = null, busy = false, loading = false, generation = 0, events = [];
	const date = value => new Intl.DateTimeFormat('ru-RU', {
		timeZone: 'Europe/Tallinn', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
	}).format(new Date(value));
	const post = (path, body) => adminRequest(`/api/admin/${path}`, {
		method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
	});
	function controls() {
		enabled.disabled = get('auto-invoice-save').disabled = !settings || busy || loading;
		delayFields.forEach(field => { field.disabled = !settings || busy || loading; });
	}
	function show(value) {
		if (!value || typeof value.enabled !== 'boolean' || !Number.isInteger(value.delay_minutes) ||
			value.delay_minutes < 0 || value.delay_minutes > 10080 ||
			(value.last_run_at !== null && !Number.isFinite(Date.parse(value.last_run_at)))) {
			throw new Error('Не удалось прочитать настройки автоматических счетов.');
		}
		settings = value; enabled.checked = value.enabled;
		days.value = String(Math.floor(value.delay_minutes / 1440));
		hours.value = String(Math.floor(value.delay_minutes % 1440 / 60));
		delay.value = String(value.delay_minutes % 60);
		get('auto-invoice-last-run').textContent = value.last_run_at
			? `Последняя серверная проверка: ${date(value.last_run_at)}.`
			: 'После включения сервер начнет проверять завершенные встречи.';
	}
	async function load() {
		if (loading || busy || get('admin-workspace').hidden) return;
		const current = generation; loading = true; controls(); status.textContent = 'Загружаем настройки...';
		try {
			const result = await adminRequest('/api/admin/auto-invoices');
			if (current !== generation) return;
			show(result.settings); status.textContent = '';
		} catch (error) { if (current === generation) { settings = null; status.textContent = error.message; } }
		finally { if (current === generation) { loading = false; controls(); } }
	}
	async function save(changingState) {
		if (!settings || busy || loading) return;
		const selected = enabled.checked;
		if (!delayFields.every(field => field.reportValidity())) { enabled.checked = settings.enabled; return; }
		const delayMinutes = Number(days.value) * 1440 + Number(hours.value) * 60 + Number(delay.value);
		if (!delayFields.every(field => field.value.trim() !== '' && Number.isSafeInteger(Number(field.value)) && Number(field.value) >= 0) ||
			!Number.isSafeInteger(delayMinutes) || delayMinutes < 0 || delayMinutes > 10080) {
			enabled.checked = settings.enabled; status.textContent = 'Укажите целые дни, часы и минуты. Общая задержка — от 0 до 7 дней.'; return;
		}
		const duration = `${Math.floor(delayMinutes / 1440)} дн. ${Math.floor(delayMinutes % 1440 / 60)} ч. ${delayMinutes % 60} мин.`;
		if (changingState && !confirm(selected
			? `Включить автоматическую отправку счетов через ${duration} после разовых платных консультаций? Будут учтены только встречи, заканчивающиеся после включения.`
			: 'Отключить автоматическую отправку счетов? Новые отправки остановятся. Письма, уже переданные почтовому сервису, отозвать нельзя.')) {
			enabled.checked = settings.enabled; return;
		}
		const current = generation; busy = true; controls(); status.textContent = 'Сохраняем...';
		try {
			const result = await post('auto-invoices', { enabled: selected, delayMinutes });
			if (current !== generation) return;
			if (result.ok !== true) throw new Error('Сохранение настроек не подтверждено.');
			show(result.settings);
			status.textContent = selected ? 'Автоматическая отправка включена. Настройки сохранены.' : 'Автоматическая отправка отключена.';
		} catch (error) {
			if (current === generation) {
				enabled.checked = settings.enabled; settings = null;
				status.textContent = `${error.message} Откройте вкладку заново, чтобы проверить состояние на сервере.`;
			}
		} finally { if (current === generation) { busy = false; controls(); } }
	}
	enabled.addEventListener('change', () => save(true));
	get('auto-invoice-form').addEventListener('submit', event => { event.preventDefault(); save(false); });
	document.addEventListener('admin-login', () => {
		if (!get('invoices-section').hidden && !get('invoice-panel-automatic').hidden) load();
	});
	function renderNotifications(result) {
		if (!result || !Number.isSafeInteger(result.unread) || result.unread < 0 || !Array.isArray(result.events) ||
			!result.events.every(event => Number.isSafeInteger(event.id) && ['sent','error'].includes(event.kind) &&
				['name','email','message'].every(key => typeof event[key] === 'string') &&
				Number.isFinite(Date.parse(event.created_at)))) throw new Error('Не удалось прочитать уведомления о счетах.');
		events = result.events;
		const list = get('auto-invoice-notifications'); list.replaceChildren();
		for (const event of events) {
			const card = document.createElement('article'); card.className = 'order-card';
			for (const value of [
				`${event.read_at ? '' : 'Новое · '}${event.kind === 'sent' ? 'Счет отправлен' : 'Событие отправки'}${event.invoice_number ? ` № ${event.invoice_number}` : ''}`,
				`${event.name} · ${event.email}`, date(event.created_at), event.message,
			]) { const line = document.createElement('p'); line.textContent = value; card.append(line); }
			list.append(card);
		}
		if (!events.length) { const empty = document.createElement('p'); empty.textContent = 'Уведомлений о счетах пока нет.'; list.append(empty); }
		get('auto-invoice-notifications-read').disabled = !events.some(event => !event.read_at);
		return result.unread;
	}
	get('auto-invoice-notifications-read').addEventListener('click', async () => {
		const ids = events.filter(event => !event.read_at).map(event => event.id);
		if (!ids.length) return;
		const current = generation; get('auto-invoice-notifications-read').disabled = true;
		try {
			const result = await post('invoice-notifications/read', { ids });
			if (current !== generation) return;
			if (result.ok !== true) throw new Error('Просмотр уведомлений не сохранен.');
			get('auto-invoice-notifications-status').textContent = 'Просмотр сохранен. Уведомления остаются в истории.';
			document.dispatchEvent(new Event('admin-data-changed'));
		} catch (error) {
			if (current === generation) {
				get('auto-invoice-notifications-status').textContent = error.message;
				get('auto-invoice-notifications-read').disabled = false;
			}
		}
	});
	document.addEventListener('admin-logout', () => {
		generation++; settings = null; events = []; busy = loading = false;
		enabled.checked = false; days.value = hours.value = '0'; delay.value = '30'; status.textContent = '';
		get('auto-invoice-last-run').textContent = ''; get('auto-invoice-notifications-status').textContent = '';
		get('auto-invoice-notifications').replaceChildren(); get('auto-invoice-notifications-read').disabled = true; controls();
	});
	window.adminAutoInvoices = { renderNotifications, load };
	controls();
})();
