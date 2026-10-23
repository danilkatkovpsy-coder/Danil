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
		const card = text('article','', 'order-card calendar-appointment');
		card.append(text('h3', `${formatAdminDateTime(appointment.start_at)} - ${appointment.name}`));
		if(appointment.voucher_code)card.append(text('p',`Номер ваучера: ${appointment.voucher_code}`));
		if(appointment.voucher_position)card.append(text('p',`Консультация ${appointment.voucher_position} из ${appointment.voucher_total} по ваучеру`));
		const packageLabel={free:'Бесплатное знакомство',single:'Индивидуальная консультация',five:'Ваучер на 5 встреч',ten:'Ваучер на 10 встреч'}[appointment.package_name]||appointment.package_name;
		card.append(text('p', `${appointment.email||'Без email'} · ${appointment.platform} · ${appointment.status === 'cancelled' ? 'Отменена' : 'Подтверждена'} · ${packageLabel}`));
		if (appointment.contact) card.append(text('p',appointment.contact));
		if (appointment.client_request) card.append(text('p',appointment.client_request));
		if (appointment.source === 'google') card.append(text('small','Перенесено из Google. Старое событие в Google не изменяется.'));
		const invoiceActions=text('div','');
		window.adminManualInvoice.mount(invoiceActions,{appointmentId:appointment.id,name:appointment.name,email:appointment.email});
		card.append(invoiceActions);
		if (appointment.status === 'confirmed' && ['Zoom','Microsoft Teams'].includes(appointment.platform)) {
			if (!appointment.email) card.append(text('p','Для отправки ссылки у записи должен быть указан email клиента.'));
			else {
				const reveal=text('button','Отправить ссылку');reveal.type='button';
				const form=text('form','','calendar-form calendar-link-send-form');
				form.hidden=true;
				const linkInput=document.createElement('input');linkInput.type='url';linkInput.name='link';linkInput.required=true;
				linkInput.maxLength=2048;linkInput.placeholder='https://';linkInput.autocomplete='url';
				reveal.addEventListener('click',()=>{
					form.hidden=!form.hidden;reveal.textContent=form.hidden?'Отправить ссылку':'Скрыть';
					if(!form.hidden)linkInput.focus();
				});
				const linkLabel=text('label','Ссылка на встречу');linkLabel.append(linkInput);
				const meetingId=document.createElement('input');meetingId.name='meetingId';meetingId.maxLength=200;meetingId.autocomplete='off';
				const meetingIdLabel=text('label','Номер конференции');meetingIdLabel.append(meetingId);
				const meetingPassword=document.createElement('input');meetingPassword.name='meetingPassword';meetingPassword.maxLength=200;meetingPassword.autocomplete='off';
				const meetingPasswordLabel=text('label','Пароль конференции');meetingPasswordLabel.append(meetingPassword);
				const accessDetails=document.createElement('textarea');accessDetails.name='accessDetails';accessDetails.maxLength=5000;
				accessDetails.rows=5;accessDetails.placeholder='Можно вставить дополнительные инструкции Zoom или Teams';
				const accessLabel=text('label','Дополнительный текст приглашения');accessLabel.append(accessDetails);
				const submit=text('button','Отправить');submit.type='submit';
				const sendStatus=text('p','','calendar-link-send-status');sendStatus.setAttribute('role','status');
				let deliveryId=crypto.randomUUID();
				form.addEventListener('input',()=>{deliveryId=crypto.randomUUID();});
				form.addEventListener('submit',async event=>{
					event.preventDefault();if(!form.reportValidity())return;
					submit.disabled=true;sendStatus.textContent='Отправляем письмо...';sendStatus.classList.remove('is-error');
					try{
						await adminRequest('/api/admin/calendar-link-email/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
							appointmentId:appointment.id,link:linkInput.value.trim(),meetingId:meetingId.value.trim(),
							meetingPassword:meetingPassword.value.trim(),accessDetails:accessDetails.value.trim(),deliveryId,
						})});
						sendStatus.textContent=`Письмо отправлено на ${appointment.email}.`;deliveryId=crypto.randomUUID();
					}catch(error){
						sendStatus.textContent=/операция не найдена|not found/i.test(error.message)
							?'Сервис отправки ссылок не обновлен. Обновите admin Edge Function.':error.message;
						sendStatus.classList.add('is-error');
					}
					finally{submit.disabled=false;}
				});
				form.append(linkLabel,meetingIdLabel,meetingPasswordLabel,accessLabel,submit,sendStatus);card.append(reveal,form);
			}
		}
		if (appointment.status === 'confirmed' && Date.parse(appointment.start_at) > Date.now()) {
			const editor = text('div','', 'calendar-form');
			const label = text('label','Новое время');
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
	function renderDay(background=false) {
		const dayDate=new Date(`${selectedDay}T12:00:00Z`);
		get('calendar-day-title').textContent = `Расписание · ${weekdays[dayDate.getUTCDay()]}, ${new Intl.DateTimeFormat('ru-RU',{dateStyle:'long',timeZone:'UTC'}).format(dayDate)}`;
		if(!background){
			dayTimes=timesFor(selectedDay).map(value=>value.slice(0,5)).sort();
			dayEnds={...endsFor(selectedDay)};
			get('calendar-time-picker').open=false;renderDayTimes();
		}
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
				const voucherPosition=item.kind==='appointment'&&item.voucher_position?`${item.voucher_position} из ${item.voucher_total}`:'';
				card.setAttribute('aria-label',`${dateLabel(day)}, ${clock(start)}-${clock(end)}, ${label}${voucherPosition?`, консультация ${voucherPosition} по ваучеру`:''}`);
				card.title=card.getAttribute('aria-label');
				card.append(text('strong',`${clock(start)}-${clock(end)}${voucherPosition?` · ${voucherPosition}`:''}`),text('strong',label));
				if(item.kind==='appointment')card.append(text('span',item.platform),text('span',({single:'Консультация',free:'Знакомство',five:'Ваучер · 5 встреч',ten:'Ваучер · 10 встреч'})[item.package_name]||item.package_name));
				column.append(card);
			}
			timeline.append(column);
		});
		journal.append(timeline);
	}
	function render(background=false) {
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
		renderDay(background); renderJournal();
		if(background)return;
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
		renderMailNotifications();
	}
	function renderMailNotifications(){
		const queue = get('calendar-mail-queue');queue.replaceChildren();
		get('admin-notifications-status').textContent='';
		mailNotificationCount=data.notifications.length;
		updateIncomingNotifications();
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
	function section(selected) {
		window.adminNavigation.write('section',selected);
		if(selected!=='texts'&&!get('texts-section').hidden)textSections.leave();
		for(const name of ['calendar','vouchers','prices','invoices','texts','reviews','contacts','clients']){
			get(`${name}-section`).hidden=name!==selected;
			get(`section-${name}`).setAttribute('aria-pressed',String(name===selected));
		}
		if(!adminAuthenticated)return;
		if(selected==='calendar')load().catch(fail);
		else if(selected==='prices')loadPrices();
		else if(selected==='invoices')loadInvoiceSettings();
		else if(selected==='texts')loadTexts();
		else if(selected==='contacts')loadContacts();
		else if(selected==='reviews')loadReviews();
		else if(selected==='clients')document.dispatchEvent(new Event('admin-clients-open'));
		else loadOrders();
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
		incomingOrders=[];incomingReviews=[];incomingBookings=[];mailNotificationCount=0;invoiceNotificationCount=0;
		get('admin-incoming-notifications').replaceChildren();
		clearTimeout(liveTimer);
		for(const id of ['calendar-grid','calendar-week-editor','calendar-day-events','calendar-journal','calendar-mail-queue','calendar-details-content']) get(id).replaceChildren();
		for(const id of ['calendar-day-form','calendar-range-form','calendar-create-form','calendar-period-form']) get(id).reset();
		weekDraft=[];get('calendar-period-summary').textContent='';
		rangeGeneration++;rangeData=null;
		rangeStart=null;rangeEnd=null;rangeClosed=true;renderRange();
		get('calendar-search').value='';status.textContent='';
	});
	document.addEventListener('admin-login',()=>{
		section(window.adminNavigation.read('section',['calendar','vouchers','prices','invoices','texts','reviews','contacts','clients'],'calendar'));
		if(get('calendar-section').hidden)load().catch(notificationFail);
	});
	get('calendar-history').addEventListener('toggle',()=>{if(get('calendar-history').open&&adminAuthenticated)loadHistory();});
	get('calendar-history-refresh').addEventListener('click',()=>loadHistory());
	get('calendar-history-more').addEventListener('click',()=>loadHistory(true));
	get('admin-notifications-toggle').addEventListener('click',()=>{
		get('admin-notifications').showModal();
		acknowledgeBookings();
		get('admin-notifications-status').textContent='Обновляем уведомления...';
		refreshLive();
	});
	get('admin-notifications-close').addEventListener('click',()=>get('admin-notifications').close());
	for(const name of ['calendar','vouchers','prices','invoices','texts','reviews','contacts','clients']){
		get(`section-${name}`).addEventListener('click',()=>section(name));
	}
	const reviewsForm=get('reviews-form'),reviewsEditor=get('reviews-editor');
	let incomingOrders=[],incomingReviews=[],mailNotificationCount=0,invoiceNotificationCount=0,liveTimer=null,liveBusy=false;
	let incomingBookings=[],seenBookingIds=new Set();
	const bookingSeenKey='danilpsy-seen-bookings';
	const bookingStorageError=error=>{
		console.error('Не удалось сохранить просмотр уведомлений.',error);
		get('admin-notifications-status').textContent='Браузер не разрешил сохранить просмотр броней. После перезагрузки уведомления могут появиться снова.';
	};
	try{
		const saved=JSON.parse(localStorage.getItem(bookingSeenKey)||'[]');
		if(!Array.isArray(saved)||!saved.every(id=>typeof id==='string'))throw new Error('Некорректные данные просмотренных броней.');
		seenBookingIds=new Set(saved);
	}catch(error){bookingStorageError(error);}
	const acknowledgeBookings=()=>{
		if(!incomingBookings.length)return;
		for(const entry of incomingBookings)seenBookingIds.add(entry.id);
		try{localStorage.setItem(bookingSeenKey,JSON.stringify([...seenBookingIds]));}
		catch(error){bookingStorageError(error);}
		updateIncomingNotifications();
	};
	const fetchBookingNotifications=async()=>{
		const entries=[];
		let cursor='';
		do{
			const page=await adminRequest(`/api/admin/calendar/history${cursor}`);
			entries.push(...page.entries.filter(entry=>entry.kind==='created'&&!seenBookingIds.has(entry.id)));
			const last=page.entries.at(-1);
			if(page.more&&!last)throw new Error('Не удалось прочитать историю новых броней.');
			cursor=page.more?`?before=${encodeURIComponent(last.at)}&id=${encodeURIComponent(last.id)}`:'';
		}while(cursor);
		return entries;
	};
	const updateIncomingNotifications=()=>{
		const unreadBookings=incomingBookings.filter(entry=>!seenBookingIds.has(entry.id));
		const count=incomingOrders.length+incomingReviews.length+mailNotificationCount+unreadBookings.length+invoiceNotificationCount;
		get('admin-notifications-count').textContent=String(count);
		get('admin-notifications-count').hidden=count===0;
		get('admin-notifications-toggle').setAttribute('aria-label',`Уведомления: новые брони - ${unreadBookings.length}, заявки на ваучеры - ${incomingOrders.length}, отзывы на проверку - ${incomingReviews.length}, письма для проверки - ${mailNotificationCount}, счета - ${invoiceNotificationCount}`);
		const list=get('admin-incoming-notifications');list.replaceChildren();
		for(const entry of incomingBookings){
			const open=text('button',`Новая бронь · ${formatAdminDateTime(entry.start)} · ${entry.name}`);open.type='button';
			open.addEventListener('click',()=>{
				get('admin-notifications').close();
				selectedDay=localDate(entry.start);month=selectedDay.slice(0,7);section('calendar');
			});
			list.append(open);
		}
		for(const [items,label,target] of [[incomingOrders,'Заявки на ваучеры','vouchers'],[incomingReviews,'Отзывы на проверку','reviews']]){
			if(!items.length)continue;
			const open=text('button',`${label}: ${items.length}`);open.type='button';
			open.addEventListener('click',()=>{
				if(target==='reviews'&&reviewsDirty&&!confirm('В редакторе есть несохраненные изменения. Открыть список заново без их сохранения?'))return;
				get('admin-notifications').close();
				if(target==='vouchers')activeTab='applications';
				section(target);
			});
			list.append(open);
		}
		if(!count&&!incomingBookings.length)list.append(text('p','Новых уведомлений нет.'));
	};
	const scheduleLive=()=>{
		clearTimeout(liveTimer);
		if(adminAuthenticated)liveTimer=setTimeout(refreshLive,15000);
	};
	async function refreshLive(){
		if(!adminAuthenticated||document.hidden||liveBusy)return;
		if(adminMutations){scheduleLive();return;}
		liveBusy=true;clearTimeout(liveTimer);
		const session=adminSessionVersion,calendarGeneration=generation,reviewGeneration=reviewsGeneration;
		const mutationVersion=adminMutationVersion;
		const requestedMonth=month;
		const first=new Date(`${month}-01T12:00:00Z`);
		const next=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,1,12)).toISOString().slice(0,10);
		const until=weekStart(next)===next?next:addDays(weekStart(next),7);
		try{
			const [orders,reviews,calendar,bookings,invoiceNotifications]=await Promise.all([
				adminRequest('/api/admin/package-orders'),adminRequest('/api/admin/site-reviews'),
				adminRequest(`/api/admin/calendar?from=${weekStart(`${requestedMonth}-01`)}&to=${until}`),
				fetchBookingNotifications(),
				adminRequest('/api/admin/invoice-notifications'),
			]);
			if(!adminAuthenticated||session!==adminSessionVersion||mutationVersion!==adminMutationVersion)return;
			incomingOrders=orders.orders.filter(order=>order.status==='pending'&&!order.voucherCode);
			incomingReviews=validatePendingReviews(reviews.pending);
			mailNotificationCount=calendar.notifications.length;
			incomingBookings=bookings;
			invoiceNotificationCount=window.adminAutoInvoices.renderNotifications(invoiceNotifications);
			updateIncomingNotifications();get('admin-notifications-status').textContent='';
			if(get('admin-notifications').open)acknowledgeBookings();
			if(!get('vouchers-section').hidden&&JSON.stringify(currentOrders)!==JSON.stringify(orders.orders)&&
				!adminMutations&&!get('order-list').dataset.liveDirty&&!get('order-list').contains(document.activeElement)){
				renderOrders(orders.orders);
			}
			if(!get('reviews-section').hidden&&reviewGeneration===reviewsGeneration&&!reviewModerating&&
				JSON.stringify(pendingReviews)!==JSON.stringify(incomingReviews)&&!get('reviews-pending').contains(document.activeElement)){
				pendingReviews=incomingReviews;pendingOffset=0;get('reviews-pending').replaceChildren();renderPending();
			}
			if(calendarGeneration===generation&&requestedMonth===month&&JSON.stringify(data)!==JSON.stringify(calendar)&&
				!get('calendar-day-events').contains(document.activeElement)){
				data=calendar;
				if(!get('calendar-section').hidden)render(true);
				renderMailNotifications();
			}
		}catch(error){
			if(adminAuthenticated&&session===adminSessionVersion)notificationFail(error);
		}finally{liveBusy=false;scheduleLive();}
	}
	document.addEventListener('admin-login',()=>{scheduleLive();setTimeout(refreshLive,0);});
	document.addEventListener('admin-data-changed',()=>{
		clearTimeout(liveTimer);if(adminAuthenticated)liveTimer=setTimeout(refreshLive,500);
	});
	document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(liveTimer);else refreshLive();});
	window.addEventListener('focus',refreshLive);
	let reviewsGeneration=0,reviewsLoaded=false,reviewsDirty=false,reviewModerating=false,reviewSaving=false;
	const updateReviewAdd=()=>{get('reviews-add').disabled=!reviewsLoaded||reviewSaving||reviewsEditor.children.length>=500;};
	const updateReviewDirty=()=>{reviewsDirty=get('review-create-editor').children.length>0||[...reviewsEditor.children].some(row=>row.dataset.dirty==='true'||row.dataset.published!=='true');};
	let pendingReviews=[],pendingOffset=0;
	const validatePendingReviews=value=>{
		if(!Array.isArray(value)||value.length>1000||!value.every(review=>review&&
			typeof review.id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(review.id)&&
			typeof review.name==='string'&&review.name.length<=80&&typeof review.anonymous==='boolean'&&
			Number.isInteger(review.rating)&&review.rating>=1&&review.rating<=5&&
			typeof review.review_text==='string'&&review.review_text.length>0&&review.review_text.length<=5000&&
			typeof review.submitted_at==='string'&&Number.isFinite(Date.parse(review.submitted_at))))
			throw new Error('Некорректный список отзывов на проверку.');
		return value;
	};
	const renderPending=()=>{
		const list=get('reviews-pending'),end=Math.min(pendingOffset+50,pendingReviews.length);
		for(const review of pendingReviews.slice(pendingOffset,end)){
			const card=document.createElement('article');card.className='contact-editor-row';
			const title=text('strong',review.anonymous?'Анонимно':review.name);card.append(title);
			const meta=text('p',`${review.rating} / 5 ★ · Написан: ${formatAdminDateTime(review.submitted_at)}`);card.append(meta);
			const body=text('p',review.review_text);body.style.whiteSpace='pre-wrap';card.append(body);
			const actions=document.createElement('div');actions.className='review-row-actions';
			for(const [action,label] of [['approve','Опубликовать отзыв'],['delete','Отклонить отзыв']]){
				const button=text('button',label);button.type='button';
				button.addEventListener('click',async()=>{
					if(reviewModerating||reviewSaving)return;
					if(action==='delete'&&!confirm('Отклонить отзыв? Заявка будет удалена и не появится на сайте.'))return;
					const current=reviewsGeneration;reviewModerating=true;
					const buttons=[...get('reviews-pending').querySelectorAll('button')];buttons.forEach(item=>{item.disabled=true;});
					get('reviews-pending-status').textContent=action==='approve'?'Публикуем отзыв на сайте...':'Отклоняем отзыв...';
					try{
						const result=await adminRequest('/api/admin/site-reviews',{method:'POST',headers:{'Content-Type':'application/json'},
							body:JSON.stringify({action,id:review.id})});
						if(current!==reviewsGeneration)return;
						if(result.ok!==true)throw new Error('Сервер не подтвердил обработку отзыва.');
						if(action==='approve'){
							const published=window.siteReviews.validate(result.reviews).find(item=>item.id===review.id);
							if(!published)throw new Error('Опубликованный отзыв не найден в ответе.');
							reviewRow(published,review.submitted_at,true,published);
						}
						card.remove();pendingReviews=pendingReviews.filter(item=>item.id!==review.id);
						pendingOffset=Math.max(0,pendingOffset-1);
						renumberReviews();updateReviewDirty();
						if(reviewsLoaded)get('reviews-pending-status').textContent=action==='approve'?'Отзыв опубликован на сайте.':'Отзыв отклонен и удален из заявок. На сайт он не опубликован.';
					}catch(error){if(current===reviewsGeneration)get('reviews-pending-status').textContent=error.message;}
					finally{reviewModerating=false;buttons.forEach(item=>{item.disabled=false;});}
				});
				actions.append(button);
			}
			card.append(actions);
			list.append(card);
		}
		pendingOffset=end;get('reviews-pending-more').hidden=pendingOffset>=pendingReviews.length;
		if(!pendingReviews.length)get('reviews-pending-status').textContent='Новых отзывов на проверку нет.';
		else if(pendingOffset>=pendingReviews.length)get('reviews-pending-status').textContent=`Ожидают проверки: ${pendingReviews.length}.`;
	};
	get('reviews-pending-more').addEventListener('click',renderPending);
	const renumberReviews=()=>{
		let publishedPosition=0;
		const publishedCount=[...reviewsEditor.children].filter(row=>row.dataset.published==='true').length;
		[...reviewsEditor.children].forEach((row,index)=>{
			const position=row.querySelector('[data-review-position]');
			if(row.dataset.published==='true')publishedPosition++;
			if(row.dataset.positionDirty!=='true')position.value=String(row.dataset.published==='true'?publishedPosition:Math.min(index+1,publishedCount+1));
			position.max=String(publishedCount+(row.dataset.published==='true'?0:1));
		});
	};
	reviewsForm.addEventListener('submit',event=>event.preventDefault());
	function reviewRow(review={id:crypto.randomUUID(),name:'',text:'',rating:5,topic:'',example:false},writtenAt=null,published=false,original=null,container=reviewsEditor,onPublished=null){
		const row=document.createElement('div');row.className='contact-editor-row';row.dataset.id=review.id;
		row.dataset.published=String(published);
		row.addEventListener('input',()=>{row.dataset.dirty='true';updateReviewDirty();});
		row.append(text('p',writtenAt?`Написан: ${formatAdminDateTime(writtenAt)}`:'Дата написания неизвестна'));
		const field=(title,input)=>{const label=text('label',title);label.append(input);row.append(label);};
		const position=document.createElement('input');position.type='number';position.min='1';position.step='1';position.required=true;
		position.dataset.reviewPosition='';field('Позиция на сайте',position);
		position.addEventListener('change',()=>{
			if(!position.reportValidity())return;
			row.dataset.dirty='true';row.dataset.positionDirty='true';updateReviewDirty();
			get('reviews-status').textContent='Новая позиция применится кнопкой сохранения в этой карточке.';
		});
		for(const [key,title,max] of [['name','Имя автора',80],['text','Текст отзыва',5000]]){
			const input=document.createElement(key==='text'?'textarea':'input');input.dataset.field=key;
			input.value=review[key];input.maxLength=max;input.required=key!=='topic';if(key==='text')input.rows=5;
			field(title,input);
		}
		let anonymousLabel=null;
		if(onPublished){
			const name=row.querySelector('[data-field="name"]');
			const anonymous=document.createElement('input');anonymous.type='checkbox';
			anonymousLabel=text('label','');anonymousLabel.className='contact-editor-toggle';
			anonymousLabel.append(anonymous,text('span','Анонимно'));
			row.insertBefore(anonymousLabel,row.querySelector('[data-field="text"]').parentElement);
			let authorName=name.value;
			anonymous.addEventListener('change',()=>{
				if(anonymous.checked){authorName=name.value;name.value='Анонимно';}
				else name.value=authorName;
				name.readOnly=anonymous.checked;name.required=!anonymous.checked;
				row.dataset.dirty='true';updateReviewDirty();
			});
		}
		const rating=document.createElement('select');rating.dataset.field='rating';
		for(let value=1;value<=5;value++){const option=text('option',`${value} / 5 ${'★'.repeat(value)}`);option.value=String(value);rating.append(option);}
		rating.value=String(review.rating);field('Рейтинг',rating);
		const remove=text('button',onPublished?'Отменить':'Удалить отзыв');remove.type='button';remove.className='review-delete-button';
		const save=text('button',published?'Сохранить изменения':'Опубликовать отзыв');save.type='button';
		const edit=text('button','Изменить');edit.type='button';
		const restore=text('button','Вернуться к оригиналу');restore.type='button';restore.hidden=!published;
		const cancel=text('button','Отменить');cancel.type='button';
		const status=text('p','');status.setAttribute('role','status');
		const actions=document.createElement('div');actions.className='review-row-actions';actions.append(save,remove);
		actions.append(edit,restore,cancel);
		const setLocked=locked=>{
			row.dataset.locked=String(locked);
			for(const input of row.querySelectorAll('input,textarea,select'))input.disabled=locked;
			edit.hidden=!locked;save.hidden=locked;
			cancel.hidden=locked||row.dataset.published!=='true';
		};
		cancel.addEventListener('click',()=>{
			if(reviewSaving||reviewModerating||row.dataset.published!=='true')return;
			for(const input of row.querySelectorAll('[data-field]'))input.value=String(review[input.dataset.field]);
			row.dataset.dirty='false';row.dataset.positionDirty='false';
			renumberReviews();updateReviewDirty();setLocked(true);
			status.textContent='Изменения отменены. Отзыв заблокирован.';
		});
		edit.addEventListener('click',()=>{
			if(reviewSaving||reviewModerating)return;
			setLocked(false);status.textContent='Редактирование открыто. Изменения появятся на сайте после сохранения.';
		});
		restore.addEventListener('click',()=>{
			if(reviewSaving||reviewModerating)return;
			if(!original){status.textContent='Оригинал не загружен. Обновите список отзывов.';return;}
			if(!confirm('Вернуть исходные имя, текст и рейтинг? Несохраненные правки этой карточки будут заменены.'))return;
			setLocked(false);
			for(const input of row.querySelectorAll('[data-field]'))input.value=String(original[input.dataset.field]);
			row.dataset.dirty='true';updateReviewDirty();
			status.textContent='Оригинал восстановлен в редакторе. Нажмите «Сохранить изменения», чтобы вернуть его на сайт.';
		});
		const mutate=async deleting=>{
			if(reviewSaving||reviewModerating)return;
			if(!deleting&&row.dataset.locked==='true')return;
			if(deleting&&onPublished){get('review-create-close').click();return;}
			if(deleting&&!confirm(row.dataset.published==='true'?'Удалить этот отзыв с сайта?':'Удалить этот неопубликованный отзыв?'))return;
			if(deleting&&row.dataset.published!=='true'){
				row.remove();renumberReviews();updateReviewDirty();updateReviewAdd();return;
			}
			let content;
			if(!deleting){
				if(![...row.querySelectorAll('input,textarea,select')].every(input=>input.reportValidity()))return;
				try{
					content=window.siteReviews.validate([{...review,...Object.fromEntries([...row.querySelectorAll('[data-field]')].map(input=>
						[input.dataset.field,input.dataset.field==='rating'?Number(input.value):input.value.replace(/\s+/g,' ').trim()]))}])[0];
				}catch(error){status.textContent=error.message;return;}
			}
			const current=reviewsGeneration;reviewSaving=true;updateReviewAdd();
			const controls=[...reviewsForm.querySelectorAll('input,textarea,select,button')];controls.forEach(input=>{input.disabled=true;});
			status.textContent=deleting?'Удаляем отзыв...':'Сохраняем отзыв...';
			try{
				const result=await adminRequest('/api/admin/site-reviews',{method:'POST',headers:{'Content-Type':'application/json'},
					body:JSON.stringify({action:deleting?'remove':row.dataset.published==='true'?'update':'create',id:review.id,
						...(!deleting?{review:content,position:Number(position.value)}:{})})});
				if(current!==reviewsGeneration)return;
				if(result.ok!==true)throw new Error('Сервер не подтвердил сохранение отзыва.');
				const saved=window.siteReviews.validate(result.reviews);
				if(deleting)row.remove();
				else{
					const savedIndex=saved.findIndex(item=>item.id===review.id);
					if(savedIndex<0)throw new Error('Сохраненный отзыв не найден в ответе.');
					if(!original)original={...content};
					review=content;row.dataset.published='true';row.dataset.dirty='false';row.dataset.positionDirty='false';save.textContent='Сохранить изменения';
					restore.hidden=false;setLocked(true);
					status.textContent='Отзыв сохранен и опубликован.';
					const others=[...reviewsEditor.children].filter(item=>item!==row&&item.dataset.published==='true');
					reviewsEditor.insertBefore(row,others[savedIndex]||null);
					if(onPublished){
						anonymousLabel.remove();row.querySelector('[data-field="name"]').readOnly=false;
						row.querySelector('[data-field="name"]').required=true;
						onPublished();onPublished=null;remove.textContent='Удалить отзыв';
					}
				}
				for(const item of reviewsEditor.children){
					const field=item.querySelector('[data-review-position]');
					field.max=String(saved.length+(item.dataset.published==='true'?0:1));
					const index=saved.findIndex(savedReview=>savedReview.id===item.dataset.id);
					if(item===row||item.dataset.positionDirty!=='true')field.value=String(index<0?saved.length+1:index+1);
				}
				updateReviewDirty();get('reviews-status').textContent=deleting?'Отзыв удален с сайта.':'Изменения этого отзыва опубликованы.';
			}catch(error){if(current===reviewsGeneration)status.textContent=error.message;}
			finally{
				if(current===reviewsGeneration){
					reviewSaving=false;controls.forEach(input=>{input.disabled=false;});
					for(const item of reviewsEditor.children){
						for(const input of item.querySelectorAll('input,textarea,select'))input.disabled=item.dataset.locked==='true';
					}
					updateReviewAdd();
				}
			}
		};
		save.addEventListener('click',()=>mutate(false));remove.addEventListener('click',()=>mutate(true));
		setLocked(published);
		row.append(actions,status);container.append(row);renumberReviews();
		if(container!==reviewsEditor){
			position.value=String(reviewsEditor.children.length+1);position.max=position.value;
		}
		updateReviewDirty();updateReviewAdd();
	}
	async function loadReviews(){
		const current=++reviewsGeneration;reviewsLoaded=false;updateReviewAdd();
		pendingReviews=[];pendingOffset=0;get('reviews-pending').replaceChildren();
		get('reviews-pending-status').textContent='Загружаем отзывы на проверку...';
		get('reviews-status').textContent='Загружаем отзывы...';
		try{
			const result=await adminRequest('/api/admin/site-reviews');
			if(current!==reviewsGeneration)return;
			const reviews=window.siteReviews.validate(result.reviews);
			const originals=new Map(window.siteReviews.validate(result.originals).map(review=>[review.id,review]));
			if(reviews.some(review=>!originals.has(review.id)))throw new Error('Не удалось загрузить оригиналы отзывов.');
			pendingReviews=validatePendingReviews(result.pending);
			pendingOffset=0;get('reviews-pending').replaceChildren();renderPending();
			reviewsEditor.replaceChildren();reviewsLoaded=true;
			const dates=new Map((result.dates||[]).map(item=>[item.id,item.written_at]));
			for(const review of reviews)reviewRow(review,dates.get(review.id),true,originals.get(review.id));
			reviewsDirty=false;updateReviewAdd();get('reviews-status').textContent='';
		}catch(error){if(current===reviewsGeneration){
			get('reviews-status').textContent=error.message;get('reviews-pending-status').textContent=error.message;
		}}
	}
	const reviewCreateDialog=get('review-create-dialog'),reviewCreateEditor=get('review-create-editor');
	const closeReviewCreate=()=>{
		if(reviewSaving)return;
		if(reviewCreateEditor.children.length&&!confirm('Закрыть окно? Неопубликованный отзыв будет удален из редактора.'))return;
		reviewCreateDialog.close();reviewCreateEditor.replaceChildren();updateReviewDirty();
	};
	get('review-create-close').addEventListener('click',closeReviewCreate);
	reviewCreateDialog.addEventListener('cancel',event=>{event.preventDefault();closeReviewCreate();});
	get('reviews-add').addEventListener('click',()=>{
		if(!reviewsLoaded||reviewSaving||reviewModerating||reviewsEditor.children.length>=500)return;
		reviewCreateEditor.replaceChildren();
		reviewRow(undefined,null,false,null,reviewCreateEditor,()=>reviewCreateDialog.close());
		reviewCreateDialog.showModal();
	});
	document.addEventListener('admin-login',()=>{if(!get('reviews-section').hidden)loadReviews();});
	document.addEventListener('admin-logout',()=>{
		reviewsGeneration++;reviewsLoaded=false;reviewsDirty=false;reviewSaving=false;reviewsEditor.replaceChildren();get('reviews-status').textContent='';
		reviewCreateDialog.close();reviewCreateEditor.replaceChildren();
		pendingReviews=[];pendingOffset=0;get('reviews-pending').replaceChildren();get('reviews-pending-status').textContent='';
		get('reviews-pending-more').hidden=true;
		updateReviewAdd();
	});
	const contactsForm=get('contacts-form'),contactList=get('contacts-links');
	let contactsGeneration=0,contactsLoaded=false,contactSaving=false,contactSettings=null;
	const updateContactAdd=()=>{get('contacts-add').disabled=!contactsLoaded||contactSaving||contactList.children.length>=12;};
	const renumberContacts=()=>{
		const savedCount=[...contactList.children].filter(row=>row.dataset.index).length;
		let savedPosition=0;
		[...contactList.children].forEach((row,index)=>{
			const position=row.querySelector('[data-contact-position]');
			if(row.dataset.index)savedPosition++;
			if(row.dataset.positionDirty!=='true')position.value=String(row.dataset.index?savedPosition:Math.min(index+1,savedCount+1));
			position.max=String(savedCount+(row.dataset.index?0:1));
		});
	};
	function contactRow(link={type:'website',label:'',url:'',enabled:true},savedIndex=null){
		const row=document.createElement('div');row.className='contact-editor-row';
		if(savedIndex!==null)row.dataset.index=String(savedIndex);
		const field=(title,input)=>{const label=text('label',title);label.append(input);row.append(label);return input;};
		const position=document.createElement('input');position.type='number';position.min='1';position.step='1';position.required=true;
		position.dataset.contactPosition='';field('Позиция на сайте (1 — первая слева)',position);
		position.addEventListener('change',()=>{
			if(!position.reportValidity())return;
			row.dataset.positionDirty='true';
			get('contacts-status').textContent='Позиция применится при сохранении этой карточки.';
		});
		const type=document.createElement('select');type.dataset.field='type';
		for(const [key,title] of Object.entries(window.siteContacts.types)){const option=text('option',title);option.value=key;type.append(option);}
		type.value=link.type;field('Соцсеть / тип кнопки',type);
		for(const [key,title,max] of [['label','Название кнопки',60],['url','Ссылка',500]]){
			const input=document.createElement('input');input.dataset.field=key;input.value=link[key];input.maxLength=max;input.required=true;
			input.placeholder=key==='url'?'https://example.ee, mailto:email@example.ee или tel:+372...':'Название';
			field(title,input);
		}
		const enabled=document.createElement('input');enabled.type='checkbox';enabled.dataset.field='enabled';enabled.checked=link.enabled;
		field('Показывать кнопку на сайте',enabled).parentElement.className='contact-editor-toggle';
		const save=text('button','Сохранить изменения');save.type='button';
		const remove=text('button','Удалить кнопку');remove.type='button';
		const actions=document.createElement('div');actions.className='review-row-actions';actions.append(save,remove);
		const status=text('p','');status.setAttribute('role','status');row.append(actions,status);
		const edit=text('button','Изменить');edit.type='button';
		const cancel=text('button','Отмена');cancel.type='button';actions.append(edit,cancel);
		const setLocked=locked=>{
			row.dataset.locked=String(locked);
			for(const input of row.querySelectorAll('input,select'))input.disabled=locked;
			edit.hidden=!locked;save.hidden=locked;cancel.hidden=locked;
		};
		edit.addEventListener('click',()=>{
			if(contactSaving)return;
			setLocked(false);status.textContent='Редактирование открыто.';
		});
		cancel.addEventListener('click',()=>{
			if(contactSaving)return;
			if(!row.dataset.index){row.remove();renumberContacts();updateContactAdd();return;}
			for(const input of row.querySelectorAll('[data-field]')){
				if(input.type==='checkbox')input.checked=link[input.dataset.field];
				else input.value=link[input.dataset.field];
			}
			row.dataset.positionDirty='false';renumberContacts();setLocked(true);
			status.textContent='Изменения отменены. Контакт заблокирован.';
		});
		const mutate=async deleting=>{
			if(!contactsLoaded||contactSaving)return;
			if(!deleting&&row.dataset.locked==='true')return;
			if(deleting&&!confirm(row.dataset.index?'Удалить этот контакт с сайта?':'Удалить неопубликованный контакт?'))return;
			if(deleting&&!row.dataset.index){row.remove();renumberContacts();updateContactAdd();return;}
			let content;
			if(!deleting){
				if(![...row.querySelectorAll('input,select')].every(input=>input.reportValidity()))return;
				try{
					content=window.siteContacts.validate({footer:contactSettings.footer,
						links:[Object.fromEntries([...row.querySelectorAll('[data-field]')].map(input=>
							[input.dataset.field,input.type==='checkbox'?input.checked:input.value.trim()]))]}).links[0];
				}catch(error){status.textContent=error.message;return;}
			}
			const current=contactsGeneration,oldIndex=row.dataset.index?Number(row.dataset.index):null;
			const target=Number(position.value),order=[...contactList.children].filter(item=>item.dataset.index)
				.sort((a,b)=>Number(a.dataset.index)-Number(b.dataset.index)).filter(item=>item!==row);
			if(!deleting)order.splice(target-1,0,row);
			contactSaving=true;updateContactAdd();
			const controls=[...contactsForm.querySelectorAll('input,select,button')];controls.forEach(input=>{input.disabled=true;});
			status.textContent=deleting?'Удаляем контакт...':'Сохраняем контакт...';
			try{
				const result=await adminRequest('/api/admin/site-contacts',{method:'POST',headers:{'Content-Type':'application/json'},
					body:JSON.stringify({action:deleting?'remove':oldIndex===null?'create':'update',
						expectedLinks:contactSettings.links,...(oldIndex===null?{}:{index:oldIndex}),
						...(deleting?{}:{link:content,position:target})})});
				if(current!==contactsGeneration)return;
				if(result.ok!==true)throw new Error('Сервер не подтвердил сохранение контакта.');
				const settings=window.siteContacts.validate(result.settings);
				if(settings.links.length!==order.length)throw new Error('Некорректный список контактов в ответе.');
				contactSettings=settings;
				order.forEach((item,index)=>{item.dataset.index=String(index+1);});
				if(deleting)row.remove();
				else{
					link={...content};setLocked(true);
					row.dataset.positionDirty='false';
					contactList.insertBefore(row,order[target]||null);
					status.textContent='Контакт сохранен.';
				}
				renumberContacts();get('contacts-status').textContent=deleting?'Контакт удален с сайта.':'Изменения этого контакта сохранены. PDF-счета не изменены.';
			}catch(error){if(current===contactsGeneration)status.textContent=error.message;}
			finally{if(current===contactsGeneration){
				contactSaving=false;controls.forEach(input=>{input.disabled=false;});
				for(const item of contactList.children){
					for(const input of item.querySelectorAll('input,select'))input.disabled=item.dataset.locked==='true';
				}
				updateContactAdd();
			}}
		};
		save.addEventListener('click',()=>mutate(false));remove.addEventListener('click',()=>mutate(true));
		setLocked(savedIndex!==null);
		contactList.append(row);renumberContacts();updateContactAdd();
	}
	async function loadContacts(){
		const current=++contactsGeneration;contactsLoaded=false;
		updateContactAdd();
		get('contacts-status').textContent='Загружаем контакты...';
		try{
			const result=await adminRequest('/api/admin/site-contacts');
			if(current!==contactsGeneration)return;
			const settings=window.siteContacts.validate(result.settings);
			contactSettings=settings;contactList.replaceChildren();contactsLoaded=true;
			settings.links.forEach((link,index)=>contactRow(link,index+1));
			updateContactAdd();get('contacts-status').textContent='';
		}catch(error){if(current===contactsGeneration)get('contacts-status').textContent=error.message;}
	}
	get('contacts-add').addEventListener('click',()=>{if(contactsLoaded&&!contactSaving&&contactList.children.length<12)contactRow();});
	contactsForm.addEventListener('submit',event=>event.preventDefault());
	document.addEventListener('admin-login',()=>{if(!get('contacts-section').hidden)loadContacts();});
	document.addEventListener('admin-logout',()=>{
		contactsGeneration++;contactsLoaded=false;contactsForm.reset();contactList.replaceChildren();get('contacts-status').textContent='';
		contactSaving=false;contactSettings=null;updateContactAdd();
	});
	const textsForm=get('texts-form');
	const textLabels={hero_eyebrow:'Верхняя подпись: Психолог · КПТ-подход · Онлайн',
		hero_title_first:'Заголовок: первая строка',hero_title_second:'Заголовок: вторая строка',
		hero_title_accent:'Заголовок: выделенная часть (курсив)',hero_intro:'Описание под заголовком',
		hero_button:'Кнопка: Записаться на консультацию',
		hero_benefit_online:'Преимущество: Консультации из любой точки',
		hero_benefit_individual:'Преимущество: Индивидуальная работа',
		hero_benefit_privacy:'Преимущество: Безопасность и конфиденциальность',
		about_label:'Название блока (шапка, подвал и страница)',
		about_title:'Заголовок: Опыт и образование',about_body:'Текст под заголовком: Меня зовут...',
		about_sharing:'Абзац: Мне хочется делиться...',about_parent:'Абзац: Есть выражение...',
		about_potential:'Абзац: Я верю...',approach_title:'Подзаголовок: Мой подход',approach_body:'Текст под подзаголовком: В своей практике...',
		approach_changes:'Абзац: Когда привычные способы...',approach_result:'Абзац: И как результат...',
		about_button:'Кнопка: Узнать больше',
		services_label:'Название блока (шапка, подвал и страница)',services_title:'Заголовок: С чем я работаю',
		services_intro:'Текст под заголовком',
		service_anxiety_title:'Карточка 1: Тревожность - название',service_anxiety_body:'Карточка 1: Тревожность - описание',
		service_relationships_title:'Карточка 2: Отношения - название',service_relationships_body:'Карточка 2: Отношения - описание',
		service_selfesteem_title:'Карточка 3: Самооценка - название',service_selfesteem_body:'Карточка 3: Самооценка - описание',
		service_burnout_title:'Карточка 4: Эмоциональное выгорание - название',service_burnout_body:'Карточка 4: Эмоциональное выгорание - описание',
		service_boundaries_title:'Карточка 5: Личные границы - название',service_boundaries_body:'Карточка 5: Личные границы - описание',
		service_awareness_title:'Карточка 6: Осознанность - название',service_awareness_body:'Карточка 6: Осознанность - описание',
		format_label:'Название блока (шапка, подвал и страница)',format_title:'Заголовок: Как проходят консультации',
		format_intro:'Текст под заголовком',format_online_title:'Онлайн - название',format_online_body:'Онлайн - описание',
		format_duration_title:'Продолжительность - название',format_duration_body:'Продолжительность - описание',
		format_booking_title:'Запись - название',format_booking_body:'Запись - описание',
		format_science_title:'Научный подход - название',format_science_body:'Научный подход - описание',
		format_quote:'Цитата',format_quote_author:'Автор цитаты',
		pricing_label:'Название блока (шапка, подвал и страница)',pricing_title:'Заголовок: Пакеты консультаций',
		pricing_intro:'Текст под заголовком',
		free_title:'Первая консультация - название',free_description:'Первая консультация - описание',free_button:'Первая консультация - кнопка записи',
		single_title:'Индивидуальная консультация - название',single_description:'Индивидуальная консультация - описание',single_button:'Индивидуальная консультация - кнопка записи',
		five_title:'Пакет из 5 консультаций - название',five_description:'Пакет из 5 консультаций - описание',
		five_button:'Пакет из 5 консультаций - кнопка записи',five_buy_button:'Пакет из 5 консультаций - кнопка покупки',
		ten_title:'Пакет из 10 консультаций - название',ten_description:'Пакет из 10 консультаций - описание',
		ten_button:'Пакет из 10 консультаций - кнопка записи',ten_buy_button:'Пакет из 10 консультаций - кнопка покупки',
		reviews_label:'Название блока (шапка, подвал и страница)',reviews_title:'Заголовок: Отзывы клиентов',
		reviews_button:'Кнопка: Написать отзыв',review_modal_title:'Окно отзыва: заголовок',review_modal_note:'Окно отзыва: текст под заголовком',
		review_name_label:'Имя - подпись поля',review_name_placeholder:'Имя - подсказка в поле',
		review_anonymous_label:'Подпись выбора анонимности',review_rating_label:'Подпись оценки',
		review_text_label:'Текст отзыва - подпись поля',review_text_placeholder:'Текст отзыва - подсказка в поле',
		review_submit:'Кнопка отправки',review_close:'Название кнопки закрытия для озвучивания',
		reviews_empty:'Текст, когда отзывов нет',review_sending:'Сообщение во время отправки',review_success:'Текст в окне благодарности после отправки',
		contact_label:'Название блока (шапка, подвал и страница)',contact_title:'Заголовок: Вопросы и запись',
		contact_body:'Текст под заголовком',contact_social_title:'Текст 2: Записаться на консультацию',
		header_name:'Имя возле логотипа',header_tagline:'Подпись возле логотипа',header_button:'Текст кнопки записи',
		footer_name:'Имя в подвале',footer_tagline:'Подпись: психолог, кпт-подход',
		footer_description:'Описание под именем (Enter - перенос строки)',footer_navigation:'Заголовок: Навигация',
		footer_details_title:'Заголовок: Реквизиты и контакты',footer_company:'Название фирмы',
		footer_registration:'Регистрационный код',footer_phone:'Телефон подвала',footer_email:'Email подвала',
		footer_copyright:'Нижняя строка: имя, год и права'};
	for(const [key,title] of Object.entries(textLabels)){
		const max=window.siteTexts.fields[key],label=text('label',title);
		const input=document.createElement(key.startsWith('header_')||key.startsWith('footer_')&&key!=='footer_description'||!key.startsWith('service_')&&(!key.startsWith('format_')||key==='format_label'||key==='format_quote_author')&&(key.endsWith('_title')||key.endsWith('_label')||key.endsWith('_button')||['format_quote_author','hero_eyebrow','hero_title_first','hero_title_second'].includes(key))?'input':'textarea');
		input.name=key;input.maxLength=max;input.required=true;
		if(key==='footer_email')input.type='email';
		if(key==='footer_phone')input.type='tel';
		if(input.tagName==='TEXTAREA')input.rows=key.startsWith('service_')?key.endsWith('_title')?2:3:key.endsWith('_description')?3:5;
		label.append(input);
		get(key.startsWith('header_')?'texts-header-fields':key.startsWith('footer_')?'texts-footer-fields':key.startsWith('contact_')?'texts-contact-fields':/^(review|reviews)_/.test(key)?'texts-reviews-fields':key.startsWith('hero_')?'texts-hero-fields':key.startsWith('format_')?'texts-format-fields':key.startsWith('service_')||key.startsWith('services_')?'texts-services-fields':/^(pricing|free|single|five|ten)_/.test(key)?'texts-package-fields':'texts-about-fields').append(label);
	}
	const textSections=window.adminTextSections.mount(Object.keys(textLabels));
	const loadTexts=()=>textSections.load();
	document.addEventListener('admin-login',()=>{if(!get('texts-section').hidden)loadTexts();});
	const loadInvoiceSettings=()=>window.adminInvoices.load();
	const pricesForm=get('prices-form');
	let pricesGeneration=0;
	let savedPrices=null,pricesBusy=false;
	const editingPrices=new Set();
	function priceControls(){
		for(const key of window.servicePricing.keys){
			const editing=editingPrices.has(key),field=pricesForm.elements.namedItem(key),card=field.closest('article');
			field.disabled=!savedPrices||!editing||pricesBusy;card.dataset.locked=String(!editing);
			const edit=get(`prices-${key}-edit`),cancel=get(`prices-${key}-cancel`),save=card.querySelector('[type="submit"]');
			edit.hidden=editing;edit.disabled=!savedPrices||pricesBusy;
			cancel.hidden=!editing;cancel.disabled=pricesBusy;
			save.hidden=!editing;save.disabled=!savedPrices||pricesBusy;
		}
	}
	const readPrices=()=>Object.fromEntries(window.servicePricing.keys.map(key=>[key,Math.round(Number(pricesForm.elements.namedItem(key).value)*100)]));
	const calculatePrices=()=>{
		if(![...pricesForm.querySelectorAll('input')].every(input=>input.validity.valid))return;
		const prices=readPrices();
		for(const key of ['five','ten']){
			const metric=window.servicePricing.metrics(prices,key);
			get(`prices-${key}`).textContent=`Одна встреча: ${metric.rate}. Экономия: ${window.servicePricing.money(metric.saving)}.`;
		}
	};
	async function loadPrices(){
		const current=++pricesGeneration;
		savedPrices=null;editingPrices.clear();pricesBusy=false;priceControls();
		get('prices-status').textContent='Загружаем цены...';
		try{
			const result=await adminRequest('/api/admin/prices');
			if(current!==pricesGeneration)return;
			const prices=window.servicePricing.validate(result.prices);
			savedPrices=prices;
			for(const key of window.servicePricing.keys)pricesForm.elements.namedItem(key).value=(prices[key]/100).toFixed(2);
			calculatePrices();get('prices-status').textContent='';
			priceControls();
		}catch(error){if(current===pricesGeneration)get('prices-status').textContent=error.message;}
	}
	document.addEventListener('admin-login',()=>{if(!get('prices-section').hidden)loadPrices();});
	for(const key of window.servicePricing.keys){
	get(`prices-${key}-edit`).addEventListener('click',()=>{
		if(!savedPrices||pricesBusy)return;
		editingPrices.add(key);get(`prices-${key}-status`).textContent='';priceControls();
		pricesForm.elements.namedItem(key).focus();
	});
	get(`prices-${key}-cancel`).addEventListener('click',()=>{
		if(!savedPrices||pricesBusy)return;
		pricesForm.elements.namedItem(key).value=(savedPrices[key]/100).toFixed(2);
		editingPrices.delete(key);priceControls();calculatePrices();get(`prices-${key}-status`).textContent='';
	});
	}
	pricesForm.addEventListener('input',calculatePrices);
	pricesForm.addEventListener('submit',async event=>{
		event.preventDefault();
		const key=event.submitter?.dataset.price;
		if(!savedPrices||!editingPrices.has(key)||pricesBusy)return;
		const field=pricesForm.elements.namedItem(key);
		if(!field.reportValidity())return;
		const cents=Math.round(Number(field.value)*100),status=get(`prices-${key}-status`);
		pricesBusy=true;priceControls();
		const current=pricesGeneration;
		try{
			const result=await adminRequest('/api/admin/prices',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,cents})});
			if(result.ok!==true)throw new Error('Сервер не подтвердил сохранение цен.');
			if(current===pricesGeneration){
				savedPrices={...savedPrices,[key]:cents};editingPrices.delete(key);field.value=(cents/100).toFixed(2);
				document.dispatchEvent(new CustomEvent('admin-prices-changed',{detail:{...savedPrices}}));
				status.textContent='Цена сохранена. Применяется к новым заказам и счетам.';
			}
		}catch(error){if(current===pricesGeneration)status.textContent=error.message;}
		finally{if(current===pricesGeneration){pricesBusy=false;priceControls();}}
	});
	document.addEventListener('admin-logout',()=>{
		pricesGeneration++;savedPrices=null;editingPrices.clear();pricesBusy=false;pricesForm.reset();get('prices-status').textContent='';
		for(const key of window.servicePricing.keys)get(`prices-${key}-status`).textContent='';
		get('prices-five').textContent='';get('prices-ten').textContent='';
		priceControls();
	});
	adminForm.addEventListener('submit',()=>{
		if(!get('calendar-section').hidden)load().catch(fail);
		else if(!get('prices-section').hidden)loadPrices();
		else if(!get('invoices-section').hidden)loadInvoiceSettings();
		else if(!get('texts-section').hidden)loadTexts();
		else if(!get('contacts-section').hidden)loadContacts();
		else if(!get('reviews-section').hidden)loadReviews();
	});
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
