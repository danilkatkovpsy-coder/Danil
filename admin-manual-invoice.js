(() => {
	const keys=['single','five','ten'];
	const labels={single:'Индивидуальная консультация',five:'Пакет 5 сессий',ten:'Пакет 10 сессий'};
	const prefix='admin-pending-invoice:';
	const states=new Map();
	let generation=0;
	const node=(tag,text='')=>{const element=document.createElement(tag);element.textContent=text;return element;};
	function mount(container,source){
		container.replaceChildren();
		const reveal=node('button','+ Создать счет');reveal.type='button';
		reveal.title='Создать счет';
		const form=node('form');form.className='calendar-form manual-invoice-form';form.hidden=true;
		const label=node('label','Товар'),select=node('select');select.required=true;label.append(select);
		const submit=node('button');submit.type='submit';submit.disabled=true;
		submit.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m3 7 9 6 9-6"></path></svg><span>Отправить</span>';
		submit.setAttribute('aria-label','Создать и отправить счет');
		submit.title='Создать и отправить счет';
		const another=node('button','Создать еще счет');another.type='button';another.hidden=true;
		const status=node('p');status.setAttribute('role','status');
		form.append(label,submit,another,status);container.append(reveal,form);
		const identity=source.appointmentId?`appointment:${source.appointmentId}`:`client:${source.clientEmail}`;
		const storageKey=prefix+identity;
		let state=states.get(identity),prices=null,loading=false;
		function controls(){
			select.disabled=!prices||Boolean(state?.pending)||Boolean(state?.sent);
			submit.disabled=!prices||Boolean(state?.busy)||Boolean(state?.sent);
			another.hidden=!state?.sent;
			if(state?.product)select.value=state.product;
		}
		async function load(){
			if(loading)return;
			loading=true;const current=generation;
			status.textContent='Загружаем товары...';
			try{
				if(!state){
					const saved=sessionStorage.getItem(storageKey);
					if(saved){
						state=JSON.parse(saved);
						if(!state||!keys.includes(state.product)||!Number.isInteger(state.priceCents)||
							typeof state.requestId!=='string'||!/^[a-f0-9-]{36}$/i.test(state.requestId)){
							throw new Error('Повреждены данные незавершенного счета. Проверьте раздел «Счета» перед новой отправкой.');
						}
						if((state.emailTemplate!==undefined&&(!state.emailTemplate||typeof state.emailTemplate.subject!=='string'||
							!['estonian','russian','signature'].every(key=>Array.isArray(state.emailTemplate[key])&&
								state.emailTemplate[key].length&&state.emailTemplate[key].every(run=>run&&typeof run.text==='string'&&typeof run.bold==='boolean'))))||
							(state.emailLanguage!==undefined&&!['both','estonian','russian'].includes(state.emailLanguage))){
							throw new Error('Поврежден текст незавершенной отправки. Проверьте раздел «Счета» перед повтором.');
						}
						state.pending=true;
					}else state={};
					states.set(identity,state);
				}
				const [catalog,result]=await Promise.all([adminRequest('/api/admin/invoice-products'),adminRequest('/api/admin/prices')]);
				if(current!==generation||!container.isConnected)return;
				prices=window.servicePricing.validate(result.prices);select.replaceChildren();
				for(const key of keys){
					const product=catalog.products?.[key];
					if(!product||typeof product.name!=='string'||typeof product.article!=='string')throw new Error('Не удалось прочитать товары.');
					const option=node('option',`${labels[key]} · ${window.servicePricing.money(prices[key])} · ${product.article} — ${product.name}`);
					option.value=key;select.append(option);
				}
				const otherOption=node('option','Другое…');otherOption.value='other';select.append(otherOption);
				if(state.pending){
					select.options[keys.indexOf(state.product)].textContent=`${labels[state.product]} · ${window.servicePricing.money(state.priceCents)} · Незавершенная отправка`;
				}
				status.textContent=state.sent?`Счет № ${state.invoiceNumber} отправлен и сохранен в разделе «Счета».`:
					state.pending?'Есть незавершенная отправка. Нажмите «Отправить», чтобы безопасно повторить тот же запрос.':'';
			}catch(error){prices=null;status.textContent=error.message;}
			finally{loading=false;controls();}
		}
		reveal.addEventListener('click',()=>{
			form.hidden=!form.hidden;reveal.setAttribute('aria-expanded',String(!form.hidden));
			if(!form.hidden)load();
		});
		reveal.setAttribute('aria-expanded','false');
		another.addEventListener('click',()=>{
			state={};states.set(identity,state);load();
		});
		function openOtherInvoice(){
			if(!source.email){status.textContent='Для создания счета у клиента должен быть email.';return;}
			if(typeof window.adminInvoiceEditor?.openManual!=='function'){
				status.textContent='Редактор счетов недоступен. Обновите страницу и попробуйте снова.';
				return;
			}
			window.adminInvoiceEditor.openManual({name:source.name,email:source.email});
		}
		select.addEventListener('change',()=>{
			if(select.value!=='other')return;
			openOtherInvoice();
			select.value=state?.product||keys[0];
		});
		if(!source.email){reveal.disabled=true;reveal.title='Для создания счета у клиента должен быть email.';}
		form.addEventListener('submit',async event=>{
			event.preventDefault();
			if(!prices||state.busy||state.sent||!form.reportValidity())return;
			const current=generation;
			try{
				if(!state.pending){
					const product=select.value,priceCents=prices[product],requestId=crypto.randomUUID();
					const email=await window.adminInvoiceList.composeEmail({
						id:requestId,name:source.name,email:source.email,invoice_editable:true,
					});
					if(current!==generation||!email)return;
					state.product=product;state.priceCents=priceCents;state.requestId=requestId;
					state.emailTemplate=email.template;state.emailLanguage=email.language;
					sessionStorage.setItem(storageKey,JSON.stringify({product:state.product,priceCents:state.priceCents,
						requestId:state.requestId,emailTemplate:state.emailTemplate,emailLanguage:state.emailLanguage}));
					state.pending=true;
				}
				state.busy=true;controls();status.textContent='Создаем PDF и отправляем счет...';
				const result=await adminRequest('/api/admin/invoices/send',{
					method:'POST',headers:{'Content-Type':'application/json'},
					body:JSON.stringify({requestId:state.requestId,product:state.product,priceCents:state.priceCents,
						...(state.emailTemplate?{template:state.emailTemplate,language:state.emailLanguage}:{}),
						...(source.appointmentId?{appointmentId:source.appointmentId}:{clientEmail:source.clientEmail})}),
				});
				if(current!==generation)return;
				if(result.ok!==true||result.invoiceEmailSent!==true||typeof result.invoiceNumber!=='string')throw new Error('Сервер не подтвердил отправку счета. Повторите тот же запрос.');
				state.sent=true;state.pending=false;state.invoiceNumber=result.invoiceNumber;
				sessionStorage.removeItem(storageKey);
				status.textContent=`Счет № ${result.invoiceNumber} отправлен на ${source.email} и сохранен в разделе «Счета».`;
			}catch(error){
				if(current!==generation)return;
				if([400,409].includes(error.status)){
					sessionStorage.removeItem(storageKey);state={};states.set(identity,state);
				}
				status.textContent=error.message;
			}finally{state.busy=false;if(current===generation)controls();}
		});
	}
	document.addEventListener('admin-logout',()=>{
		generation++;states.clear();
		for(let index=sessionStorage.length-1;index>=0;index--){
			const key=sessionStorage.key(index);if(key?.startsWith(prefix))sessionStorage.removeItem(key);
		}
	});
	window.adminManualInvoice={mount};
})();
