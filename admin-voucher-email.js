(() => {
	const get=id=>document.getElementById(id),form=get('voucher-email-form'),source=get('voucher-email-source');
	const keys=['body','instructions','signature'],editors=keys.map(key=>get(`voucher-email-${key}`));
	let generation=0,loaded=false,loading=false,busy=false,settings=null,selected='original',replyTo='',editor=null,range=null;
	const message=value=>{get('voucher-email-status').textContent=value;};
	const buttons=[...get('voucher-email-toolbar').querySelectorAll('button')];
	const read=()=>({subject:get('voucher-email-subject').value,...Object.fromEntries(keys.map((key,index)=>[key,window.emailEditor.readRuns(editors[index])]))});
	function controls(){
		form.querySelectorAll('input,button,select').forEach(el=>{el.disabled=!loaded||busy;});
		const editable=loaded&&!busy&&selected==='custom';
		get('voucher-email-subject').disabled=!editable;buttons.forEach(button=>{button.disabled=!editable;});
		editors.forEach(el=>{el.contentEditable=String(editable);});
	}
	function preview(){
		const template=read(),substitute=text=>text.replace(/\{\{(sessions|name|email)\}\}/g,(_,key)=>({sessions:'5',name:'Пример клиента',email:replyTo})[key]);
		get('voucher-email-preview-subject').textContent=substitute(template.subject);
		const container=get('voucher-email-preview');container.replaceChildren();
		for(const key of keys){
			const paragraph=document.createElement('p');
			if(key==='signature')paragraph.style.cssText='margin:24px 0 0';
			for(const run of template[key]){
				const span=document.createElement(run.bold?'strong':'span');
				span.style.fontStyle=run.italic?'italic':'normal';span.style.textDecoration=run.underline?'underline':'none';
				const parts=substitute(run.text).split('https://danilpsy.ee/#packages');
				parts.forEach((part,index)=>{
					if(index){
						const link=document.createElement('a');link.href='https://danilpsy.ee/#packages';link.textContent='пакетам консультаций\u00a0↗';link.target='_blank';link.rel='noopener';
						link.style.cssText='display:inline-block;padding:4px 10px;background:#edf3ef;border:1px solid #b8cbbf;border-radius:6px;color:#36574b;font-weight:700;text-decoration:underline;text-underline-offset:3px';
						span.append(link);
					}
					span.append(document.createTextNode(part));
				});
				paragraph.append(span);
			}
			container.append(paragraph);
			if(key==='body'){
				const card=document.createElement('div');card.className='voucher-mail-code';
				const label=document.createElement('div');label.textContent='Ваш ваучер';
				const code=document.createElement('strong');code.textContent='181E9P4Y';
				const copy=document.createElement('button');copy.type='button';copy.setAttribute('aria-label','Скопировать ваучер');copy.title='Скопировать ваучер';
				const icon=document.createElement('span');icon.className='voucher-copy-icon';icon.setAttribute('aria-hidden','true');copy.append(icon);
				const status=document.createElement('p');status.setAttribute('role','status');
				copy.addEventListener('click',async()=>{
					try{
						if(!navigator.clipboard)throw new Error('Копирование недоступно. Выделите код и скопируйте вручную.');
						await navigator.clipboard.writeText(code.textContent);status.textContent='Код ваучера скопирован.';
					}catch(error){status.textContent=error.message||'Не удалось скопировать. Выделите код и скопируйте вручную.';}
				});
				const row=document.createElement('div');row.className='voucher-mail-row';row.append(code,copy);
				const hint=document.createElement('div');hint.className='voucher-mail-hint';hint.textContent='Используйте этот код при записи на консультации.';
				card.append(label,row,hint);container.append(card,status);
			}
		}
	}
	function show(template){
		get('voucher-email-subject').value=template.subject;
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
			const selection=getSelection(),current=selection.rangeCount?selection.getRangeAt(0):null;
			const same=current&&current.startContainer===range.startContainer&&current.startOffset===range.startOffset&&current.endContainer===range.endContainer&&current.endOffset===range.endOffset;
			if(document.activeElement!==editor)editor.focus({preventScroll:true});
			if(!same){selection.removeAllRanges();selection.addRange(range);}
			document.execCommand(button.dataset.format);remember();preview();
		});
	}
	source.addEventListener('change',()=>{
		if(selected==='custom')settings.custom=read();
		selected=source.value;show(settings[selected]);message('Шаблон выбран. Для применения нажмите «Сохранить письмо».');
	});
	get('voucher-email-subject').addEventListener('input',preview);
	get('voucher-email-restore').addEventListener('click',()=>{
		if(!confirm('Восстановить исходное письмо? Для применения потребуется сохранить изменения.'))return;
		settings.custom=structuredClone(settings.original);selected='custom';source.value=selected;show(settings.custom);message('Исходный текст восстановлен в редактируемом варианте. Сохраните письмо для применения.');
	});
	form.addEventListener('submit',async event=>{
		event.preventDefault();if(!loaded||busy)return;
		const current=generation,template=read(),chosen=selected;busy=true;controls();message('Сохраняем письмо...');
		try{
			const result=await adminRequest('/api/admin/voucher-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({template,source:chosen})});
			if(current!==generation)return;
			if(result.ok!==true)throw new Error('Сервер не подтвердил сохранение.');
			if(chosen==='custom')settings.custom=template;
			message('Письмо сохранено. Отправка происходит только кнопкой «Отправить ваучер» у активного ваучера.');
		}catch(error){if(current===generation)message(error.message);}
		finally{if(current===generation){busy=false;controls();}}
	});
	async function load(){
		if(loaded||loading)return;
		const current=++generation;loading=true;controls();message('Загружаем письмо...');
		try{
			const result=await adminRequest('/api/admin/voucher-email');
			if(current!==generation)return;
			if(!['original','custom'].includes(result.source)||typeof result.replyTo!=='string'||
				![result.original,result.custom].every(value=>value&&typeof value.subject==='string'&&keys.every(key=>Array.isArray(value[key]))))throw new Error('Не удалось прочитать письмо с ваучером.');
			settings=result;selected=result.source;replyTo=result.replyTo;source.value=selected;loaded=true;show(settings[selected]);message('');
		}catch(error){if(current===generation)message(error.message);}
		finally{if(current===generation){loading=false;controls();}}
	}
	function generateCode(packageName){
		if(!['five','ten'].includes(packageName))throw new Error('Неизвестный пакет консультаций');
		const alphabet='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',bytes=new Uint8Array(16);
		let code='';
		do{
			code='';
			while(code.length<8){
				crypto.getRandomValues(bytes);
				for(const byte of bytes){if(byte<252)code+=alphabet[byte%36];if(code.length===8)break;}
			}
		}while(!/[0-9]/.test(code)||!/[A-Z]/.test(code)||(packageName==='five'?!/^[0-9]/.test(code):!/^[A-Z]/.test(code)));
		return code;
	}
	document.addEventListener('admin-logout',()=>{
		generation++;loaded=false;loading=false;busy=false;settings=null;editor=null;range=null;replyTo='';
		form.reset();editors.forEach(el=>el.replaceChildren());get('voucher-email-preview').replaceChildren();get('voucher-email-preview-subject').textContent='';message('');controls();
	});
	window.voucherEmail={load,generateCode};controls();
})();
