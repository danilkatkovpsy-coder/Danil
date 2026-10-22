(() => {
	const get=id=>document.getElementById(id),panel=get('booking-email-panel'),form=get('calendar-link-email-form');
	const tabs=[get('booking-email-tab-confirmation'),get('booking-email-tab-link')];
	const tabPanels=[get('booking-email-confirmation-panel'),get('booking-email-link-panel')];
	const source=get('calendar-link-email-source'),fields=['subject','body','signature'];
	const localOriginal={subject:'Ссылка на консультацию',body:'Здравствуйте!\n\nНаша консультация скоро начнется. Подключиться можно по ссылке:\n\n{{meeting_link}}\n\n**Данные для входа:**\n\n- Номер конференции: {{meeting_id}}\n- Пароль: {{meeting_password}}\n\nДо встречи!',signature:'Данил Катков'};
	let generation=0,previewGeneration=0,loaded=false,loading=false,busy=false,backendAvailable=true,settings=null,selected='original',timer;
	const message=value=>{get('calendar-link-email-status').textContent=value;};
	const read=()=>Object.fromEntries(fields.map(key=>[key,get(`calendar-link-email-${key}`).value]));
	function controls(){
		form.querySelectorAll('input,button,select,textarea').forEach(element=>{element.disabled=!loaded||busy;});
		source.disabled=!loaded||busy||!backendAvailable;
		get('calendar-link-email-restore').disabled=!loaded||busy||!backendAvailable;
		get('calendar-link-email-save').disabled=!loaded||busy||!backendAvailable;
		const editable=loaded&&!busy&&backendAvailable&&selected==='custom';
		fields.forEach(key=>{get(`calendar-link-email-${key}`).disabled=!editable;});
	}
	function selectTab(index){
		tabs.forEach((tab,position)=>{
			tab.setAttribute('aria-selected',String(position===index));tab.tabIndex=position===index?0:-1;
			tabPanels[position].hidden=position!==index;
		});
		if(index===1&&panel.open)load();
	}
	function localPreview(template){
		const container=get('calendar-link-email-preview');container.replaceChildren();
		const link='https://zoom.us/j/123456789?pwd=example';
		const values={name:'Пример клиента',start:'23 октября 2026 г. в 19:00',end:'19:50',meeting_link:link,meeting_id:'123 456 789',meeting_password:'example-pass'};
		const substitute=value=>value.replace(/\{\{(name|start|end|meeting_link|meeting_id|meeting_password)\}\}/g,(_,key)=>values[key]);
		const inline=(parent,value)=>{
			const plain=value.replaceAll('**','');
			const linkMatch=/^\[([^\]]+)\]\((https:\/\/[^)]+)\)$/.exec(plain);
			const visibleUrl=/^https:\/\/[^\s]+$/.test(plain);
			if(linkMatch||visibleUrl){
				const anchor=document.createElement('a');anchor.href=linkMatch?linkMatch[2]:plain;anchor.textContent=linkMatch?linkMatch[1]:plain;
				anchor.tabIndex=-1;anchor.addEventListener('click',event=>event.preventDefault());parent.append(anchor);return;
			}
			parent.append(document.createTextNode(plain));
		};
		for(const line of template.body.split(/\r?\n/)){
			if(!line){const gap=document.createElement('div');gap.style.height='12px';container.append(gap);continue;}
			const listItem=/^\s*-\s+/.test(line);
			const paragraph=document.createElement(listItem?'div':'p');paragraph.style.margin='0 0 8px';
			inline(paragraph,listItem?`• ${substitute(line.replace(/^\s*-\s+/,''))}`:substitute(line));container.append(paragraph);
		}
		const signature=document.createElement('p');signature.style.margin='24px 0 0';signature.textContent=template.signature;container.append(signature);
		get('calendar-link-email-preview-subject').textContent=template.subject;
		get('calendar-link-email-preview-status').textContent='';
	}
	async function preview(){
		clearTimeout(timer);const current=++previewGeneration,session=generation,template=read();
		get('calendar-link-email-preview-subject').textContent='';get('calendar-link-email-preview').replaceChildren();
		if(!backendAvailable){localPreview(template);return;}
		get('calendar-link-email-preview-status').textContent='Подготавливаем предпросмотр...';
		timer=setTimeout(async()=>{
			try{
				const result=await adminRequest('/api/admin/calendar-link-email/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({template})});
				if(current!==previewGeneration||session!==generation)return;
				if(result.ok!==true||typeof result.html!=='string'||typeof result.subject!=='string')throw new Error('Не удалось подготовить предпросмотр.');
				get('calendar-link-email-preview-subject').textContent=result.subject;
				get('calendar-link-email-preview').innerHTML=result.html;
				get('calendar-link-email-preview').querySelectorAll('a').forEach(link=>{link.tabIndex=-1;link.addEventListener('click',event=>event.preventDefault());});
				get('calendar-link-email-preview-status').textContent='';
			}catch(error){if(current===previewGeneration&&session===generation)get('calendar-link-email-preview-status').textContent=error.message;}
		},250);
	}
	function show(template){
		fields.forEach(key=>{get(`calendar-link-email-${key}`).value=template[key];});
		controls();preview();
	}
	source.addEventListener('change',()=>{
		if(!loaded||busy)return;
		if(selected==='custom')settings.custom=read();
		selected=source.value;show(settings[selected]);message('Шаблон выбран. Для применения нажмите «Сохранить письмо».');
	});
	for(const key of fields)get(`calendar-link-email-${key}`).addEventListener('input',preview);
	get('calendar-link-email-restore').addEventListener('click',()=>{
		if(!loaded||busy||!confirm('Восстановить исходное письмо? Для применения потребуется сохранить изменения.'))return;
		settings.custom=structuredClone(settings.original);selected='custom';source.value=selected;show(settings.custom);
		message('Исходное письмо восстановлено в редактируемом варианте. Сохраните изменения.');
	});
	form.addEventListener('submit',async event=>{
		event.preventDefault();if(!loaded||busy)return;
		const current=generation,template=read(),chosen=selected;busy=true;controls();message('Сохраняем письмо...');
		try{
			const result=await adminRequest('/api/admin/calendar-link-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({template,source:chosen})});
			if(current!==generation)return;
			if(result.ok!==true)throw new Error('Сервер не подтвердил сохранение.');
			if(chosen==='custom')settings.custom=template;
			message('Письмо сохранено. Отправка доступна в карточке записи Zoom или Microsoft Teams.');
		}catch(error){if(current===generation)message(error.message);}
		finally{if(current===generation){busy=false;controls();}}
	});
	async function load(){
		if(loaded||loading)return;
		const current=++generation;loading=true;controls();message('Загружаем письмо...');
		try{
			const result=await adminRequest('/api/admin/calendar-link-email');
			if(current!==generation)return;
			if(!['original','custom'].includes(result.source)||![result.original,result.custom].every(template=>
				template&&typeof template.subject==='string'&&typeof template.body==='string'&&typeof template.signature==='string')) {
				throw new Error('Не удалось прочитать шаблон отправки ссылки.');
			}
			settings=result;selected=result.source;source.value=selected;loaded=true;show(settings[selected]);message('');
		}catch(error){
			if(current!==generation)return;
			settings={source:'original',original:structuredClone(localOriginal),custom:structuredClone(localOriginal)};
			selected='original';source.value=selected;loaded=true;backendAvailable=false;show(settings[selected]);
			message('Исходное письмо показано локально. Сохранение и отправка появятся после обновления backend.');
		}
		finally{if(current===generation){loading=false;controls();}}
	}
	for(const [index,tab] of tabs.entries()){
		tab.addEventListener('click',()=>selectTab(index));
		tab.addEventListener('keydown',event=>{
			if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
			event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length;
			selectTab(next);tabs[next].focus();
		});
	}
	panel.addEventListener('toggle',()=>{if(panel.open&&tabs[1].getAttribute('aria-selected')==='true')load();});
	document.addEventListener('admin-login',()=>{if(panel.open&&tabs[1].getAttribute('aria-selected')==='true')load();});
	document.addEventListener('admin-logout',()=>{
		generation++;previewGeneration++;clearTimeout(timer);loaded=false;loading=false;busy=false;backendAvailable=true;settings=null;selected='original';
		form.reset();fields.forEach(key=>{get(`calendar-link-email-${key}`).value='';});
		get('calendar-link-email-preview').replaceChildren();get('calendar-link-email-preview-subject').textContent='';
		get('calendar-link-email-preview-status').textContent='';message('');controls();selectTab(0);
	});
	controls();
})();