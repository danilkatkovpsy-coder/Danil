(() => {
	const get = id => document.getElementById(id);
	const status = get('calendar-status');
	const weekdays = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
	const defaultColors={free:'#e3e8fa',single:'#d9ece2',five:'#f5e3bc',ten:'#e9dcf3'};
	const colorPalette=[
		['#d9ece2','Светло-зеленый'],['#e3e8fa','Светло-синий'],
		['#f5e3bc','Светло-желтый'],['#e9dcf3','Светло-сиреневый'],
		['#f3dce4','Светло-розовый'],['#f5dfce','Светло-персиковый'],
		['#d5ecec','Светло-бирюзовый'],['#e5e5e5','Светло-серый'],
	];
	const appointmentColors=()=>data.settings.colors||defaultColors;
	const contrastText=hex=>{
		const rgb=[1,3,5].map(offset=>parseInt(hex.slice(offset,offset+2),16)/255)
			.map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4);
		const luminance=rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;
		return luminance>0.179?'#000000':'#ffffff';
	};
	const dateParts = value => Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
		timeZone: 'Europe/Tallinn', year: 'numeric', month: '2-digit', day: '2-digit',
		hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
	}).formatToParts(new Date(value)).map(({ type, value }) => [type,value]));
	const localDate = value => { const p = dateParts(value); return `${p.year}-${p.month}-${p.day}`; };
	const addDays = (day, count) => {
		const date = new Date(`${day}T12:00:00Z`);
		date.setUTCDate(date.getUTCDate()+count);
		return date.toISOString().slice(0,10);
	};
	const weekStart = day => addDays(day,-((new Date(`${day}T12:00:00Z`).getUTCDay()+6)%7));
	const minuteOfDay = value => { const p=dateParts(value);return Number(p.hour)*60+Number(p.minute); };
	const clock = minutes => `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
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
	let weekDraft=[];
	let historyGeneration=0,historyCursor=null;
	async function loadHistory(append=false){
		const current=++historyGeneration;
		const list=get('calendar-history-list'),more=get('calendar-history-more');
		if(!append){historyCursor=null;list.replaceChildren();}
		more.hidden=true;
		get('calendar-history-status').textContent='Загружаем историю...';
		try{
			const suffix=append&&historyCursor?`?before=${encodeURIComponent(historyCursor.at)}&id=${encodeURIComponent(historyCursor.id)}`:'';
			const result=await adminRequest(`/api/admin/calendar/history${suffix}`);
			if(current!==historyGeneration)return;
			for(const entry of result.entries){
				const row=text('article','','order-card calendar-history-entry');
				row.classList.add(`is-${entry.kind}`);
				const title={created:'Запись создана',moved:'Перенос записи',cancelled:'Запись отменена'}[entry.kind]||entry.kind;
				row.append(text('h3',`${title} · ${entry.name}`),text('p',`Изменение: ${formatAdminDateTime(entry.at)}`));
				const interval=(start,end)=>`${formatAdminDateTime(start)} - ${formatAdminDateTime(end)}`;
				if(entry.kind==='moved'&&entry.previous_start)row.append(text('p',`Было: ${interval(entry.previous_start,entry.previous_end)}`));
				row.append(text('p',`${entry.kind==='moved'?'Стало':'Встреча'}: ${interval(entry.start,entry.end)}`));
				row.append(text('p',`${entry.email||'Без email'} · ${entry.platform} · ${{free:'Знакомство',single:'Индивидуальная консультация',five:'Пакет 5 встреч',ten:'Пакет 10 встреч'}[entry.package_name]||entry.package_name}`));
				list.append(row);
			}
			historyCursor=result.entries.at(-1)||historyCursor;
			more.hidden=!result.more;
			get('calendar-history-status').textContent=list.childElementCount?'':'История пока пуста.';
		}catch(error){
			if(current!==historyGeneration)return;
			get('calendar-history-status').textContent=error.message;
			more.hidden=!(append&&historyCursor);
		}
	}
	const text = (tag, value, className) => {
		const element = document.createElement(tag);
		element.textContent = value;
		if (className) element.className = className;
		return element;
	};
	const fail = error => {
		status.textContent = error.message; status.classList.add('is-error');
		if(get('calendar-create-dialog').open)get('calendar-create-status').textContent=error.message;
		if(get('admin-notifications').open)get('admin-notifications-status').textContent=error.message;
		get('calendar-range-status').textContent=error.message;
		get('calendar-period-summary').textContent=error.message;
	};
	const notificationFail=error=>{
		fail(error);
		get('admin-notifications-status').textContent=error.message;
		get('admin-notifications-count').textContent='!';
		get('admin-notifications-count').hidden=false;
		get('admin-notifications-toggle').setAttribute('aria-label','Уведомления: не удалось обновить данные');
	};
	const scheduleTimes = (schedule,day) => {
		if(!schedule.settings.open_dates?.includes(day))return [];
		return schedule.days.find(item=>item.day===day)?.times||
			schedule.week.find(item=>item.weekday===new Date(`${day}T12:00:00Z`).getUTCDay())?.times||[];
	};
	const timesFor = day => scheduleTimes(data,day);
	const endsFor=day=>data.days.find(item=>item.day===day)?.ends||
		data.week.find(item=>item.weekday===new Date(`${day}T12:00:00Z`).getUTCDay())?.ends||{};
	const slotMinutes=(time,ends)=>{
		const minutes=value=>{const [hour,minute]=value.split(':').map(Number);return hour*60+minute;};
		return ends[time]?(minutes(ends[time])-minutes(time)+1440)%1440:data.settings.session_minutes;
	};
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
		get('calendar-details').close();
		get('calendar-create-dialog').close();
		await load();
		status.textContent = result.warning || 'Изменения сохранены.';
		status.classList.toggle('is-error',Boolean(result.warning));
	}
	const renderAppointment = appointment => {
		const card = text('article','', 'order-card');
		card.append(text('h3', `${formatAdminDateTime(appointment.start_at)} - ${appointment.name}`));
		card.append(text('p', `${appointment.email||'Без email'} · ${appointment.platform} · ${appointment.status === 'cancelled' ? 'Отменена' : 'Подтверждена'} · ${appointment.package_name}`));
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
				if (!confirm('Отменить встречу? Списанная консультация вернется на ваучер, клиент получит письмо.')) return;
				await change({operation:'cancel',id:appointment.id,version:appointment.version});
			}));
			card.append(editor);
		}
		return card;
	};
	let dayTimes=[];
	let dayEnds={};
	function renderDayTimes() {
		renderTimeChips(get('calendar-day-times'),get('calendar-time-picker'),get('calendar-time-options'),dayTimes,(times,ends)=>{
			dayTimes=times;dayEnds=ends;renderDayTimes();
		},'',dayEnds);
	}
	function renderTimeChips(chips,picker,options,times,onChange,context='',ends={}) {
		chips.replaceChildren();
		for(const time of times){
			const chip=text('span','','calendar-time-chip');
			const remove=button('×',async()=>{
				const updatedEnds={...ends};delete updatedEnds[time];
				onChange(times.filter(value=>value!==time),updatedEnds);
				picker.querySelector('summary').focus();
			});
			remove.setAttribute('aria-label',`Удалить время ${time}${context?` · ${context}`:''}`);
			chip.append(text('span',ends[time]?`${time}-${ends[time]}`:time),remove);chips.append(chip);
		}
		options.replaceChildren();
		for(let hour=0;hour<24;hour++){
			const time=clock(hour*60);
			const choice=button(time,async()=>{
				picker.open=false;
				onChange([...new Set([...times,time])].sort(),ends);
				picker.querySelector('summary').focus();
			});
			choice.disabled=times.includes(time);
			options.append(choice);
		}
		const custom=text('div','','calendar-custom-time');
		custom.hidden=true;
		const startLabel=text('label','Начало'),endLabel=text('label','Конец');
		const startInput=document.createElement('input'),endInput=document.createElement('input');
		startInput.type=endInput.type='time';startInput.step=endInput.step='60';
		startInput.value='09:00';endInput.value='09:50';
		startInput.addEventListener('input',()=>{
			if(startInput.value){const [hour,minute]=startInput.value.split(':').map(Number);endInput.value=clock((hour*60+minute+50)%1440);}
		});
		startLabel.append(startInput);endLabel.append(endInput);
		const error=text('p','','calendar-custom-time-error');error.setAttribute('role','alert');
		custom.append(startLabel,endLabel,error,button('Добавить интервал',()=>{
			if(!startInput.value||!endInput.value){error.textContent='Укажите начало и конец.';return;}
			const updatedEnds={...ends,[startInput.value]:endInput.value};
			const duration=slotMinutes(startInput.value,updatedEnds);
			if(duration<1||duration>180){error.textContent='Длительность - от 1 минуты до 3 часов. Если конец раньше начала - это следующий день.';return;}
			if(times.includes(startInput.value)){error.textContent='Такое начало уже добавлено. Сначала удалите прежний интервал.';return;}
			picker.open=false;onChange([...times,startInput.value].sort(),updatedEnds);picker.querySelector('summary').focus();
		}));
		const own=button('Свое время',()=>{custom.hidden=!custom.hidden;if(!custom.hidden){custom.scrollIntoView({block:'nearest'});startInput.focus();}});
		own.className='calendar-custom-time-toggle';options.append(own,custom);
	}
	document.addEventListener('click',event=>{
		for(const picker of document.querySelectorAll('.calendar-time-picker')){
			if(!picker.contains(event.target))picker.open=false;
		}
	});
	document.addEventListener('keydown',event=>{
		const picker=event.target.closest('.calendar-time-picker');
		if(event.key==='Escape'&&picker){
			picker.open=false;
			picker.querySelector('summary').focus();
		}
	});
	function renderDay() {
		const dayDate=new Date(`${selectedDay}T12:00:00Z`);
		get('calendar-day-title').textContent = `Расписание · ${weekdays[dayDate.getUTCDay()]}, ${new Intl.DateTimeFormat('ru-RU',{dateStyle:'long',timeZone:'UTC'}).format(dayDate)}`;
		dayTimes=timesFor(selectedDay).map(value=>value.slice(0,5)).sort();
		dayEnds={...endsFor(selectedDay)};
		get('calendar-time-picker').open=false;renderDayTimes();
		const events = get('calendar-day-events');
		events.replaceChildren();
		for (const appointment of data.appointments.filter(item=>item.status==='confirmed'&&localDate(item.start_at)===selectedDay)) events.append(renderAppointment(appointment));
		for (const block of data.blocks.filter(item=>localDate(item.start_at)<=selectedDay&&localDate(Date.parse(item.end_at)-1)>=selectedDay)) {
			const row = text('div','', 'order-card');
			row.append(text('p',`Закрыто: ${block.label || 'Занято'} · ${formatAdminDateTime(block.start_at)} - ${formatAdminDateTime(block.end_at)}`));
			row.append(button('Открыть интервал',async()=>{
				if(confirm('Снять блокировку этого интервала? Он может включать несколько дней.')) await change({operation:'unblock',id:block.id});
			}));
			events.append(row);
		}
		for (const pending of data.pendingReservations.filter(item=>localDate(item.start_at)===selectedDay)) {
			events.append(text('p',`Незавершенная старая запись ${formatAdminDateTime(pending.start_at)}. Время закрыто до проверки администратором.`));
		}
	}
	function renderJournal() {
		const query = get('calendar-search').value.trim().toLowerCase();
		const journal = get('calendar-journal');
		journal.replaceChildren();
		const start=weekStart(selectedDay);
		const days=Array.from({length:7},(_,index)=>addDays(start,index));
		const dateLabel=day=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(`${day}T12:00:00Z`));
		get('calendar-week-label').textContent=`${dateLabel(start)} - ${dateLabel(days[6])}`;
		const appointments=data.appointments.filter(item=>days.includes(localDate(item.start_at))&&`${item.name} ${item.email}`.toLowerCase().includes(query));
		get('calendar-week-summary').textContent=`Встреч: ${appointments.filter(item=>item.status==='confirmed').length}`;
		const entries=[
			...appointments.filter(item=>item.status==='confirmed').map(item=>({...item,kind:'appointment'})),
			...data.blocks.map(item=>({...item,kind:'block'})),
			...data.pendingReservations.map(item=>({...item,kind:'pending'})),
		];
		const segments=days.map(day=>entries.filter(item=>localDate(item.start_at)<=day&&localDate(Date.parse(item.end_at)-1)>=day).map(item=>({
			item,start:localDate(item.start_at)<day?0:minuteOfDay(item.start_at),
			end:localDate(item.end_at)>day?1440:minuteOfDay(item.end_at),
		})));
		const openings=days.map(day=>[addDays(day,-1),day].flatMap(origin=>timesFor(origin).flatMap(time=>{
			const [hour,minute]=time.split(':').map(Number);
			const starts=hour*60+minute;
			const ends=starts+slotMinutes(time.slice(0,5),endsFor(origin));
			const relativeMinute=value=>(Date.parse(`${localDate(value)}T12:00:00Z`)-Date.parse(`${origin}T12:00:00Z`))/86400000*1440+minuteOfDay(value);
			if(data.blocks.some(block=>relativeMinute(block.start_at)<ends&&relativeMinute(block.end_at)>starts))return [];
			const offset=origin===day?0:1440;
			const start=Math.max(0,starts-offset),end=Math.min(1440,ends-offset);
			return end>start?[{start,end}]:[];
		})));
		const minutes=[...segments.flat(),...openings.flat()].flatMap(item=>[item.start,item.end]);
		const firstHour=Math.max(0,Math.floor(Math.min(540,...minutes)/60));
		const lastHour=Math.min(24,Math.ceil(Math.max(1260,...minutes)/60));
		const timeline=text('div','','calendar-timeline');
		timeline.append(text('div','Время','calendar-timeline-heading'));
		for(const day of days) {
			const heading=button(new Intl.DateTimeFormat('ru-RU',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(`${day}T12:00:00Z`)),async()=>{
				selectedDay=day;month=day.slice(0,7);await load();
			});
			heading.className='calendar-timeline-heading';
			heading.classList.toggle('is-selected',day===selectedDay);
			timeline.append(heading);
		}
		const hours=text('div','','calendar-timeline-hours');
		hours.style.height=`${(lastHour-firstHour)*60}px`;
		for(let hour=firstHour;hour<lastHour;hour++) {
			const label=text('span',clock(hour*60),'calendar-hour');label.style.top=`${(hour-firstHour)*60}px`;hours.append(label);
		}
		timeline.append(hours);
		days.forEach((day,index)=>{
			const column=text('div','','calendar-timeline-day');
			column.style.height=hours.style.height;
			for(const {start:slotStart,end:slotEnd} of openings[index]){
				const slot=text('div','','calendar-slot');
				slot.style.top=`${slotStart-firstHour*60}px`;
				slot.style.backgroundPositionY=`${firstHour*60-slotStart}px`;
				slot.style.height=`${slotEnd-slotStart}px`;
				column.append(slot);
			}
			const items=segments[index].sort((a,b)=>a.start-b.start||a.end-b.end);
			const laneEnds=[];
			for(const segment of items){
				let lane=laneEnds.findIndex(end=>end<=segment.start);
				if(lane<0)lane=laneEnds.length;
				laneEnds[lane]=segment.end;segment.lane=lane;
			}
			for(const {item,start,end,lane} of items){
				const label=item.kind==='appointment'?item.name:item.kind==='block'?(item.label||'Закрыто'):'Требует проверки';
				const card=button('',async()=>{
					selectedDay=day;month=day.slice(0,7);render();
					const content=get('calendar-details-content');content.replaceChildren();
					if(item.kind==='appointment')content.append(renderAppointment(item));
					else content.append(text('p',`${label} · ${formatAdminDateTime(item.start_at)} - ${formatAdminDateTime(item.end_at)}`));
					get('calendar-details').showModal();
				});
				card.className=`calendar-timeline-event${item.kind==='block'?' is-block':item.kind==='pending'?' is-pending':item.package_name==='free'?' is-free':''}`;
				if(item.kind==='appointment'){
					const color=appointmentColors()[item.package_name];
					if(color){
						card.style.backgroundColor=color;
						card.style.color=contrastText(color);
						card.style.borderColor=contrastText(color);
					}
				}
				card.style.top=`${start-firstHour*60}px`;card.style.height=`${Math.max(18,end-start)}px`;
				card.style.left=`calc(${lane*100/laneEnds.length}% + 2px)`;card.style.width=`calc(${100/laneEnds.length}% - 4px)`;
				card.setAttribute('aria-label',`${dateLabel(day)}, ${clock(start)}-${clock(end)}, ${label}`);
				card.append(text('strong',`${clock(start)}-${clock(end)}`),text('strong',label));
				if(item.kind==='appointment')card.append(text('span',item.platform),text('span',({single:'Консультация',free:'Знакомство',five:'Ваучер · 5 встреч',ten:'Ваучер · 10 встреч'})[item.package_name]||item.package_name));
				column.append(card);
			}
			timeline.append(column);
		});
		journal.append(timeline);
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
		for(const [type,color] of Object.entries(appointmentColors())){
			const input=get('calendar-colors-form').elements.namedItem(type);
			const picker=input.parentElement.querySelector('details');
			const summary=text('summary','');
			const preview=text('span','','calendar-color-preview');
			const options=text('div','','calendar-color-options');
			const choices=[...colorPalette];
			if(!choices.some(([value])=>value===color.toLowerCase()))choices.push([color.toLowerCase(),'Текущий цвет']);
			const selectColor=(value,label)=>{
				input.value=value;preview.style.backgroundColor=value;
				summary.setAttribute('aria-label',`${picker.getAttribute('aria-label')}: ${label}. Выбрать цвет`);
				for(const swatch of options.children)swatch.setAttribute('aria-pressed',String(swatch.dataset.color===value));
			};
			for(const [value,label] of choices){
				const swatch=button('',()=>{selectColor(value,label);picker.open=false;summary.focus();});
				swatch.dataset.color=value;swatch.style.backgroundColor=value;
				swatch.setAttribute('aria-label',label);swatch.title=label;
				options.append(swatch);
			}
			summary.append(preview);picker.replaceChildren(summary,options);
			selectColor(color.toLowerCase(),choices.find(([value])=>value===color.toLowerCase())[1]);
		}
		const week = get('calendar-week-editor'); week.replaceChildren();
		weekDraft=data.week.map(item=>({weekday:item.weekday,times:item.times.map(time=>time.slice(0,5)),ends:{...item.ends}}));
		for(const day of [1,2,3,4,5,6,0]){
			const form = text('form','', 'calendar-week-row');
			form.setAttribute('aria-label',weekdays[day]);
			const editor=text('div','');
			editor.append(text('strong',weekdays[day]));
			const controls=text('div','','calendar-time-chips');
			const chips=text('div','','calendar-time-chips');
			const picker=text('details','','calendar-time-picker');
			const plus=text('summary','+');
			plus.setAttribute('aria-label',`Добавить время · ${weekdays[day]}`);
			const options=text('div','','calendar-time-options');
			picker.append(plus,options);controls.append(chips,picker);editor.append(controls);
			let times=data.week.find(item=>item.weekday===day).times.map(item=>item.slice(0,5)).sort();
			let ends={...data.week.find(item=>item.weekday===day).ends};
			const redraw=()=>renderTimeChips(chips,picker,options,times,(updated,updatedEnds)=>{
				times=updated;ends=updatedEnds;Object.assign(weekDraft.find(item=>item.weekday===day),{times,ends});redraw();
			},weekdays[day],ends);
			redraw();
			const save = text('button','Сохранить'); save.type='submit';
			form.append(editor,save);
			form.addEventListener('submit',async event=>{
				event.preventDefault();save.disabled=true;
				try {await change({operation:'week',weekday:day,times,ends});} catch(error){fail(error);}finally{save.disabled=false;}
			});
			week.append(form);
		}
		const queue = get('calendar-mail-queue');queue.replaceChildren();
		get('admin-notifications-status').textContent='';
		const notificationCount=data.notifications.length;
		get('admin-notifications-count').textContent=String(notificationCount);
		get('admin-notifications-count').hidden=notificationCount===0;
		get('admin-notifications-toggle').setAttribute('aria-label',`Уведомления: писем для проверки - ${notificationCount}`);
		for(const job of data.notifications){
			const row = text('div','', 'order-card');
			const expired = Date.now()-Date.parse(job.prepared_at)>23*3600000;
			row.append(text('p',`${formatAdminDateTime(job.prepared_at)} · ${{created:'Новая запись',moved:'Перенос',cancelled:'Отмена'}[job.kind]||job.kind} · ${job.client_email_required===false?'Email клиента не указан':job.client_sent_at?'Клиенту отправлено':'Клиенту не подтверждено'} · ${job.admin_sent_at?'Администратору отправлено':'Администратору не подтверждено'}`));
			if(expired) row.append(text('p','Старше 23 часов: проверьте Resend перед повтором. Автоповтор отключен для защиты от дубликатов.'));
			else row.append(button('Повторить доставку',()=>change({operation:'retry_mail',id:job.id})));
			queue.append(row);
		}
		if(!queue.childElementCount) queue.append(text('p','Неотправленных писем нет.'));
		if(data.pendingReservations.length) status.textContent=`Требуют проверки: ${data.pendingReservations.length} незавершенных старых записей. Их время закрыто.`;
	}
	async function load() {
		const current = ++generation;
		status.classList.remove('is-error'); status.textContent='Загружаем календарь...';
		const first = new Date(`${month}-01T12:00:00Z`);
		const next = new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,1,12)).toISOString().slice(0,10);
		const until=weekStart(next)===next?next:addDays(weekStart(next),7);
		const result = await adminRequest(`/api/admin/calendar?from=${weekStart(`${month}-01`)}&to=${until}`);
		if(current!==generation) return;
		data=result;render();
		if(get('calendar-history').open)await loadHistory();
		if(get('calendar-range-form').closest('details').open)await loadRange();
		if(!data.pendingReservations.length) status.textContent=data.settings.enabled?'':'Календарь пока не включен.';
	}
	function section(calendar) {
		get('calendar-section').hidden=!calendar; get('vouchers-section').hidden=calendar;
		get('section-calendar').setAttribute('aria-pressed',String(calendar));
		get('section-vouchers').setAttribute('aria-pressed',String(!calendar));
		if(calendar&&adminKey.value) load().catch(fail);
		else if(!calendar&&adminAuthenticated) loadOrders();
		else if(calendar) status.textContent='Введите ключ администратора и нажмите «Войти».';
	}
	document.addEventListener('admin-logout',()=>{
		generation++;data=null;createId=null;
		historyGeneration++;historyCursor=null;
		get('calendar-history-list').replaceChildren();get('calendar-history-status').textContent='';
		get('calendar-history-more').hidden=true;get('calendar-history').open=false;
		dayTimes=[];get('calendar-day-times').replaceChildren();get('calendar-time-options').replaceChildren();
		get('calendar-time-picker').open=false;
		get('calendar-details').close();
		get('calendar-create-dialog').close();
		get('admin-notifications').close();
		get('admin-notifications-count').hidden=true;
		get('admin-notifications-status').textContent='';
		for(const id of ['calendar-grid','calendar-week-editor','calendar-day-events','calendar-journal','calendar-mail-queue','calendar-details-content']) get(id).replaceChildren();
		for(const id of ['calendar-day-form','calendar-range-form','calendar-create-form','calendar-period-form']) get(id).reset();
		weekDraft=[];get('calendar-period-summary').textContent='';
		rangeGeneration++;rangeData=null;
		rangeStart=null;rangeEnd=null;rangeClosed=true;renderRange();
		get('calendar-search').value='';status.textContent='';
	});
	document.addEventListener('admin-login',()=>load().catch(notificationFail));
	get('calendar-history').addEventListener('toggle',()=>{if(get('calendar-history').open&&adminAuthenticated)loadHistory();});
	get('calendar-history-refresh').addEventListener('click',()=>loadHistory());
	get('calendar-history-more').addEventListener('click',()=>loadHistory(true));
	get('admin-notifications-toggle').addEventListener('click',()=>{
		get('admin-notifications').showModal();
		get('admin-notifications-status').textContent='Обновляем уведомления...';
		load().catch(notificationFail);
	});
	get('admin-notifications-close').addEventListener('click',()=>get('admin-notifications').close());
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
	get('calendar-details-close').addEventListener('click',()=>get('calendar-details').close());
	for(const [id,delta] of [['calendar-week-prev',-7],['calendar-week-next',7],['calendar-today',0],['calendar-day-prev',-1],['calendar-day-next',1]]){
		get(id).addEventListener('click',()=>{
			selectedDay=delta?addDays(selectedDay,delta):localDate(Date.now());
			month=selectedDay.slice(0,7);load().catch(fail);
		});
	}
	const submit = (id,callback) => get(id).addEventListener('submit',async event=>{
		event.preventDefault();const save=event.target.querySelector('[type="submit"]');save.disabled=true;
		try{await callback(new FormData(event.target));}catch(error){fail(error);}finally{save.disabled=false;}
	});
	submit('calendar-day-form',()=>change({operation:'day',date:selectedDay,times:dayTimes,ends:dayEnds}));
	document.addEventListener('click',event=>{
		for(const picker of document.querySelectorAll('.calendar-color-picker[open]')){
			if(!picker.contains(event.target))picker.open=false;
		}
	});
	get('calendar-colors-form').addEventListener('keydown',event=>{
		if(event.key!=='Escape')return;
		for(const picker of document.querySelectorAll('.calendar-color-picker[open]')){
			picker.open=false;picker.querySelector('summary').focus();
		}
	});
	submit('calendar-colors-form',values=>change({operation:'colors',colors:Object.fromEntries(values)}));
	const periodForm=get('calendar-period-form');
	periodForm.addEventListener('input',()=>{
		const values=new FormData(periodForm);
		get('calendar-period-summary').textContent=values.get('from')&&values.get('through')?`Период: ${values.get('from')} - ${values.get('through')} (включительно).`:'';
	});
	submit('calendar-period-form',async values=>{
		const from=String(values.get('from')),through=String(values.get('through'));
		if(through<from||(Date.parse(through)-Date.parse(from))/86400000>366)throw new Error('Выберите период не больше 367 дней, конец не раньше начала.');
		await change({operation:'period_schedule',from,through,schedule:weekDraft});
		get('calendar-period-summary').textContent=`График применен: ${from} - ${through} (включительно).`;
	});
	get('calendar-day-close').addEventListener('click',()=>change({operation:'day',date:selectedDay,times:[]}).catch(fail));
	get('calendar-day-reset').addEventListener('click',()=>change({operation:'reset_day',date:selectedDay}).catch(fail));
	let rangeMonth=selectedDay.slice(0,7),rangeStart=null,rangeEnd=null,rangeClosed=true;
	let rangeData=null,rangeGeneration=0;
	async function loadRange(){
		const current=++rangeGeneration;
		const requestedMonth=rangeMonth;
		const first=new Date(`${requestedMonth}-01T12:00:00Z`);
		const until=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,1,12)).toISOString().slice(0,10);
		const result=await adminRequest(`/api/admin/calendar?from=${requestedMonth}-01&to=${until}`);
		if(current!==rangeGeneration)return;
		rangeData={month:requestedMonth,...result};renderRange();
	}
	get('calendar-range-form').closest('details').addEventListener('toggle',event=>{
		if(event.target.open&&adminAuthenticated)loadRange().catch(fail);
	});
	function renderRange(){
		const first=new Date(`${rangeMonth}-01T12:00:00Z`);
		get('calendar-range-month').textContent=new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'}).format(first);
		const grid=get('calendar-range-grid');grid.replaceChildren();
		for(let i=0;i<(first.getUTCDay()+6)%7;i++)grid.append(text('span',''));
		const count=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
		for(let day=1;day<=count;day++){
			const date=`${rangeMonth}-${String(day).padStart(2,'0')}`;
			const cell=button(String(day),async()=>{
				if(!rangeStart||rangeEnd){rangeStart=date;rangeEnd=null;}
				else {rangeEnd=date;if(rangeEnd<rangeStart)[rangeStart,rangeEnd]=[rangeEnd,rangeStart];}
				get('calendar-range-status').textContent='';renderRange();
			});
			cell.className='calendar-range-day';
			const schedule=rangeData?.month===rangeMonth?rangeData:null;
			const times=schedule?scheduleTimes(schedule,date):null;
			const closed=times!==null&&times.length===0;
			cell.classList.toggle('is-closed',closed);
			cell.classList.toggle('is-in-range',Boolean(rangeEnd&&date>=rangeStart&&date<=rangeEnd));
			cell.setAttribute('aria-pressed',String(date===rangeStart||date===rangeEnd));
			cell.setAttribute('aria-label',`${date}${closed?', закрыто':''}`);grid.append(cell);
		}
		const label=day=>new Intl.DateTimeFormat('ru-RU',{dateStyle:'long',timeZone:'UTC'}).format(new Date(`${day}T12:00:00Z`));
		get('calendar-range-period').textContent=rangeEnd?`${rangeClosed?'Закрыть':'Открыть'}: ${label(rangeStart)} - ${label(rangeEnd)} (включительно).`:rangeStart?`Начало: ${label(rangeStart)}. Выберите последнюю дату.`:'Период не выбран.';
		get('calendar-range-save').disabled=!rangeEnd;
		get('calendar-range-open').setAttribute('aria-pressed',String(!rangeClosed));
		get('calendar-range-close').setAttribute('aria-pressed',String(rangeClosed));
		get('calendar-range-action').textContent=`Выбрано: ${rangeClosed?'закрыть':'открыть'} даты. Изменения применятся после нажатия «Сохранить».`;
	}
	for(const [id,delta] of [['calendar-range-prev',-1],['calendar-range-next',1]]){
		get(id).addEventListener('click',()=>{
			const first=new Date(`${rangeMonth}-01T12:00:00Z`);
			rangeMonth=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+delta,1,12)).toISOString().slice(0,7);
			renderRange();
			rangeData=null;loadRange().catch(fail);
		});
	}
	for(const [id,closed] of [['calendar-range-open',false],['calendar-range-close',true]]){
		get(id).addEventListener('click',()=>{rangeClosed=closed;renderRange();});
	}
	submit('calendar-range-form',async()=>{
		if(!rangeStart||!rangeEnd)throw new Error('Выберите начало и конец периода.');
		if((Date.parse(rangeEnd)-Date.parse(rangeStart))/86400000>366)throw new Error('Выберите период не больше 367 дней.');
		await change({operation:'date_range',from:rangeStart,through:rangeEnd,closed:rangeClosed});
		rangeStart=null;rangeEnd=null;renderRange();
		get('calendar-range-status').textContent=rangeClosed?'Выбранные даты закрыты для новых записей.':'Для выбранных дат восстановлено недельное расписание.';
	});
	renderRange();
	let createId=null;
	const createForm=get('calendar-create-form');
	const createField=name=>createForm.elements.namedItem(name);
	const createSelects=[];
	for(const name of ['packageName','platform']){
		const select=createField(name);
		const picker=text('details','','calendar-create-select');
		const summary=text('summary','');
		const options=text('div','','calendar-create-select-options');
		options.setAttribute('popover','manual');
		const positionOptions=()=>{
			const rect=summary.getBoundingClientRect();
			const below=window.innerHeight-rect.bottom-14;
			const above=rect.top-14;
			const upward=below<150&&above>below;
			options.style.left=`${rect.left}px`;
			options.style.width=`${rect.width}px`;
			options.style.maxHeight=`${Math.max(0,upward?above:below)}px`;
			options.style.top=upward?'auto':`${rect.bottom+6}px`;
			options.style.bottom=upward?`${window.innerHeight-rect.top+6}px`:'auto';
		};
		const sync=()=>{
			summary.textContent=select.selectedOptions[0].textContent;
			summary.setAttribute('aria-label',`${select.getAttribute('aria-label')}: ${summary.textContent}`);
			for(const option of options.children)option.setAttribute('aria-pressed',String(option.dataset.value===select.value));
		};
		for(const option of select.options){
			const choice=button(option.textContent,()=>{
				select.value=option.value;
				select.dispatchEvent(new Event('change',{bubbles:true}));
				select.dispatchEvent(new Event('input',{bubbles:true}));
				options.hidePopover();
				picker.open=false;summary.focus();
			});
			choice.dataset.value=option.value;options.append(choice);
		}
		picker.append(summary,options);select.after(picker);select.hidden=true;
		select.addEventListener('change',sync);
		picker.addEventListener('toggle',()=>{
			if(picker.open){
				for(const other of createSelects)if(other.picker!==picker){other.picker.open=false;other.options.hidePopover();}
				positionOptions();options.showPopover();
			}else options.hidePopover();
		});
		picker.addEventListener('keydown',event=>{
			if(event.key==='Escape'&&picker.open){event.preventDefault();event.stopPropagation();picker.open=false;summary.focus();}
		});
		createSelects.push({picker,options,sync,positionOptions});sync();
	}
	createForm.addEventListener('reset',()=>queueMicrotask(()=>{
		for(const {picker,sync} of createSelects){picker.open=false;sync();}
	}));
	get('calendar-create-dialog').addEventListener('close',()=>{
		for(const {picker,options} of createSelects){picker.open=false;options.hidePopover();}
	});
	const positionCreateOptions=()=>{
		for(const {options,positionOptions} of createSelects)if(options.matches(':popover-open'))positionOptions();
	};
	createForm.addEventListener('scroll',positionCreateOptions);
	window.addEventListener('resize',positionCreateOptions);
	document.addEventListener('click',event=>{
		for(const {picker} of createSelects)if(!picker.contains(event.target))picker.open=false;
	});
	const updateCreateFields=()=>{
		const voucher=['five','ten'].includes(createField('packageName').value);
		get('calendar-create-voucher').hidden=!voucher;
		createField('voucherCode').disabled=!voucher;
		createField('voucherCode').required=voucher;
		for(const name of ['name','email']){
			createField(name).required=name==='name'&&!voucher;
			createField(name).disabled=voucher;
			createField(name).closest('label').hidden=voucher;
		}
		const telegram=createField('platform').value==='Telegram';
		get('calendar-create-telegram').hidden=!telegram;
		createField('telegramContactByUser').disabled=!telegram;
		createField('telegramUsername').disabled=!telegram||createField('telegramContactByUser').checked;
		createField('telegramUsername').required=telegram&&!createField('telegramContactByUser').checked;
		createField('phone').required=createField('platform').value==='WhatsApp';
	};
	for(const name of ['packageName','platform','telegramContactByUser'])createField(name).addEventListener('change',updateCreateFields);
	const defaultEnd=()=>{
		const time=createField('startTime').value;
		if(!time)return;
		const [hour,minute]=time.split(':').map(Number);
		createField('endTime').value=clock((hour*60+minute+50)%1440);
	};
	get('calendar-add').addEventListener('click',()=>{
		if(!data){fail(new Error('Сначала дождитесь загрузки календаря.'));return;}
		if(!createField('date').value) {
			createField('date').value=selectedDay;
			createField('startTime').value='09:00';defaultEnd();
		}
		get('calendar-create-status').textContent='';
		updateCreateFields();
		get('calendar-create-dialog').showModal();
	});
	get('calendar-create-close').addEventListener('click',()=>get('calendar-create-dialog').close());
	createField('startTime').addEventListener('input',defaultEnd);
	createForm.addEventListener('input',()=>{createId=null;get('calendar-create-status').textContent='';});
	submit('calendar-create-form',async values=>{
		const date=String(values.get('date'));
		const startTime=String(values.get('startTime'));
		const endTime=String(values.get('endTime'));
		const start=instant(`${date}T${startTime}`);
		const end=instant(`${endTime<startTime?addDays(date,1):date}T${endTime}`);
		if(Date.parse(end)<=Date.parse(start)||Date.parse(end)-Date.parse(start)>10800000)throw new Error('Конец должен быть позже начала. Длительность - до 3 часов.');
		if(!createId)createId=crypto.randomUUID();
		const result=await request({operation:'create',...Object.fromEntries(values),
			telegramContactByUser:createField('platform').value==='Telegram'&&createField('telegramContactByUser').checked,
			start,end,date,requestId:createId});
		get('calendar-create-dialog').close();
		selectedDay=date;month=date.slice(0,7);
		await load();
		status.textContent=result.warning||(result.clientEmailRequired===false?'Запись сохранена в календаре. Email не указан - письмо клиенту не отправлялось.':'Запись сохранена. Письмо отправлено клиенту.');
		status.classList.toggle('is-error',Boolean(result.warning));
		get('calendar-create-form').reset();createId=null;
	});
})();
