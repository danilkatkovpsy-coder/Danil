(() => {
	const get=id=>document.getElementById(id),form=get('invoice-editor-form'),editor=get('invoice-editor');
	const field=name=>form.elements.namedItem(name),lines=get('invoice-editor-lines');
	const pendingKey='admin-custom-invoice-pending';
	const post=(path,body)=>adminRequest(`/api/admin/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
	const node=(tag,text='')=>{const el=document.createElement(tag);el.textContent=text;return el;};
	const money=cents=>new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}).format(cents/100);
	const rounded=(n,d)=>Number((n+d/2n)/d);
	function totals(items){
		const rows=items.map(line=>{
			if(![line.priceCents,line.quantity,line.discount,line.vat].every(Number.isFinite))throw new Error('Проверьте числа в строках.');
			const gross=line.text?0:rounded(BigInt(line.priceCents)*BigInt(Math.round(line.quantity*1000))*BigInt(10000-Math.round(line.discount*100)),10000000n);
			const net=rounded(BigInt(gross)*10000n,BigInt(10000+Math.round(line.vat*100)));
			return {gross,net,vat:gross-net};
		});
		return {rows,gross:rows.reduce((sum,row)=>sum+row.gross,0),net:rows.reduce((sum,row)=>sum+row.net,0),vat:rows.reduce((sum,row)=>sum+row.vat,0)};
	}
	let catalog=[],vatRegistered=false,current=null,items=[],locked=false,busy=false,dirty=false,pending=null,generation=0,ready=false,selectedClient=null;
	let searchTimer,searchVersion=0,serverPending=[];
	let nextNumber='',numberVersion=0,numberLoading=false,numberError='';
	const customNumber=get('invoice-editor-custom-number'),numberInput=get('invoice-editor-number');
	const message=text=>{get('invoice-editor-status').textContent=text;};
	const invoice=()=>Object.assign(current,{name:field('name').value,email:field('email').value,invoice_editable:true});
	async function paymentStatus(){
		const version=generation,id=current.id;
		const result=await adminRequest(`/api/admin/invoices/${id}/payment`);
		if(version!==generation||current?.id!==id)return;
		if(result.ok!==true||typeof result.invoice_paid!=='boolean')throw new Error('Не удалось прочитать отметку оплаты.');
		Object.assign(current,result);
	}
	function controls(){
		editor.dataset.locked=String(locked);
		get('invoice-editor-lock').style.display=pending?'inline-block':'none';
		get('invoice-editor-fields').disabled=!ready||locked||busy||Boolean(pending);
		get('invoice-editor-lock').textContent=pending?'Сохранение не завершено — повторите тот же запрос':
			locked?`Заблокирован · сохраненная версия ${current?.revision||''}`:'Разблокирован · редактирование';
		get('invoice-editor-save').disabled=!ready||locked||busy||(!current&&!customNumber.checked&&(numberLoading||Boolean(numberError)));
		customNumber.disabled=Boolean(current)||!ready||locked||busy||Boolean(pending);
		numberInput.disabled=Boolean(current)||!customNumber.checked||!ready||locked||busy||Boolean(pending);
		numberInput.required=customNumber.checked;
		get('invoice-editor-edit').disabled=!locked||busy;
		get('invoice-editor-edit').hidden=!locked;
		get('invoice-editor-pdf').hidden=!current||!locked;
		for(const key of ['pdf','send','preview','deliveries','versions'])get(`invoice-editor-${key}`).disabled=!current||!locked||busy;
		get('invoice-editor-paid').disabled=!current||busy||Boolean(pending)||typeof current.invoice_paid!=='boolean';
		get('invoice-editor-paid').textContent=current?.invoice_paid?'Снять отметку оплаты':'Пометить оплаченным';
		get('invoice-editor-delete').disabled=!current||busy||Boolean(pending);
		for(const key of ['new','back'])get(`invoice-editor-${key}`).disabled=busy||Boolean(pending);
		for(const row of lines.children){
			const line=items[Number(row.dataset.index)],reserved=['001','002','003'].includes(line.article);
			row.querySelectorAll('[data-key]').forEach(input=>{
				input.disabled=locked||busy||Boolean(pending)||(input.dataset.key==='vat'&&!vatRegistered)||
					(reserved&&['name','priceCents','unit'].includes(input.dataset.key));
			});
			const edit=row.querySelector('.invoice-editor-article-edit');
			if(edit)edit.disabled=locked||busy||Boolean(pending)||reserved;
		}
	}
	function calculate(){
		const box=get('invoice-editor-totals');box.replaceChildren();
		try{
			const result=totals(items);
			items.forEach((line,index)=>{const output=lines.children[index]?.querySelector('output');if(output)output.textContent=money(result.rows[index].gross);});
			box.append(node('p',`Сумма без НДС: ${money(result.net)} EUR`));
			box.append(node('p',`НДС: ${money(result.vat)} EUR`));
			box.append(node('strong',`Сумма к оплате: ${money(result.gross)} EUR`));
		}catch(error){box.append(node('p',error.message));}
	}
	function renderLines(){
		lines.replaceChildren();
		items.forEach((line,index)=>{
			const row=node('tr');row.dataset.index=String(index);
			const add=el=>{const td=node('td');td.append(el);row.append(td);};
			if(line.text){
				const input=node('input');input.value=line.name;input.required=true;input.maxLength=500;input.dataset.key='name';
				input.setAttribute('aria-label','Текстовая строка');
				input.addEventListener('input',()=>{line.name=input.value;dirty=true;});
				const cell=node('td');cell.colSpan=8;cell.append(input);row.append(cell);
			}else{
				const select=node('select');select.setAttribute('aria-label','Артикул');
				const blank=node('option','Своя услуга');blank.value='';select.append(blank);
				for(const product of catalog){const option=node('option',`${product.article} — ${product.name}`);option.value=product.article;select.append(option);}
				if(line.article&&!catalog.some(product=>product.article===line.article)){const option=node('option',line.article);option.value=line.article;select.append(option);}
				const create=node('option','+ Добавить артикул');create.value='__new__';select.append(create);
				select.value=line.article;
				select.addEventListener('change',()=>{
					if(select.value==='__new__'){select.value=line.article;openProduct(index,true);return;}
					const product=catalog.find(value=>value.article===select.value);
					if(product)Object.assign(line,{article:product.article,name:product.name,priceCents:product.price_cents,unit:product.unit});
					else Object.assign(line,{article:'',name:'',priceCents:0,unit:'tk'});
					dirty=true;renderLines();
				});
				const picker=node('div');picker.className='invoice-editor-article-picker';
				const edit=node('button','✎');edit.type='button';edit.className='invoice-editor-article-edit';
				edit.setAttribute('aria-label','Редактировать артикул');
				edit.title=['001','002','003'].includes(line.article)?'Системный артикул — настройки в разделе услуг':'Редактировать артикул';
				edit.addEventListener('click',()=>openProduct(index));
				picker.append(select,edit);add(picker);
				for(const [key,label,type,min,max,step] of [
					['name','Описание','text'],['quantity','Количество','number','0.001','10000','0.001'],
					['unit','Единица','text'],['priceCents','Цена','number','0','100000','0.01'],
					['discount','Скидка, %','number','0','100','0.01'],['vat','НДС, %','number','0','100','0.01'],
				]){
					const input=node('input');input.type=type;input.required=true;input.dataset.key=key;
					input.setAttribute('aria-label',label);input.value=String(key==='priceCents'?line[key]/100:line[key]);
					if(type==='number'){input.min=min;input.max=max;input.step=step;}
					else input.maxLength=key==='name'?500:20;
					input.addEventListener('input',()=>{
						line[key]=type==='number'?(input.value===''?NaN:key==='priceCents'?Math.round(Number(input.value)*100):Number(input.value)):input.value;
						dirty=true;calculate();
					});add(input);
				}
				add(node('output'));
			}
			const remove=node('button','×');remove.type='button';remove.setAttribute('aria-label','Удалить строку');
			remove.addEventListener('click',()=>{items.splice(index,1);dirty=true;renderLines();});add(remove);lines.append(row);
		});
		calculate();controls();
	}
	function blankLine(text=false){return {article:'',name:'',unit:'tk',quantity:1,priceCents:0,discount:0,vat:vatRegistered?24:0,text};}
	function draft(){
		const dueKind=field('dueKind').value;
		const note=field('note').value.trim();
		const data=Object.fromEntries([...['name','email','phone','address','issued','due','dueKind','reference'].map(key=>[key,field(key).value.trim()]),
			['buyerType',field('buyerType').value],['registrationCode',field('registrationCode').value.trim()],
			['note',dueKind==='offer'?note.split(/\r?\n/).filter(line=>!/\bViivis\s*:/i.test(line)).join('\n').trim():note],
			['penalty',dueKind==='payment'?Number(field('penalty').value):0],['vatRegistered',vatRegistered],['lines',items]]);
		if(customNumber.checked)data.customNumber=numberInput.value.trim();
		return data;
	}
	function updateDueKind(){
		const payment=field('dueKind').value==='payment',penalty=field('penalty');
		if(!payment)penalty.value='0';
		penalty.disabled=!payment;
		get('invoice-editor-due-label').textContent=payment?'Срок оплаты':'Действие предложения';
	}
	function showClientAddress(address){
		const hint=get('invoice-editor-client-address');
		hint.textContent=address.trim();hint.hidden=!hint.textContent;
	}
	function fill(data){
		for(const key of ['name','email','phone','address','buyerType','registrationCode','issued','due','dueKind','reference','note','penalty'])field(key).value=String(data[key]);
		updateDueKind();
		showClientAddress(data.address);
		get('invoice-editor-registration-field').hidden=data.buyerType!=='company';
		items=data.lines.map(line=>({...line}));vatRegistered=data.vatRegistered;
		customNumber.checked=Boolean(data.customNumber);
		numberInput.value=current?.invoice_number||data.customNumber||nextNumber;
		renderLines();
	}
	async function refreshNumber(){
		const version=++numberVersion,session=generation,day=field('issued').value;
		if(current||pending)return;
		numberLoading=true;numberError='';controls();
		if(!customNumber.checked)numberInput.value='Загружаем номер...';
		try{
			const result=await adminRequest(`/api/admin/invoice-editor/number?issued=${encodeURIComponent(day)}`);
			if(version!==numberVersion||session!==generation)return;
			if(typeof result.number!=='string'||!/^\d{6}(\/\d+)?$/.test(result.number))throw new Error('Не удалось прочитать следующий номер счета.');
			nextNumber=result.number;
			if(!customNumber.checked)numberInput.value=nextNumber;
		}catch(error){
			if(version!==numberVersion||session!==generation)return;
			numberError=error.message;
			if(!customNumber.checked){numberInput.value='Номер недоступен';message(error.message);}
		}finally{if(version===numberVersion&&session===generation){numberLoading=false;controls();}}
	}
	customNumber.addEventListener('change',()=>{
		numberInput.value=customNumber.checked?'':nextNumber;numberInput.setCustomValidity('');
		dirty=true;controls();if(customNumber.checked)numberInput.focus();else refreshNumber();
	});
	numberInput.addEventListener('input',()=>{
		const value=numberInput.value.trim();
		numberInput.setCustomValidity(customNumber.checked&&(!/^[A-Za-zА-Яа-яЁё0-9][A-Za-zА-Яа-яЁё0-9._/-]{0,39}$/.test(value)||/^\d{6}(\/\d+)?$/.test(value))
			?'Укажите свой номер до 40 символов: буквы, цифры, точка, дефис, / или _. Формат автоматической серии зарезервирован.':'');
	});
	field('issued').addEventListener('change',refreshNumber);
	async function loadCatalog(){
		const version=generation;
		const result=await adminRequest('/api/admin/invoice-editor');
		if(version!==generation)throw new Error('Сеанс завершен.');
		if(typeof result.vatRegistered!=='boolean'||!result.products||!result.prices||!Array.isArray(result.customProducts))throw new Error('Не удалось загрузить настройки счета.');
		catalog=['single','five','ten'].map((key,index)=>({article:String(index+1).padStart(3,'0'),name:result.products[key].name,price_cents:result.prices[key],unit:'tk'}));
		catalog.push(...result.customProducts);serverPending=result.pending;return result.vatRegistered;
	}
	function canLeave(){return !pending&&(!dirty||confirm('Есть несохраненные изменения. Отменить их?'));}
	async function open(id=null,recover=null,prefill=null){
		if(busy||(!editor.hidden&&!canLeave()))return;
		const version=++generation;
		nextNumber='';numberError='';numberLoading=false;numberVersion++;numberInput.setCustomValidity('');
		editor.hidden=false;get('invoice-list-card').hidden=true;busy=true;ready=false;current=null;locked=false;dirty=false;pending=null;selectedClient=null;
		get('invoice-editor-title').textContent=id?'Счет':'Новый счет';message('Загружаем редактор...');controls();
		try{
			const registered=await loadCatalog();ready=true;
			if(version!==generation)return;
			const recovery=get('invoice-editor-recovery');recovery.replaceChildren();recovery.hidden=true;
			if(!Array.isArray(serverPending))throw new Error('Не удалось проверить незавершенные счета.');
			for(const item of serverPending){
				const button=node('button',`Завершить сохранение ${item.pending_id.slice(0,8)}`);button.type='button';
				button.addEventListener('click',()=>open(null,item));recovery.append(button);recovery.hidden=false;
			}
			let stored=sessionStorage.getItem(pendingKey);
			if(recover){
				const saved=await adminRequest(`/api/admin/invoice-editor/${recover.pending_id}`);
				if(version!==generation)return;
				stored=JSON.stringify({requestId:recover.pending_id,previousId:recover.current_id,draft:saved.invoice.custom_data});
				sessionStorage.setItem(pendingKey,stored);
			}
			if(stored){
				pending=JSON.parse(stored);
				if(!pending||typeof pending.requestId!=='string'||!pending.draft||!Array.isArray(pending.draft.lines))throw new Error('Не удалось прочитать незавершенное сохранение. Проверьте архив перед созданием нового счета.');
				if(pending.previousId){
					const result=await adminRequest(`/api/admin/invoice-editor/${pending.previousId}`);
					if(version!==generation)return;
					current=result.invoice;
				}
				fill(pending.draft);recovery.hidden=true;message('Есть незавершенное сохранение. Нажмите «Сохранить счет», чтобы безопасно завершить его.');
			}else if(id){
				const result=await adminRequest(`/api/admin/invoice-editor/${encodeURIComponent(id)}`);
				if(version!==generation)return;
				current=result.invoice;locked=true;fill(current.custom_data);
				await paymentStatus();if(version!==generation)return;
				get('invoice-editor-title').textContent=`Счет № ${current.invoice_number}`;message('');
			}else{
				vatRegistered=registered;form.reset();
				const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Tallinn',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
				const due=new Date(`${today}T12:00:00Z`);due.setUTCDate(due.getUTCDate()+14);
				fill({name:'',email:'',phone:'',address:'',buyerType:'person',registrationCode:'',issued:today,due:due.toISOString().slice(0,10),dueKind:'payment',penalty:0.05,reference:'',note:'',vatRegistered,lines:[blankLine()]});
				if(prefill){
					field('name').value=String(prefill.name||'');
					field('email').value=String(prefill.email||'');
				}
				await refreshNumber();if(version!==generation)return;
				if(!numberError)message('');
			}
			get('invoice-editor-version-list').hidden=true;get('invoice-editor-client-results').replaceChildren();
		}catch(error){if(version===generation){ready=false;message(error.message);}}
		finally{if(version===generation){busy=false;controls();}}
	}
	async function openManual(client){
		if(busy)return false;
		if(!editor.hidden){
			if(!canLeave())return false;
			editor.hidden=true;get('invoice-list-card').hidden=false;dirty=false;
		}
		for(const id of ['client-dialog','calendar-details']){
			const dialog=get(id);if(dialog?.open)dialog.close();
		}
		get('section-invoices').click();
		await open(null,null,client);
		return true;
	}
	async function savedAction(action){
		if(busy||!current||!locked)return;
		busy=true;controls();const version=generation;
		try{
			if(action==='preview')await window.adminInvoiceList.preview(invoice());
			else if(action==='deliveries')window.adminInvoiceDelivery.open(invoice());
			else if(action==='versions'){
				const result=await adminRequest(`/api/admin/invoice-editor/${current.id}/versions`);
				if(version!==generation)return;
				if(!Array.isArray(result.versions))throw new Error('Не удалось прочитать историю версий.');
				const box=get('invoice-editor-version-list');box.replaceChildren();box.hidden=false;box.append(node('h3','История версий · прежние PDF не заменяются'));
				for(const item of result.versions){
					const row=node('p',`Версия ${item.revision} · ${new Date(item.created_at).toLocaleString('ru-RU')} · ${item.email} · ${money(item.price_cents)} EUR${item.invoice_sent_at?' · отправлялась':''}`);
					const link=node('button','Скачать PDF');link.type='button';
					link.addEventListener('click',()=>downloadVersion(item));row.append(link);box.append(row);
				}
			}else{
				await window.adminInvoiceList[action](invoice());
				if(version===generation)message(get('invoice-list-status').textContent);
			}
		}catch(error){if(version===generation)message(error.message);}
		finally{if(version===generation){busy=false;controls();}}
	}
	async function downloadVersion(item){
		if(busy)return;const version=generation;busy=true;controls();
		try{
			const response=await window.siteFetch(`/api/admin/invoice-editor/${item.id}/pdf`,{headers:{'x-admin-key':get('admin-key').value}});
			if(!response.ok)throw new Error(`Не удалось скачать версию (HTTP ${response.status}).`);
			const blob=await response.blob();if(version!==generation)return;
			const url=URL.createObjectURL(blob),link=node('a');
			link.href=url;link.download=`Arve_${current.invoice_number.replace(/\//g,'-')}_v${item.revision}.pdf`;link.click();
			setTimeout(()=>URL.revokeObjectURL(url),60000);message(`Версия ${item.revision} передана на скачивание.`);
		}catch(error){if(version===generation)message(error.message);}finally{if(version===generation){busy=false;controls();}}
	}
	form.addEventListener('submit',async event=>{
		event.preventDefault();if(!ready||busy||locked||(!pending&&!form.reportValidity()))return;
		const revised=Boolean(current);
		const version=generation;busy=true;controls();message('Сохраняем счет и PDF...');
		try{
			if(!pending){
				const data=draft(),total=totals(data.lines).gross;
				if(total<1||total>10000000)throw new Error('Сумма счета должна быть от 0,01 до 100 000 EUR.');
				pending={requestId:crypto.randomUUID(),previousId:current?.id||null,draft:data};
				sessionStorage.setItem(pendingKey,JSON.stringify(pending));
			}
			const result=await post('invoice-editor',pending);
			if(version!==generation)return;
			if(result.ok!==true||result.id!==pending.requestId)throw new Error('Сохранение не подтверждено. Повторите тот же запрос.');
			const saved=await adminRequest(`/api/admin/invoice-editor/${result.id}`);
			if(version!==generation)return;
			current=saved.invoice;pending=null;sessionStorage.removeItem(pendingKey);locked=true;dirty=false;fill(current.custom_data);
			await paymentStatus();if(version!==generation)return;
			get('invoice-editor-title').textContent=`Счет № ${current.invoice_number}`;
			await window.adminInvoiceList.refresh();if(version!==generation)return;
			if(revised){
				message('Новая версия счета сохранена. Подтвердите ее повторную отправку.');
				const sent=await window.adminInvoiceList.send(invoice(),true);
				if(version!==generation)return;
				message(sent
					? `Новая версия счета № ${current.invoice_number} сохранена и отправлена на ${current.email}.`
					: `Новая версия счета № ${current.invoice_number} сохранена, но не отправлена. ${get('invoice-list-status').textContent}`);
			}else message('Счет сохранен и заблокирован. Письмо не отправлялось.');
		}catch(error){
			if(version!==generation)return;
			if(error.status===400||error.status===409){pending=null;sessionStorage.removeItem(pendingKey);}
			message(error.message);
		}finally{if(version===generation){busy=false;controls();}}
	});
	get('invoice-editor-add').addEventListener('click',()=>open());
	get('invoice-editor-new').addEventListener('click',()=>open());
	get('invoice-editor-back').addEventListener('click',()=>{
		if(busy||!canLeave())return;
		editor.hidden=true;get('invoice-list-card').hidden=false;dirty=false;window.adminInvoiceList.refresh();
	});
	get('invoice-editor-edit').addEventListener('click',async()=>{
		if(busy||!locked)return;const version=generation;busy=true;controls();
		try{
			const registered=await loadCatalog();
			if(version!==generation)return;
			if(registered!==vatRegistered)throw new Error('С момента сохранения изменились настройки НДС. Создайте новый счет с актуальными настройками фирмы.');
			locked=false;message('Поля разблокированы. После сохранения прежний PDF останется в истории версий.');
		}catch(error){if(version===generation)message(error.message);}finally{if(version===generation){busy=false;controls();}}
	});
	for(const [key,action] of [['pdf','download'],['send','send'],['preview','preview'],['deliveries','deliveries'],['versions','versions']])
		get(`invoice-editor-${key}`).addEventListener('click',()=>savedAction(action));
	get('invoice-editor-paid').addEventListener('click',async()=>{
		if(busy||!current||pending||typeof current.invoice_paid!=='boolean')return;
		const version=generation;busy=true;controls();
		try{
			const result=await window.adminInvoiceList.paid(invoice());
			if(version!==generation)return;
			if(result)Object.assign(current,result);
			message(get('invoice-list-status').textContent);
		}finally{if(version===generation){busy=false;controls();}}
	});
	get('invoice-list-preview').addEventListener('close',()=>{if(!editor.hidden)controls();});
	get('invoice-editor-delete').addEventListener('click',async()=>{
		if(busy||!current||!canLeave())return;const version=generation;busy=true;controls();
		try{
			const removed=await window.adminInvoiceList.remove(invoice());if(version!==generation)return;
			if(removed){editor.hidden=true;get('invoice-list-card').hidden=false;dirty=false;current=null;}
			else message(get('invoice-list-status').textContent);
		}finally{if(version===generation){busy=false;controls();}}
	});
	for(const [key,text] of [['line-add',false],['text-add',true]])get(`invoice-editor-${key}`).addEventListener('click',()=>{
		if(items.length>=50){message('В одном счете можно добавить до 50 строк.');return;}items.push(blankLine(text));dirty=true;renderLines();
	});
	field('dueKind').addEventListener('change',updateDueKind);
	form.addEventListener('input',()=>{if(!locked&&!busy)dirty=true;});
	const dropdown=get('invoice-editor-client-dropdown');
	function showDropdown(show){
		dropdown.hidden=!show;field('name').setAttribute('aria-expanded',String(show));
		get('invoice-editor-client-toggle').setAttribute('aria-expanded',String(show));
	}
	function selectClient(client){
		selectedClient=client;
		field('name').value=client.name;field('email').value=client.email;field('phone').value=client.phone||'';field('address').value=client.billing_address||'';
		showClientAddress(client.billing_address||'');
		field('buyerType').value=client.buyer_type||'person';field('registrationCode').value=client.registration_code||'';
		field('reference').value=client.invoice_reference||'';
		get('invoice-editor-registration-field').hidden=field('buyerType').value!=='company';dirty=true;showDropdown(false);
	}
	async function searchClients(){
		const version=++searchVersion,term=field('name').value.trim(),box=get('invoice-editor-client-results');
		box.textContent='Поиск...';
		try{
			const result=await adminRequest(`/api/admin/clients?search=${encodeURIComponent(term)}`);
			if(version!==searchVersion||editor.hidden)return;
			if(!Array.isArray(result.clients))throw new Error('Не удалось загрузить клиентов.');
			box.replaceChildren();
			for(const client of result.clients){
				const button=node('button',`${client.name} · ${client.email}`);button.type='button';
				button.addEventListener('click',()=>selectClient(client));box.append(button);
			}
			if(!result.clients.length)box.textContent='Клиент не найден. Введите данные нового клиента ниже.';
			else if(result.more)box.append(node('p','Уточните поиск, чтобы найти остальных клиентов.'));
		}catch(error){if(version===searchVersion)box.textContent=error.message;}
	}
	field('name').addEventListener('input',()=>{selectedClient=null;showClientAddress('');showDropdown(true);clearTimeout(searchTimer);searchVersion++;searchTimer=setTimeout(searchClients,250);});
	field('name').addEventListener('focus',()=>{if(!locked&&!busy){showDropdown(true);searchClients();}});
	field('name').addEventListener('keydown',event=>{
		if(event.key==='Escape'){event.preventDefault();showDropdown(false);}
		if(event.key==='ArrowDown'){event.preventDefault();showDropdown(true);dropdown.querySelector('button')?.focus();}
	});
	get('invoice-editor-client-toggle').addEventListener('click',()=>{showDropdown(dropdown.hidden);if(!dropdown.hidden)searchClients();});
	document.addEventListener('click',event=>{if(!event.target.closest('.invoice-editor-client-picker'))showDropdown(false);});
	const clientDialog=get('invoice-editor-client'),clientForm=get('invoice-editor-client-form');
	let clientType='person',editingClientEmail=null;
	const clientField=name=>clientForm.elements.namedItem(name);
	function setClientType(type){
		clientType=type;
		clientDialog.querySelectorAll('[data-buyer-type]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.buyerType===type));});
		get('invoice-editor-client-registration').hidden=type!=='company';
		get('invoice-editor-client-name-label').textContent=type==='company'?'Название фирмы':'Имя и фамилия';
	}
	async function openClient(edit=false){
		if(edit&&field('email').value.trim()&&selectedClient?.email!==field('email').value.trim().toLowerCase()){
			const version=generation;
			busy=true;controls();
			try{
				const result=await adminRequest(`/api/admin/clients?search=${encodeURIComponent(field('email').value.trim())}`);
				if(version!==generation)return;
				if(!Array.isArray(result.clients))throw new Error('Не удалось загрузить данные клиента.');
				selectedClient=result.clients.find(client=>client.email===field('email').value.trim().toLowerCase())||null;
			}catch(error){if(version===generation)message(error.message);return;}
			finally{if(version===generation){busy=false;controls();}}
		}
		clientForm.reset();editingClientEmail=edit?selectedClient?.email||null:null;
		clientField('email').readOnly=Boolean(editingClientEmail);
		setClientType(edit?field('buyerType').value:'person');
		if(edit)for(const key of ['name','email','address','phone','registrationCode','reference'])clientField(key).value=field(key).value;
		get('invoice-editor-client-title').textContent=editingClientEmail?'Данные клиента':'Новый клиент';
		get('invoice-editor-client-status').textContent='';
		showDropdown(false);clientDialog.showModal();
	}
	clientDialog.querySelectorAll('[data-buyer-type]').forEach(button=>button.addEventListener('click',()=>setClientType(button.dataset.buyerType)));
	get('invoice-editor-client-new').addEventListener('click',()=>openClient());
	get('invoice-editor-client-edit').addEventListener('click',()=>openClient(true));
	get('invoice-editor-client-close').addEventListener('click',()=>clientDialog.close());
	clientForm.addEventListener('submit',async event=>{
		event.preventDefault();if(busy||!clientForm.reportValidity())return;
		const client=Object.fromEntries(['name','email','address','phone','reference'].map(key=>[key,clientField(key).value.trim()]));
		client.buyerType=clientType;client.registrationCode=clientType==='company'?clientField('registrationCode').value.trim():'';
		const version=generation;busy=true;clientForm.querySelectorAll('input,button').forEach(el=>{el.disabled=true;});
		try{
			const result=await post('invoice-editor/clients',{client,existingEmail:editingClientEmail});
			if(version!==generation)return;
			if(result.ok!==true||!result.client)throw new Error('Сохранение клиента не подтверждено.');
			selectClient(result.client);clientDialog.close();message('Клиент сохранен в базе и выбран для счета.');
		}catch(error){if(version===generation)get('invoice-editor-client-status').textContent=error.message;}
		finally{if(version===generation){busy=false;clientForm.querySelectorAll('input,button').forEach(el=>{el.disabled=false;});controls();}}
	});
	const productDialog=get('invoice-editor-product'),productForm=get('invoice-editor-product-form');
	let editingArticle=null,productRow=null;
	function openProduct(index=null,create=false){
		if(locked||busy||pending)return;
		const line=index===null?null:items[index],product=create?null:catalog.find(value=>value.article===line?.article);
		if(product&&['001','002','003'].includes(product.article))return;
		editingArticle=product?.article||null;productRow=index;
		productForm.reset();
		const value=product||(create?null:line);
		if(value){
			for(const key of ['article','name','unit'])productForm.elements.namedItem(key).value=value[key];
			productForm.elements.namedItem('price').value=String((product?.price_cents??line.priceCents)/100);
		}
		get('invoice-editor-product-title').textContent=editingArticle?'Изменить артикул':'Добавить артикул';
		get('invoice-editor-product-delete').hidden=!editingArticle;
		get('invoice-editor-product-status').textContent='';
		productDialog.showModal();
	}
	get('invoice-editor-product-add').addEventListener('click',()=>openProduct());
	get('invoice-editor-product-close').addEventListener('click',()=>productDialog.close());
	productDialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
	function productControls(disabled){
		productForm.querySelectorAll('input,button').forEach(el=>{el.disabled=disabled;});
		controls();
	}
	productForm.addEventListener('submit',async event=>{
		event.preventDefault();if(busy||!productForm.reportValidity())return;
		const read=name=>productForm.elements.namedItem(name).value.trim();
		const product={article:read('article'),name:read('name'),unit:read('unit'),price_cents:Math.round(Number(read('price'))*100)};
		const version=generation;busy=true;productControls(true);
		try{
			const result=await post('invoice-editor/products',{...product,...(editingArticle?{originalArticle:editingArticle}:{})});if(version!==generation)return;
			if(result.ok!==true)throw new Error('Сохранение товара не подтверждено.');
			if(editingArticle)catalog=catalog.map(value=>value.article===editingArticle?product:value);
			else catalog.push(product);
			const update=line=>Object.assign(line,{article:product.article,name:product.name,unit:product.unit,priceCents:product.price_cents});
			if(editingArticle)items.filter(line=>!line.text&&line.article===editingArticle).forEach(update);
			else if(productRow!==null)update(items[productRow]);
			else if(items.length<50)items.push(update(blankLine()));
			dirty=true;
			productDialog.close();renderLines();
		}catch(error){if(version===generation)get('invoice-editor-product-status').textContent=error.message;}
		finally{if(version===generation){busy=false;productControls(false);}}
	});
	get('invoice-editor-product-delete').addEventListener('click',async()=>{
		if(busy||!editingArticle||!confirm('Удалить артикул из справочника? Строки в текущем счете останутся как свои услуги, сохраненные счета не изменятся.'))return;
		const version=generation;busy=true;productControls(true);
		try{
			const result=await post('invoice-editor/products/delete',{article:editingArticle});if(version!==generation)return;
			if(result.ok!==true)throw new Error('Удаление артикула не подтверждено.');
			catalog=catalog.filter(value=>value.article!==editingArticle);
			items.filter(line=>!line.text&&line.article===editingArticle).forEach(line=>{line.article='';});
			dirty=true;productDialog.close();renderLines();
		}catch(error){if(version===generation)get('invoice-editor-product-status').textContent=error.message;}
		finally{if(version===generation){busy=false;productControls(false);}}
	});
	window.addEventListener('beforeunload',event=>{if(dirty||pending){event.preventDefault();event.returnValue='';}});
	document.addEventListener('admin-logout',()=>{
		generation++;searchVersion++;clearTimeout(searchTimer);sessionStorage.removeItem(pendingKey);
		current=null;items=[];pending=null;dirty=false;busy=false;editor.hidden=true;get('invoice-list-card').hidden=false;
		form.reset();lines.replaceChildren();catalog=[];get('invoice-editor-client-results').replaceChildren();get('invoice-editor-version-list').replaceChildren();
		if(productDialog.open)productDialog.close();
		if(clientDialog.open)clientDialog.close();clientForm.reset();selectedClient=null;ready=false;showDropdown(false);
		for(const modal of [clientForm,productForm])modal.querySelectorAll('input,button').forEach(el=>{el.disabled=false;});
	});
	window.adminInvoiceEditor={open,openManual,totals};
})();
