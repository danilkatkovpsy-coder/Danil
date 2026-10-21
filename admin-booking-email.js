(() => {
	const get=id=>document.getElementById(id),panel=get('booking-email-panel'),form=get('booking-email-form'),source=get('booking-email-source');
	const keys=['body','signature'],editors=keys.map(key=>get(`booking-email-${key}`));
	const buttons=[...get('booking-email-toolbar').querySelectorAll('button')];
	let generation=0,revision=0,loaded=false,loading=false,busy=false,settings=null,selected='original',editor=null,range=null,timer;
	const message=value=>{get('booking-email-status').textContent=value;};
	const post=(path,body)=>adminRequest(`/api/admin/booking-email${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
	const read=()=>({subject:get('booking-email-subject').value,...Object.fromEntries(keys.map((key,index)=>[key,window.emailEditor.readRuns(editors[index])]))});
	function controls(){
		form.querySelectorAll('input,button,select').forEach(el=>{el.disabled=!loaded||busy;});
		const editable=loaded&&!busy&&selected==='custom';
		get('booking-email-subject').disabled=!editable;buttons.forEach(button=>{button.disabled=!editable;});
		editors.forEach(el=>{el.contentEditable=String(editable);});
	}
	function preview(){
		clearTimeout(timer);
		const current=++revision,session=generation,template=read();
		get('booking-email-preview-subject').textContent='';get('booking-email-preview').replaceChildren();
		get('booking-email-preview-status').textContent='Подготавливаем предпросмотр...';
		timer=setTimeout(async()=>{
			try{
				const result=await post('/preview',{template});
				if(current!==revision||session!==generation)return;
				if(result.ok!==true||typeof result.html!=='string'||typeof result.subject!=='string')throw new Error('Не удалось прочитать предпросмотр.');
				get('booking-email-preview-subject').textContent=result.subject;
				get('booking-email-preview').innerHTML=result.html;
				get('booking-email-preview').querySelectorAll('a').forEach(link=>{link.tabIndex=-1;link.addEventListener('click',event=>event.preventDefault());});
				get('booking-email-preview-status').textContent='';
			}catch(error){if(current===revision&&session===generation)get('booking-email-preview-status').textContent=error.message;}
		},250);
	}
	function show(template){
		get('booking-email-subject').value=template.subject;
		keys.forEach((key,index)=>window.emailEditor.fillEditor(editors[index],template[key]));
		editor=null;range=null;controls();preview();
	}
	function remember(){
		const selection=getSelection();
		if(!loaded||busy||selected!=='custom'||!selection?.rangeCount)return;
		const target=editors.find(el=>el.contains(selection.anchorNode)&&el.contains(selection.focusNode));
		if(target){
			editor=target;range=selection.getRangeAt(0).cloneRange();
			buttons.forEach(button=>button.setAttribute('aria-pressed',String(document.queryCommandState(button.dataset.format))));
		}
	}
	document.addEventListener('selectionchange',remember);
	for(const el of editors){
		el.addEventListener('input',()=>{remember();preview();});
		el.addEventListener('paste',event=>{event.preventDefault();document.execCommand('insertText',false,event.clipboardData.getData('text/plain'));preview();});
		el.addEventListener('drop',event=>event.preventDefault());
	}
	for(const button of buttons){
		button.addEventListener('mousedown',event=>event.preventDefault());
		button.addEventListener('click',()=>{
			if(!editor||!range){message('Поставьте курсор или выделите текст в письме.');return;}
			editor.focus({preventScroll:true});
			const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
			document.execCommand(button.dataset.format);remember();preview();
		});
	}
	source.addEventListener('change',()=>{
		if(!loaded||busy)return;
		if(selected==='custom')settings.custom=read();
		selected=source.value;show(settings[selected]);message('Шаблон выбран. Для применения нажмите «Сохранить письмо».');
	});
	get('booking-email-subject').addEventListener('input',preview);
	get('booking-email-restore').addEventListener('click',()=>{
		if(!loaded||busy||!confirm('Восстановить исходное письмо в редактируемом варианте? Для применения потребуется сохранить изменения.'))return;
		settings.custom=structuredClone(settings.original);selected='custom';source.value=selected;show(settings.custom);
		message('Исходный текст восстановлен. Сохраните письмо для применения.');
	});
	form.addEventListener('submit',async event=>{
		event.preventDefault();if(!loaded||busy)return;
		const current=generation,template=read(),chosen=selected;busy=true;controls();message('Сохраняем письмо...');
		try{
			const result=await post('',{template,source:chosen});
			if(current!==generation)return;
			if(result.ok!==true)throw new Error('Сервер не подтвердил сохранение.');
			if(chosen==='custom')settings.custom=template;
			message('Письмо сохранено. Оно будет использовано при новых записях клиентов.');
		}catch(error){if(current===generation)message(error.message);}
		finally{if(current===generation){busy=false;controls();}}
	});
	async function load(){
		if(loaded||loading)return;
		const current=++generation;loading=true;controls();message('Загружаем письмо...');
		try{
			const result=await adminRequest('/api/admin/booking-email');
			if(current!==generation)return;
			if(!['original','custom'].includes(result.source)||![result.original,result.custom].every(value=>
				value&&typeof value.subject==='string'&&keys.every(key=>Array.isArray(value[key]))))throw new Error('Не удалось прочитать письмо о записи.');
			settings=result;selected=result.source;source.value=selected;loaded=true;show(settings[selected]);message('');
		}catch(error){if(current===generation)message(error.message);}
		finally{if(current===generation){loading=false;controls();}}
	}
	panel.addEventListener('toggle',()=>{if(panel.open)load();});
	document.addEventListener('admin-login',()=>{if(panel.open)load();});
	document.addEventListener('admin-logout',()=>{
		generation++;revision++;clearTimeout(timer);loaded=false;loading=false;busy=false;settings=null;editor=null;range=null;
		form.reset();editors.forEach(el=>el.replaceChildren());get('booking-email-preview').replaceChildren();
		get('booking-email-preview-subject').textContent='';get('booking-email-preview-status').textContent='';message('');controls();
	});
	controls();
})();
