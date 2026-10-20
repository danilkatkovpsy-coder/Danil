(() => {
	const get = id => document.getElementById(id);
	const status = get('calendar-status');
	const weekdays = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
	const dateParts = value => Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
		timeZone: 'Europe/Tallinn', year: 'numeric', month: '2-digit', day: '2-digit',
		hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
	}).formatToParts(new Date(value)).map(({ type, value }) => [type,value]));
	const localDate = value => { const p = dateParts(value); return `${p.year}-${p.month}-${p.day}`; };
	const localInput = value => { const p = dateParts(value); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; };
	const instant = value => {
		if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Укажите дату и время.');
		const target = Date.parse(`${value}:00Z`);
		let guess = target;
		for (let attempt = 0; attempt < 4; attempt++) {
			if (localInput(guess) === value) return new Date(guess).toISOString();
			const p = dateParts(guess);
			guess += target - Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
		}
		throw new Error('Это время недоступно из-за перехода на летнее/зимнее время.');
	};
	let selectedDay = localDate(Date.now());
	let month = selectedDay.slice(0,7);
	let data = null;
	let generation = 0;
	const text = (tag, value, className) => {
		const element = document.createElement(tag);
		element.textContent = value;
		if (className) element.className = className;
		return element;
	};
	const fail = error => { status.textContent = error.message; status.classList.add('is-error'); };
	const parseTimes = value => {
		const result = value.split(',').map(item => item.trim()).filter(Boolean);
		if (result.length > 48 || result.some(item => !/^([01]\d|2[0-3]):[0-5]\d$/.test(item))) {
			throw new Error('Введите часы в формате 09:00, 10:00, 15:30 (до 48 значений).');
		}
		return [...new Set(result)].sort();
	};
	const timesFor = day => data.days.find(item => item.day === day)?.times ||
		data.week.find(item => item.weekday === new Date(`${day}T12:00:00Z`).getUTCDay())?.times || [];
	const button = (label, callback) => {
		const element = text('button',label);
		element.type = 'button';
		element.addEventListener('click', async () => {
			element.disabled = true;
			try { await callback(); } catch(error) { fail(error); } finally { element.disabled = false; }
		});
		return element;
	};
	const request = async values => adminRequest('/api/admin/calendar', {
		method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values),
	});
	async function change(values) {
		status.classList.remove('is-error');
		status.textContent = 'Сохраняем...';
		const result = await request(values);
		await load();
		status.textContent = result.warning || 'Изменения сохранены.';
		status.classList.toggle('is-error',Boolean(result.warning));
	}
	const renderAppointment = appointment => {
		const card = text('article','', 'order-card');
		card.append(text('h3', `${formatAdminDateTime(appointment.start_at)} — ${appointment.name}`));
		card.append(text('p', `${appointment.email} · ${appointment.platform} · ${appointment.status === 'cancelled' ? 'Отменена' : 'Подтверждена'} · ${appointment.package_name}`));
		if (appointment.contact) card.append(text('p',appointment.contact));
		if (appointment.client_request) card.append(text('p',appointment.client_request));
		if (appointment.source === 'google') card.append(text('small','Перенесено из Google. Старое событие в Google не изменяется.'));
		if (appointment.status === 'confirmed' && Date.parse(appointment.start_at) > Date.now()) {
			const editor = text('div','', 'calendar-form');
			const label = text('label','Новое время (Таллин)');
			const input = document.createElement('input');
			input.type = 'datetime-local'; input.value = localInput(appointment.start_at);
			label.append(input); editor.append(label);
			editor.append(button('Перенести и уведомить', async () => {
				if (!confirm('Перенести встречу и отправить клиенту письмо?')) return;
				await change({operation:'move',id:appointment.id,version:appointment.version,start:instant(input.value)});
			}));
			editor.append(button('Отменить и уведомить', async () => {
				if (!confirm('Отменить встречу? Списанная консультация вернётся на ваучер, клиент получит письмо.')) return;
				await change({operation:'cancel',id:appointment.id,version:appointment.version});
			}));
			card.append(editor);
		}
		return card;
	};
	function renderDay() {
		get('calendar-day-title').textContent = `Расписание ${new Intl.DateTimeFormat('ru-RU',{dateStyle:'long',timeZone:'UTC'}).format(new Date(`${selectedDay}T12:00:00Z`))}`;
		get('calendar-day-times').value = timesFor(selectedDay).map(value=>value.slice(0,5)).join(', ');
		const events = get('calendar-day-events');
		events.replaceChildren();
		for (const appointment of data.appointments.filter(item=>localDate(item.start_at)===selectedDay)) events.append(renderAppointment(appointment));
		for (const block of data.blocks.filter(item=>localDate(item.start_at)<=selectedDay&&localDate(Date.parse(item.end_at)-1)>=selectedDay)) {
			const row = text('div','', 'order-card');
			row.append(text('p',`Закрыто: ${block.label || 'Занято'} · ${formatAdminDateTime(block.start_at)} — ${formatAdminDateTime(block.end_at)}`));
			row.append(button('Открыть интервал',async()=>{
				if(confirm('Снять блокировку этого интервала? Он может включать несколько дней.')) await change({operation:'unblock',id:block.id});
			}));
			events.append(row);
		}
		for (const pending of data.pendingReservations.filter(item=>localDate(item.start_at)===selectedDay)) {
			events.append(text('p',`Незавершённая старая запись ${formatAdminDateTime(pending.start_at)}. Время закрыто до проверки администратором.`));
		}
	}
	function renderJournal() {
		const query = get('calendar-search').value.trim().toLowerCase();
		const journal = get('calendar-journal');
		journal.replaceChildren();
		for (const appointment of data.appointments.filter(item=>localDate(item.start_at).startsWith(month)&&
			`${item.name} ${item.email}`.toLowerCase().includes(query))) journal.append(renderAppointment(appointment));
		if(!journal.childElementCount) journal.append(text('p','Записей нет.'));
	}
	function render() {
		const first = new Date(`${month}-01T12:00:00Z`);
		get('calendar-month').textContent = new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'}).format(first);
		const grid = get('calendar-grid'); grid.replaceChildren();
		const offset = (first.getUTCDay()+6)%7;
		for(let i=0;i<offset;i++) grid.append(text('span',''));
		const count = new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
		for(let day=1;day<=count;day++){
			const date = `${month}-${String(day).padStart(2,'0')}`;
			const appointments = data.appointments.filter(item=>item.status==='confirmed'&&localDate(item.start_at)===date).length;
			const blocked = data.blocks.some(item=>localDate(item.start_at)<=date&&localDate(Date.parse(item.end_at)-1)>=date);
			const cell = button('',async()=>{selectedDay=date;render();});
			cell.append(text('strong',String(day)),text('small',appointments ? `${appointments} зап.` : ''));
			cell.className = 'calendar-day';
			cell.classList.toggle('is-closed',!timesFor(date).length||blocked);
			cell.setAttribute('aria-pressed',String(date===selectedDay));
			cell.setAttribute('aria-label',`${date}, записей: ${appointments}${blocked ? ', есть закрытые интервалы' : ''}`);
			grid.append(cell);
		}
		renderDay(); renderJournal();
		const week = get('calendar-week-editor'); week.replaceChildren();
		for(const day of [1,2,3,4,5,6,0]){
			const form = text('form','', 'calendar-week-row');
			const label = text('label',weekdays[day]); const input = document.createElement('input');
			input.value = data.week.find(item=>item.weekday===day).times.map(item=>item.slice(0,5)).join(', ');
			label.append(input); const save = text('button','Сохранить'); save.type='submit';
			form.append(label,save);
			form.addEventListener('submit',async event=>{
				event.preventDefault();save.disabled=true;
				try {await change({operation:'week',weekday:day,times:parseTimes(input.value)});} catch(error){fail(error);}finally{save.disabled=false;}
			});
			week.append(form);
		}
		const queue = get('calendar-mail-queue');queue.replaceChildren();
		for(const job of data.notifications){
			const row = text('div','', 'order-card');
			const expired = Date.now()-Date.parse(job.prepared_at)>23*3600000;
			row.append(text('p',`${formatAdminDateTime(job.prepared_at)} · ${job.kind} · ${job.client_sent_at?'Клиенту отправлено':'Клиенту не подтверждено'} · ${job.admin_sent_at?'Администратору отправлено':'Администратору не подтверждено'}`));
			if(expired) row.append(text('p','Старше 23 часов: проверьте Resend перед повтором. Автоповтор отключён для защиты от дубликатов.'));
			else row.append(button('Повторить доставку',()=>change({operation:'retry_mail',id:job.id})));
			queue.append(row);
		}
		if(!queue.childElementCount) queue.append(text('p','Неотправленных писем нет.'));
		if(data.pendingReservations.length) status.textContent=`Требуют проверки: ${data.pendingReservations.length} незавершённых старых записей. Их время закрыто.`;
	}
	async function load() {
		const current = ++generation;
		status.classList.remove('is-error'); status.textContent='Загружаем календарь...';
		const first = new Date(`${month}-01T12:00:00Z`);
		const next = new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,1,12)).toISOString().slice(0,10);
		const result = await adminRequest(`/api/admin/calendar?from=${month}-01&to=${next}`);
		if(current!==generation) return;
		data=result;render();
		if(!data.pendingReservations.length) status.textContent=data.settings.enabled?'Календарь работает независимо от Google.':'Календарь пока не включён.';
	}
	function section(calendar) {
		get('calendar-section').hidden=!calendar; get('vouchers-section').hidden=calendar;
		get('section-calendar').setAttribute('aria-pressed',String(calendar));
		get('section-vouchers').setAttribute('aria-pressed',String(!calendar));
		if(calendar&&adminKey.value) load().catch(fail);
		else if(calendar) status.textContent='Введите ключ администратора и нажмите «Войти / обновить».';
	}
	get('section-calendar').addEventListener('click',()=>section(true));
	get('section-vouchers').addEventListener('click',()=>section(false));
	adminForm.addEventListener('submit',()=>{if(!get('calendar-section').hidden) load().catch(fail);});
	for(const [id,delta] of [['calendar-prev',-1],['calendar-next',1]]){
		get(id).addEventListener('click',()=>{
			const value=new Date(`${month}-01T12:00:00Z`);
			month=new Date(Date.UTC(value.getUTCFullYear(),value.getUTCMonth()+delta,1,12)).toISOString().slice(0,7);
			selectedDay=`${month}-01`;load().catch(fail);
		});
	}
	get('calendar-search').addEventListener('input',()=>{if(data)renderJournal();});
	const submit = (id,callback) => get(id).addEventListener('submit',async event=>{
		event.preventDefault();const save=event.target.querySelector('[type="submit"]');save.disabled=true;
		try{await callback(new FormData(event.target));}catch(error){fail(error);}finally{save.disabled=false;}
	});
	submit('calendar-day-form',()=>change({operation:'day',date:selectedDay,times:parseTimes(get('calendar-day-times').value)}));
	get('calendar-day-close').addEventListener('click',()=>change({operation:'day',date:selectedDay,times:[]}).catch(fail));
	get('calendar-day-reset').addEventListener('click',()=>change({operation:'reset_day',date:selectedDay}).catch(fail));
	submit('calendar-block-form',values=>change({operation:'block',start:instant(values.get('start')),end:instant(values.get('end')),label:values.get('label')}));
	let createId=null;
	get('calendar-create-form').addEventListener('input',()=>{createId=null;});
	submit('calendar-create-form',async values=>{
		const start=instant(values.get('start'));
		if(!createId)createId=crypto.randomUUID();
		await change({operation:'create',...Object.fromEntries(values),start,
			end:new Date(Date.parse(start)+data.settings.session_minutes*60000).toISOString(),
			date:localDate(start),requestId:createId});
		get('calendar-create-form').reset();createId=null;
	});
})();
