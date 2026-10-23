(() => {
	const get=id=>document.getElementById(id);
	const form=get('invoice-settings-form'),emailForm=get('invoice-email-form'),productsForm=get('invoice-products-form');
	const fields=['name','address','registration_code','phone','email','website','bank','swift','iban'];
	const vat=form.elements.namedItem('vatRegistered'),vatNumber=form.elements.namedItem('vatNumber');
	const gross=get('invoice-calculator-gross'),theme=get('invoice-theme');
	const themeOptions=[...theme.querySelectorAll('input[type="radio"]')];
	const selectedTheme=()=>themeOptions.find(option=>option.checked).value;
	const sections=['list','company','design','products','email','automatic'],blocks=['estonian','russian','signature'];
	const editors=blocks.map(key=>get(`invoice-email-${key}`));
	const emailSource=get('invoice-email-source'),emailLanguage=get('invoice-email-language');
	const formatButtons=[...get('invoice-email-toolbar').querySelectorAll('[data-format]')];
	let originalEmail=null,customEmail=null,selectedEmailSource='original',emailSelection=null;
	let generation=0,loaded=false,loading=false,active='company',savedCompany=null,savedDesign=null,draftLogo='default',replyTo='';
	let logoSelection=0,logoBusy=false,designBusy=false,companyBusy=false,emailBusy=false,activeEditor=null;
	let previewVersion=0,previewTimer;
	let productsBusy=false,savedProducts=null;
	const editingProducts=new Set();
	const readProduct=key=>({
		name:productsForm.elements.namedItem(`${key}Name`).value.trim(),
		article:productsForm.elements.namedItem(`${key}Article`).value.trim(),
	});
	const showProducts=products=>{
		for(const key of ['single','five','ten']){
			productsForm.elements.namedItem(`${key}Name`).value=products[key].name;
			productsForm.elements.namedItem(`${key}Article`).value=products[key].article;
		}
	};
	function showProductPrices(prices){
		if(!prices||!['single','five','ten'].every(key=>Number.isSafeInteger(prices[key])&&prices[key]>=0))throw new Error('Не удалось прочитать цены товаров.');
		for(const key of ['single','five','ten']){
			const input=productsForm.elements.namedItem(`${key}Price`);
			input.value=new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}).format(prices[key]/100);
			input.disabled=true;
		}
	}
	const status=(id,message)=>{get(id).textContent=message;};
	const post=(path,input)=>adminRequest(`/api/admin/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
	const confirmSaved=result=>{if(result.ok!==true)throw new Error('Сервер не подтвердил сохранение.');};
	const company=()=>({
		issuer:Object.fromEntries(fields.map(key=>[key,form.elements.namedItem(key).value.trim()])),
		vatRegistered:vat.checked,vatNumber:vat.checked?vatNumber.value.trim().toUpperCase():'',
	});
	function controls(){
		productsForm.querySelectorAll('input,button').forEach(el=>{el.disabled=!loaded||productsBusy;});
		for(const key of ['single','five','ten']){
			const editing=editingProducts.has(key),card=get(`invoice-product-${key}-title`).closest('article');
			card.dataset.locked=String(!editing);
			for(const suffix of ['Name','Article'])productsForm.elements.namedItem(`${key}${suffix}`).disabled=!loaded||productsBusy||!editing;
			productsForm.elements.namedItem(`${key}Price`).disabled=true;
			get(`invoice-product-${key}-edit`).hidden=editing;
			get(`invoice-product-${key}-cancel`).hidden=!editing;
			card.querySelector('[type="submit"]').hidden=!editing;
		}
		form.querySelectorAll('input,textarea,button').forEach(el=>{el.disabled=!loaded||companyBusy;});
		vatNumber.disabled=!loaded||companyBusy||!vat.checked;
		theme.disabled=!loaded||designBusy;
		get('invoice-logo-file').disabled=!loaded||designBusy||logoBusy;
		get('invoice-logo-reset').disabled=!loaded||designBusy||logoBusy;
		get('invoice-logo-remove').disabled=!loaded||designBusy||logoBusy;
		get('invoice-design-save').disabled=!loaded||designBusy;
		get('invoice-logo-save').disabled=!loaded||designBusy||logoBusy;
		emailForm.querySelectorAll('input,button,select').forEach(el=>{el.disabled=!loaded||emailBusy;});
		const editable=loaded&&!emailBusy&&selectedEmailSource==='custom';
		get('invoice-email-subject').disabled=!editable;
		formatButtons.forEach(button=>{button.disabled=!editable;});
		editors.forEach(editor=>{editor.contentEditable=String(editable);});
	}
	function calculate(){
		get('invoice-vat-number-field').hidden=!vat.checked;
		vatNumber.required=vat.checked;
		vatNumber.disabled=!loaded||companyBusy||!vat.checked;
		if(!gross.validity.valid){status('invoice-calculator-result','Укажите корректную конечную цену.');return;}
		const cents=Math.round(Number(gross.value)*100),net=vat.checked?Math.round(cents*100/124):cents;
		const money=window.servicePricing.money;
		status('invoice-calculator-result',vat.checked
			?`Без НДС: ${money(net)}. Käibemaks 24%: ${money(cents-net)}. Итого для клиента: ${money(cents)}.`
			:`Без НДС. Итого для клиента: ${money(cents)}.`);
	}
	function showLogo(){
		const preview=get('invoice-logo-preview');
		preview.hidden=draftLogo===null;
		if(draftLogo===null)preview.removeAttribute('src');
		else preview.src=draftLogo==='default'?'images/logo.png':draftLogo;
	}
	function clearPreview(){
		clearTimeout(previewTimer);previewVersion++;
		for(const key of ['company','design'])get(`invoice-${key}-preview`).replaceChildren();
	}
	function schedulePreview(){
		clearTimeout(previewTimer);
		const version=++previewVersion,current=generation,panel=active;
		if(!loaded||!['company','design'].includes(panel))return;
		status(`invoice-${panel}-preview-status`,'Обновляем PDF...');
		previewTimer=setTimeout(async()=>{
			try{
				if(!gross.validity.valid)throw new Error('Для образца укажите корректную конечную цену.');
				const details=panel==='company'?company():savedCompany;
				const design=panel==='design'?{theme:selectedTheme(),logo:draftLogo}:savedDesign;
				const result=await post('invoice-preview',{...details,...design,product:savedProducts.five,sessions:5,priceCents:Math.round(Number(gross.value)*100)});
				if(current!==generation||version!==previewVersion)return;
				if(result.ok!==true||typeof result.pdf!=='string'||!result.pdf.startsWith('JVBERi0'))throw new Error('Не удалось прочитать PDF предпросмотра.');
				const bytes=Uint8Array.from(atob(result.pdf),char=>char.charCodeAt(0));
				const pdfjs=await import('./vendor/pdfjs/pdf.mjs');
				pdfjs.GlobalWorkerOptions.workerSrc=new URL('vendor/pdfjs/pdf.worker.mjs',location.href).href;
				const loadingTask=pdfjs.getDocument({data:bytes,isEvalSupported:false});
				try{
					const pdf=await loadingTask.promise;
					const container=get(`invoice-${panel}-preview`),canvases=[];
					for(let index=1;index<=pdf.numPages;index++){
						if(current!==generation||version!==previewVersion)return;
						const page=await pdf.getPage(index);
						const viewport=page.getViewport({scale:Math.max(600,container.clientWidth)*Math.min(devicePixelRatio||1,2)/page.getViewport({scale:1}).width});
						const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
						const context=canvas.getContext('2d');
						if(!context)throw new Error('Браузер не поддерживает отображение PDF.');
						await page.render({canvasContext:context,viewport}).promise;canvases.push(canvas);
					}
					if(current!==generation||version!==previewVersion)return;
					container.replaceChildren(...canvases);
					status(`invoice-${panel}-preview-status`,'Предпросмотр актуален. Изменения еще не применены, если вы не нажали кнопку сохранения.');
				}finally{await loadingTask.destroy();}
			}catch(error){
				if(current===generation&&version===previewVersion){
					get(`invoice-${panel}-preview`).replaceChildren();
					status(`invoice-${panel}-preview-status`,error.message);
				}
			}
		},500);
	}
	function selectTab(key){
		active=key;
		window.adminNavigation.write('invoice',key);
		for(const name of sections){
			const selected=name===key,tab=get(`invoice-tab-${name}`);
			tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;
			get(`invoice-panel-${name}`).hidden=!selected;
		}
		clearPreview();schedulePreview();
		if(key==='list')window.adminInvoiceList.load();
		else if(key==='automatic')window.adminAutoInvoices?.load();
		else if(!loaded)load();
	}
	for(const [index,key] of sections.entries()){
		const tab=get(`invoice-tab-${key}`);
		tab.addEventListener('click',()=>selectTab(key));
		tab.addEventListener('keydown',event=>{
			const target=event.key==='ArrowRight'?(index+1)%sections.length:event.key==='ArrowLeft'?(index+sections.length-1)%sections.length:
				event.key==='Home'?0:event.key==='End'?sections.length-1:null;
			if(target===null)return;
			event.preventDefault();selectTab(sections[target]);get(`invoice-tab-${sections[target]}`).focus();
		});
	}
	for(const key of ['single','five','ten']){
		get(`invoice-product-${key}-edit`).addEventListener('click',()=>{
			if(!loaded||productsBusy)return;
			editingProducts.add(key);status(`invoice-product-${key}-status`,'');controls();
			productsForm.elements.namedItem(`${key}Name`).focus();
		});
		get(`invoice-product-${key}-cancel`).addEventListener('click',()=>{
			if(!loaded||productsBusy)return;
			productsForm.elements.namedItem(`${key}Name`).value=savedProducts[key].name;
			productsForm.elements.namedItem(`${key}Article`).value=savedProducts[key].article;
			editingProducts.delete(key);status(`invoice-product-${key}-status`,'');controls();
		});
	}
	productsForm.addEventListener('submit',async event=>{
		event.preventDefault();if(!loaded||productsBusy)return;
		const key=event.submitter?.dataset.product;
		if(!['single','five','ten'].includes(key)||!editingProducts.has(key))return;
		for(const suffix of ['Name','Article'])if(!productsForm.elements.namedItem(`${key}${suffix}`).reportValidity())return;
		const current=generation,product=readProduct(key),statusId=`invoice-product-${key}-status`;
		productsBusy=true;controls();status(statusId,'Сохраняем товар...');
		try{
			confirmSaved(await post('invoice-products',{key,product}));
			if(current!==generation)return;
			savedProducts={...savedProducts,[key]:product};
			editingProducts.delete(key);
			for(const field of ['name','article'])productsForm.elements.namedItem(`${key}${field==='name'?'Name':'Article'}`).value=product[field];
			status(statusId,'Товар сохранен. Изменения применятся к новым счетам.');
		}catch(error){if(current===generation)status(statusId,error.message);}
		finally{if(current===generation){productsBusy=false;controls();}}
	});
	form.addEventListener('input',()=>{calculate();schedulePreview();});
	form.addEventListener('change',()=>{calculate();schedulePreview();});
	form.addEventListener('submit',async event=>{
		event.preventDefault();if(!loaded||companyBusy)return;
		const current=generation,input=company();
		input.issuer.iban=input.issuer.iban.replace(/\s/g,'').toUpperCase();input.issuer.swift=input.issuer.swift.toUpperCase();
		companyBusy=true;controls();status('invoice-settings-status','Сохраняем реквизиты...');
		try{
			confirmSaved(await post('invoice-settings',input));
			if(current!==generation)return;
			savedCompany=input;
			for(const key of fields)form.elements.namedItem(key).value=input.issuer[key];
			vatNumber.value=input.vatNumber;
			status('invoice-settings-status','Реквизиты сохранены для новых заказов. Старые счета не изменены.');
			schedulePreview();
		}catch(error){if(current===generation)status('invoice-settings-status',error.message);}
		finally{if(current===generation){companyBusy=false;controls();calculate();}}
	});
	theme.addEventListener('change',schedulePreview);
	get('invoice-logo-file').addEventListener('change',async event=>{
		const file=event.target.files[0],current=generation,selection=++logoSelection;
		if(!file)return;
		logoBusy=true;controls();status('invoice-logo-status','Подготавливаем логотип...');
		try{
			const png=await window.siteLogo.prepareImage(file);
			if(current!==generation||selection!==logoSelection)return;
			draftLogo=png;showLogo();schedulePreview();
			status('invoice-logo-status','Логотип выбран. Нажмите «Применить», чтобы сохранить оформление.');
		}catch(error){if(current===generation&&selection===logoSelection)status('invoice-logo-status',error.message);}
		finally{if(current===generation&&selection===logoSelection){logoBusy=false;controls();}}
	});
	for(const [id,value] of [['invoice-logo-remove',null],['invoice-logo-reset','default']]){
		get(id).addEventListener('click',()=>{
			draftLogo=value;get('invoice-logo-file').value='';showLogo();schedulePreview();
			status('invoice-logo-status','Изменен только предпросмотр. Для сохранения нажмите «Применить».');
		});
	}
	get('invoice-logo-preview').addEventListener('error',()=>status('invoice-logo-status','Не удалось отобразить логотип.'));
	async function saveDesign(part){
		if(!loaded||designBusy||(part==='logo'&&logoBusy))return;
		const current=generation,input=part==='theme'
			?{theme:selectedTheme(),logo:savedDesign.logo}
			:{theme:savedDesign.theme,logo:draftLogo};
		const statusId=part==='theme'?'invoice-design-status':'invoice-logo-status';
		designBusy=true;controls();status(statusId,'Применяем...');
		try{
			confirmSaved(await post('invoice-design',input));
			if(current!==generation)return;
			savedDesign=input;
			status(statusId,`${part==='theme'?'Палитра применена':'Логотип применен'} к новым заказам. Старые счета не изменены.`);
		}catch(error){if(current===generation)status(statusId,error.message);}
		finally{if(current===generation){designBusy=false;controls();}}
	}
	get('invoice-design-save').addEventListener('click',()=>saveDesign('theme'));
	get('invoice-logo-save').addEventListener('click',()=>saveDesign('logo'));
	function readRuns(editor){
		const runs=[];
		const append=(text,format={bold:false,italic:false,underline:false})=>{
			if(!text)return;
			const previous=runs[runs.length-1];
			if(previous&&['bold','italic','underline'].every(key=>previous[key]===format[key]))previous.text+=text;
			else runs.push({text,...format});
		};
		const endsWithNewline=()=>runs.length&&runs[runs.length-1].text.endsWith('\n');
		function walk(node,format={bold:false,italic:false,underline:false}){
			if(node.nodeType===Node.TEXT_NODE){append(node.textContent,format);return;}
			if(node.nodeType!==Node.ELEMENT_NODE)return;
			const block=['DIV','P'].includes(node.tagName);
			if(block&&runs.length&&!endsWithNewline())append('\n');
			if(node.tagName==='BR'){append('\n',format);return;}
			const weight=node.style.fontWeight;
			const fontStyle=node.style.fontStyle;
			const decoration=node.style.textDecorationLine||node.style.textDecoration;
			const next={
				bold:weight?weight==='bold'||Number(weight)>=600:format.bold||['B','STRONG'].includes(node.tagName),
				italic:fontStyle?['italic','oblique'].includes(fontStyle):format.italic||['I','EM'].includes(node.tagName),
				underline:decoration?decoration.includes('underline'):format.underline||node.tagName==='U',
			};
			for(const child of node.childNodes)walk(child,next);
			if(block&&node.nextSibling&&!endsWithNewline())append('\n');
		}
		for(const child of editor.childNodes)walk(child);
		return runs.length?runs:[{text:'',bold:false,italic:false,underline:false}];
	}
	const readEmail=()=>({subject:get('invoice-email-subject').value,
		...Object.fromEntries(blocks.map((key,index)=>[key,readRuns(editors[index])]))});
	function fillEditor(editor,runs){
		editor.replaceChildren();
		for(const run of runs){
			const element=document.createElement('span');
			element.style.fontWeight=run.bold?'700':'400';
			element.style.fontStyle=run.italic?'italic':'normal';
			element.style.textDecoration=run.underline?'underline':'none';
			element.textContent=run.text;editor.append(element);
		}
	}
	function showEmail(template){
		get('invoice-email-subject').value=template.subject;
		blocks.forEach((key,index)=>fillEditor(editors[index],template[key]));
		status('invoice-email-source-help',selectedEmailSource==='original'
			?'Исходный шаблон защищен от изменений. Для редактирования выберите «Мое письмо».'
			:'Редактируйте свой вариант. Исходный шаблон всегда остается доступным, даже после сохранения другого текста.');
		activeEditor=null;emailSelection=null;updateFormatButtons();controls();emailPreview();
	}
	function languageBlocks(){
		return emailLanguage.value==='both'?blocks:[emailLanguage.value,'signature'];
	}
	function emailPreview(){
		const template=readEmail(),values={sessions:'5',invoice_number:'211026',email:replyTo,name:'Пример клиента'};
		const substitute=text=>text.replace(/\{\{(sessions|invoice_number|email|name)\}\}/g,(_,key)=>values[key]);
		get('invoice-email-preview-subject').textContent=substitute(template.subject);
		const preview=get('invoice-email-preview');preview.replaceChildren();
		const visible=languageBlocks();
		for(const key of ['estonian','russian']){
			get(`invoice-email-${key}-label`).hidden=!visible.includes(key);
			get(`invoice-email-${key}`).hidden=!visible.includes(key);
		}
		for(const key of visible){
			if(key==='russian'&&emailLanguage.value==='both')preview.append(document.createElement('hr'));
			const paragraph=document.createElement('p');
			for(const run of template[key]){
				const element=document.createElement(run.bold?'strong':'span');
				element.style.fontStyle=run.italic?'italic':'normal';
				element.style.textDecoration=run.underline?'underline':'none';
				element.textContent=substitute(run.text);paragraph.append(element);
			}
			preview.append(paragraph);
		}
	}
	for(const editor of editors){
		editor.addEventListener('focus',()=>{activeEditor=editor;});
		editor.addEventListener('input',()=>{emailPreview();rememberEmailSelection();});
		editor.addEventListener('paste',event=>{
			event.preventDefault();
			document.execCommand('insertText',false,event.clipboardData.getData('text/plain'));emailPreview();
		});
		editor.addEventListener('drop',event=>event.preventDefault());
	}
	function updateFormatButtons(){
		for(const button of formatButtons)button.setAttribute('aria-pressed',String(Boolean(
			selectedEmailSource==='custom'&&activeEditor&&document.queryCommandState(button.dataset.format))));
	}
	function rememberEmailSelection(){
		const selection=window.getSelection();
		if(!loaded||emailBusy||selectedEmailSource!=='custom'||!selection||!selection.rangeCount)return;
		const editor=editors.find(element=>element.contains(selection.anchorNode)&&element.contains(selection.focusNode));
		if(editor&&!editor.hidden){
			activeEditor=editor;emailSelection=selection.getRangeAt(0).cloneRange();updateFormatButtons();
		}
	}
	document.addEventListener('selectionchange',rememberEmailSelection);
	for(const button of formatButtons){
		button.addEventListener('mousedown',event=>event.preventDefault());
		button.addEventListener('click',()=>{
			if(!loaded||emailBusy||selectedEmailSource!=='custom')return;
			if(!activeEditor||activeEditor.hidden||!emailSelection){
				status('invoice-email-status','Поставьте курсор или выделите текст в нужном блоке письма.');return;
			}
			const selection=window.getSelection();
			const range=selection.rangeCount?selection.getRangeAt(0):null;
			const sameRange=range&&range.startContainer===emailSelection.startContainer&&range.startOffset===emailSelection.startOffset&&
				range.endContainer===emailSelection.endContainer&&range.endOffset===emailSelection.endOffset;
			if(document.activeElement!==activeEditor)activeEditor.focus({preventScroll:true});
			if(!sameRange){selection.removeAllRanges();selection.addRange(emailSelection);}
			document.execCommand(button.dataset.format);rememberEmailSelection();emailPreview();
		});
	}
	emailSource.addEventListener('change',()=>{
		if(selectedEmailSource==='custom')customEmail=readEmail();
		selectedEmailSource=emailSource.value;
		showEmail(selectedEmailSource==='original'?originalEmail:customEmail);
		status('invoice-email-status','Шаблон выбран для предпросмотра. Нажмите «Сохранить письмо», чтобы использовать его при отправке.');
	});
	emailLanguage.addEventListener('change',()=>{
		activeEditor=null;emailSelection=null;updateFormatButtons();emailPreview();
		status('invoice-email-status','Язык изменен только в предпросмотре. Для применения нажмите «Сохранить письмо».');
	});
	get('invoice-email-restore').addEventListener('click',()=>{
		if(!loaded||emailBusy||!confirm('Восстановить исходный текст в «Моем письме»? Текущий редактируемый вариант будет заменен после сохранения.'))return;
		customEmail=structuredClone(originalEmail);selectedEmailSource='custom';emailSource.value='custom';
		showEmail(customEmail);
		status('invoice-email-source-help','Восстановлена редактируемая копия исходного письма.');
		status('invoice-email-status','Исходное письмо восстановлено в предпросмотре. Для применения нажмите «Сохранить письмо».');
	});
	get('invoice-email-subject').addEventListener('input',emailPreview);
	emailForm.addEventListener('submit',async event=>{
		event.preventDefault();if(!loaded||emailBusy)return;
		const current=generation,template=readEmail(),source=selectedEmailSource,language=emailLanguage.value;
		emailBusy=true;controls();status('invoice-email-status','Сохраняем письмо...');
		try{
			confirmSaved(await post('invoice-email',{template,source,language}));
			if(current===generation){
				if(source==='custom')customEmail=template;
				status('invoice-email-status','Шаблон и язык сохранены для новых отправок. Уже подготовленные письма не изменены.');
			}
		}catch(error){if(current===generation)status('invoice-email-status',error.message);}
		finally{if(current===generation){emailBusy=false;controls();}}
	});
	async function load(){
		if(get('admin-workspace').hidden)return;
		if(active==='list'){window.adminInvoiceList.load();return;}
		if(active==='automatic'){window.adminAutoInvoices?.load();return;}
		if(loaded||loading)return;
		const current=++generation;loading=true;controls();status('invoice-settings-status','Загружаем настройки счета...');
		status('invoice-products-status','Загружаем товары...');
		try{
			const [details,design,email,productSettings,priceSettings]=await Promise.all(['invoice-settings','invoice-design','invoice-email','invoice-products','prices'].map(path=>adminRequest(`/api/admin/${path}`)));
			if(current!==generation)return;
			if(!productSettings.products||!['single','five','ten'].every(key=>productSettings.products[key]&&
				['name','article'].every(field=>typeof productSettings.products[key][field]==='string'))||
				!details.issuer||!fields.every(key=>typeof details.issuer[key]==='string')||
				typeof details.vatRegistered!=='boolean'||typeof details.vatNumber!=='string'||
				!['beige','green','blue','purple'].includes(design.theme)||!(design.logo===null||typeof design.logo==='string')||
				!email.template||typeof email.replyTo!=='string'||!['original','custom'].includes(email.source)||
				!['both','estonian','russian'].includes(email.language)||
				![email.original,email.custom].every(template=>template&&blocks.every(key=>Array.isArray(template[key]))))throw new Error('Не удалось прочитать настройки счета.');
			savedCompany=details;savedDesign=design;draftLogo=design.logo;replyTo=email.replyTo;
			savedProducts=productSettings.products;showProducts(savedProducts);showProductPrices(priceSettings.prices);
			for(const key of fields)form.elements.namedItem(key).value=details.issuer[key];
			vat.checked=details.vatRegistered;vatNumber.value=details.vatNumber;
			themeOptions.forEach(option=>{option.checked=option.value===design.theme;});
			originalEmail=email.original;customEmail=email.custom;selectedEmailSource=email.source;
			emailSource.value=email.source;emailLanguage.value=email.language;
			loaded=true;showEmail(email.source==='original'?originalEmail:customEmail);showLogo();calculate();schedulePreview();
			status('invoice-settings-status','');
			status('invoice-products-status','');
		}catch(error){if(current===generation){status('invoice-settings-status',error.message);status('invoice-products-status',error.message);}}
		finally{if(current===generation){loading=false;controls();}}
	}
	document.addEventListener('admin-login',()=>{if(!get('invoices-section').hidden)load();});
	document.addEventListener('admin-prices-changed',event=>{if(loaded)showProductPrices(event.detail);});
	document.addEventListener('admin-logout',()=>{
		generation++;logoSelection++;loaded=false;loading=false;logoBusy=false;designBusy=false;companyBusy=false;emailBusy=false;productsBusy=false;savedProducts=null;
		savedCompany=null;savedDesign=null;draftLogo='default';activeEditor=null;replyTo='';
		originalEmail=null;customEmail=null;selectedEmailSource='original';emailSelection=null;
		form.reset();emailForm.reset();productsForm.reset();editors.forEach(editor=>editor.replaceChildren());
		editingProducts.clear();
		for(const key of ['single','five','ten'])status(`invoice-product-${key}-status`,'');
		get('invoice-email-preview').replaceChildren();get('invoice-email-preview-subject').textContent='';
		get('invoice-logo-file').value='';clearPreview();showLogo();controls();calculate();
		for(const id of ['invoice-settings-status','invoice-design-status','invoice-products-status','invoice-email-status','invoice-logo-status',
			'invoice-company-preview-status','invoice-design-preview-status'])status(id,'');
	});
	window.adminInvoices={load};
	window.emailEditor={readRuns,fillEditor};
	selectTab(window.adminNavigation.read('invoice',sections,'list'));
	controls();calculate();
})();
