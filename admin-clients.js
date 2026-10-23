(() => {
	const get=id=>document.getElementById(id);
	const form=get('client-form'),dialog=get('client-dialog');
	const remove=get('client-delete');
	const fields=['email','name','phone','contact','notes'];
	const labels={free:'Бесплатная консультация',single:'Индивидуальная консультация',five:'Пакет 5 встреч',ten:'Пакет 10 встреч'};
	let generation=0,detailGeneration=0,offset=0,search='',email=null,visitsOffset=0,purchasesOffset=0,group='paid';
	let removing=false,resetting=false;
	const text=(tag,value)=>{
		const node=document.createElement(tag);node.textContent=value;return node;
	};
	const field=key=>form.elements.namedItem(key);
	const setStatus=(id,error)=>{get(id).textContent=error.message;};
	async function loadClients(append=false){
		if(!adminAuthenticated)return;
		const current=++generation;
		if(!append){offset=0;search=get('clients-search').value.trim();get('clients-list').replaceChildren();}
		get('clients-more').hidden=true;get('clients-status').textContent='Загружаем клиентов...';
		try{
			const result=await adminRequest(`/api/admin/clients?search=${encodeURIComponent(search)}&offset=${offset}&group=${group}`);
			if(current!==generation)return;
			for(const client of result.clients){
				const card=text('article','');card.className='order-card';
				card.append(text('strong',client.name),text('p',client.email));
				const open=text('button','Открыть клиента');open.type='button';
				open.addEventListener('click',()=>openClient(client.email));card.append(open);
				get('clients-list').append(card);
			}
			offset+=result.clients.length;get('clients-more').hidden=!result.more;
			get('clients-status').textContent=offset?`Показано клиентов: ${offset}.`:'Клиенты не найдены.';
		}catch(error){if(current===generation){setStatus('clients-status',error);get('clients-more').hidden=!append;}}
	}
	function historyRows(result,kind,append=false){
		const purchases=kind==='purchases',list=get(`client-${kind}`);
		if(!append)list.replaceChildren();
		for(const entry of result[kind]){
			const card=text('article','');card.className='order-card';
			if(purchases){
				card.append(text('strong',`${entry.order_number} · ${labels[entry.package_name]||entry.package_name}`));
				card.append(text('p',`${formatAdminDateTime(entry.created_at)} · ${entry.source==='gift'?'Подарок':`${Number(entry.price_cents)/100} €`} · ${entry.deleted_at?'Заявка удалена':entry.activated_at?'Ваучер активирован':'Заявка, ожидает активации'}`));
				if(entry.activated_at)card.append(text('p',`Активация: ${formatAdminDateTime(entry.activated_at)}`));
				if(entry.voucher_code)card.append(text('p',`Ваучер ${entry.voucher_code} · Остаток ${entry.remaining_sessions} / ${entry.total_sessions}`));
				if(entry.invoice_number)card.append(text('p',`Счет: ${entry.invoice_number}`));
				card.append(text('p',`${entry.name} · ${entry.email}`));
				if(entry.additional_info)card.append(text('p',entry.additional_info));
			}else{
				const status=entry.status==='cancelled'?'Отменена':Date.parse(entry.end_at)<=Date.now()?'Прошедшая':'Предстоящая';
				card.append(text('strong',`${formatAdminDateTime(entry.start_at)} · ${labels[entry.package_name]||entry.package_name}`));
				card.append(text('p',`${status} · ${entry.platform} · ${entry.source==='admin'?'Добавлена вручную':entry.source==='site'?'Запись на сайте':'Перенесенная запись'}`));
				for(const key of ['name','email','contact','client_request','connection_notice'])if(entry[key])card.append(text('p',entry[key]));
			}
			list.append(card);
		}
		if(!list.children.length)list.append(text('p',purchases?'Покупок пока нет.':'Записей пока нет.'));
		get(`client-${kind}-more`).hidden=!(purchases?result.morePurchases:result.moreVisits);
	}
	async function loadDetail(kind=null){
		const current=++detailGeneration,selected=email;
		get('client-status').textContent='Загружаем данные клиента...';
		for(const key of ['visits','purchases'])get(`client-${key}-more`).disabled=true;
		try{
			const result=await adminRequest(`/api/admin/clients?email=${encodeURIComponent(selected)}&visitsOffset=${visitsOffset}&purchasesOffset=${purchasesOffset}`);
			if(current!==detailGeneration||selected!==email||!dialog.open)return;
			if(!kind){
				for(const key of fields)field(key).value=result.client[key];
				get('client-title').textContent=result.client.name;
				get('client-created-at').textContent=`Дата создания: ${formatAdminDateTime(result.client.created_at)}`;
				get('client-created-at').hidden=false;
				get('client-free-settings').hidden=false;
				get('client-free-reset').disabled=false;
				get('client-free-limit').textContent=`Бесплатных записей: ${result.client.free_bookings_used}. Доступно новых: ${Math.max(0,result.client.free_bookings_allowed-result.client.free_bookings_used)}.`;
				remove.hidden=false;
				window.adminManualInvoice.mount(get('client-invoice-actions'),{
					clientEmail:result.client.email,name:result.client.name,email:result.client.email,
				});
			}
			if(!kind||kind==='visits'){historyRows(result,'visits',kind==='visits');visitsOffset+=result.visits.length;}
			if(!kind||kind==='purchases'){historyRows(result,'purchases',kind==='purchases');purchasesOffset+=result.purchases.length;}
			get('client-history').hidden=false;get('client-status').textContent='';
			return true;
		}catch(error){if(current===detailGeneration)setStatus('client-status',error);return false;}
		finally{if(current===detailGeneration)for(const key of ['visits','purchases'])get(`client-${key}-more`).disabled=false;}
	}
	function openClient(value=null){
		detailGeneration++;email=value;visitsOffset=0;purchasesOffset=0;form.reset();
		remove.hidden=true;remove.disabled=false;removing=false;
		get('client-created-at').hidden=true;get('client-created-at').textContent='';
		resetting=false;get('client-free-settings').hidden=true;get('client-free-status').textContent='';
		get('client-free-settings').open=false;
		get('client-invoice-actions').replaceChildren();
		get('client-purchases-toggle').open=false;
		get('client-visits-toggle').open=false;
		field('email').readOnly=Boolean(value);get('client-history').hidden=true;
		get('client-title').textContent=value?'Клиент':'Добавить клиента';get('client-status').textContent='';
		form.querySelector('[type="submit"]').disabled=Boolean(value);
		dialog.showModal();
		if(value)loadDetail().then(loaded=>{if(loaded&&email===value&&dialog.open)form.querySelector('[type="submit"]').disabled=false;});
		else field('email').focus();
	}
	get('client-close').addEventListener('click',()=>dialog.close());
	remove.addEventListener('click',async()=>{
		const save=form.querySelector('[type="submit"]');
		if(!email||removing||resetting||save.disabled)return;
		if(!confirm(`Удалить клиента ${get('client-title').textContent} (${email}) из базы? История, счета и записи в календаре сохранятся. Встречи и автоматические отправки не отменяются.`))return;
		const current=detailGeneration,selected=email;
		removing=true;remove.disabled=true;save.disabled=true;
		try{
			const result=await adminRequest(`/api/admin/clients?email=${encodeURIComponent(selected)}`,{method:'DELETE'});
			if(current!==detailGeneration||!dialog.open)return;
			if(result.ok!==true)throw new Error('Удаление клиента не подтверждено.');
			dialog.close();
			await loadClients();
		}catch(error){if(current===detailGeneration)setStatus('client-status',error);}
		finally{if(current===detailGeneration){removing=false;remove.disabled=false;save.disabled=false;}}
	});
	get('client-free-reset').addEventListener('click',async()=>{
		const save=form.querySelector('[type="submit"]');
		if(!email||removing||resetting||save.disabled)return;
		if(!confirm(`Разрешить еще одну бесплатную запись для ${email}?`))return;
		const current=detailGeneration,selected=email;
		resetting=true;save.disabled=true;remove.disabled=true;get('client-free-reset').disabled=true;
		get('client-free-status').textContent='Сбрасываем лимит...';
		try{
			const result=await adminRequest('/api/admin/clients/reset-free-limit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:selected})});
			if(current!==detailGeneration||!dialog.open)return;
			if(result.ok!==true||!result.client)throw new Error('Сброс лимита не подтвержден.');
			get('client-free-limit').textContent=`Бесплатных записей: ${result.client.free_bookings_used}. Доступно новых: ${Math.max(0,result.client.free_bookings_allowed-result.client.free_bookings_used)}.`;
			get('client-free-status').textContent='Разрешена одна дополнительная бесплатная запись.';
		}catch(error){if(current===detailGeneration)setStatus('client-free-status',error);}
		finally{if(current===detailGeneration){resetting=false;save.disabled=false;remove.disabled=false;get('client-free-reset').disabled=false;}}
	});
	dialog.addEventListener('close',()=>{detailGeneration++;email=null;form.reset();get('client-free-settings').hidden=true;get('client-invoice-actions').replaceChildren();get('client-visits').replaceChildren();get('client-purchases').replaceChildren();});
	for(const selected of ['paid','free'])get(`clients-tab-${selected}`).addEventListener('click',()=>{
		if(group===selected)return;
		group=selected;
		for(const key of ['paid','free'])get(`clients-tab-${key}`).setAttribute('aria-pressed',String(key===group));
		loadClients();
	});
	get('clients-add').addEventListener('click',()=>openClient());
	get('clients-refresh').addEventListener('click',()=>loadClients());
	get('clients-more').addEventListener('click',()=>loadClients(true));
	get('clients-search-form').addEventListener('submit',event=>{event.preventDefault();loadClients();});
	for(const kind of ['visits','purchases'])get(`client-${kind}-more`).addEventListener('click',()=>loadDetail(kind));
	form.addEventListener('submit',async event=>{
		event.preventDefault();
		if(removing||resetting)return;
		const save=form.querySelector('[type="submit"]'),current=detailGeneration;
		save.disabled=true;remove.disabled=true;get('client-status').textContent='Сохраняем клиента...';
		try{
			const payload=Object.fromEntries(fields.map(key=>[key,field(key).value.trim()]));
			const result=await adminRequest('/api/admin/clients',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
			if(current!==detailGeneration||!dialog.open)return;
			email=result.client.email;field('email').value=email;field('email').readOnly=true;
			visitsOffset=0;purchasesOffset=0;
			const loaded=await loadDetail();
			if(loaded)get('client-status').textContent='Клиент сохранен.';
			loadClients();
		}catch(error){if(current===detailGeneration)setStatus('client-status',error);}
		finally{if(dialog.open){save.disabled=false;remove.disabled=false;}}
	});
	document.addEventListener('admin-clients-open',()=>loadClients());
	document.addEventListener('admin-login',()=>{if(!get('clients-section').hidden)loadClients();});
	adminForm.addEventListener('submit',()=>{if(!get('clients-section').hidden)loadClients();});
	document.addEventListener('admin-logout',()=>{
		generation++;detailGeneration++;group='paid';
		for(const key of ['paid','free'])get(`clients-tab-${key}`).setAttribute('aria-pressed',String(key===group));
		dialog.close();get('clients-list').replaceChildren();get('clients-status').textContent='';
	});
})();
