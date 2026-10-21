(() => {
	const original='images/logo.png';
	const validate=image=>{
		if(image!==null&&(typeof image!=='string'||image.length>699073||!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(image))){
			throw new Error('Сервер вернул некорректный логотип.');
		}
		return image;
	};
	async function prepareImage(image){
		if(!['image/png','image/jpeg','image/webp'].includes(image.type)||image.size>5*1024*1024){
			throw new Error('Выберите PNG, JPEG или WebP размером до 5 МБ.');
		}
		const bitmap=await createImageBitmap(image);
		try{
			if(bitmap.width>8192||bitmap.height>8192)throw new Error('Размер исходного изображения не должен превышать 8192 x 8192 пикселей.');
			const scale=Math.min(1,512/bitmap.width,512/bitmap.height),canvas=document.createElement('canvas');
			canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
			const context=canvas.getContext('2d');
			if(!context)throw new Error('Браузер не поддерживает подготовку изображения.');
			context.drawImage(bitmap,0,0,canvas.width,canvas.height);
			const prepared=canvas.toDataURL('image/png');
			if(prepared.length>699073)throw new Error('Изображение слишком сложное. Выберите более простой логотип, до 512 КБ после обработки.');
			return validate(prepared);
		}finally{bitmap.close();}
	}
	const targets=[...document.querySelectorAll('.brand-lockup img, .footer-brand img')];
	const apply=image=>targets.forEach(target=>{target.src=image||original;});
	const file=document.getElementById('logo-file');
	if(!file){
		if(!targets.length)return;
		const status=document.createElement('p'),message=document.createElement('span'),retry=document.createElement('button');
		status.setAttribute('role','status');status.hidden=true;retry.type='button';retry.textContent='Повторить';
		status.append(message,' ',retry);document.querySelector('.footer-content').after(status);
		const load=async()=>{
			retry.disabled=true;
			try{
				const response=await window.siteFetch('/api/site-logo'),result=await response.json();
				if(!response.ok)throw new Error(result.error||'Не удалось загрузить логотип.');
				apply(validate(result.image));status.hidden=true;
			}catch(error){message.textContent=`${error.message} Показан исходный логотип.`;status.hidden=false;}
			finally{retry.disabled=false;}
		};
		for(const target of targets)target.addEventListener('error',()=>{
			message.textContent='Не удалось отобразить логотип. Повторите загрузку.';status.hidden=false;
		});
		retry.addEventListener('click',load);load();return;
	}
	function editor(prefix,invoice=false){
	const file=document.getElementById(`${prefix}-file`),preview=document.getElementById(`${prefix}-preview`),save=document.getElementById(`${prefix}-save`),
		reset=document.getElementById(`${prefix}-reset`),status=document.getElementById(`${prefix}-status`),
		remove=invoice?document.getElementById(`${prefix}-remove`):null;
	const endpoint=invoice?'/api/admin/invoice-logo':'/api/admin/site-logo',initial=invoice?'default':null;
	const validateImage=image=>invoice&&image==='default'?image:validate(image);
	let generation=0,selection=0,loaded=false,busy=false,pending=null,saved=null;
	const controls=()=>{
		file.disabled=!loaded||busy;save.disabled=!loaded||busy||pending===null;
		reset.disabled=!loaded||busy||saved===null;
		if(invoice){reset.disabled=!loaded||busy||saved==='default';remove.disabled=!loaded||busy||saved===null;}
	};
	const show=image=>{
		preview.hidden=invoice&&image===null;
		if(preview.hidden)preview.removeAttribute('src');
		else preview.src=image==='default'?original:image||original;
	};
	preview.addEventListener('error',()=>{status.textContent='Не удалось отобразить предпросмотр логотипа.';});
	async function loadAdmin(){
		const current=++generation;selection++;loaded=false;busy=false;pending=null;saved=initial;file.value='';show(initial);controls();
		status.textContent='Загружаем логотип...';
		try{
			const result=await adminRequest(endpoint);
			if(current!==generation)return;
			saved=validateImage(result.image);show(saved);loaded=true;status.textContent=invoice&&saved===null?'Логотип отключен. Новые PDF-счета будут без логотипа.':'';
		}catch(error){if(current===generation)status.textContent=error.message;}
		finally{if(current===generation)controls();}
	}
	file.addEventListener('change',async()=>{
		const current=generation,chosen=++selection,image=file.files[0];pending=null;show(saved);
		if(!image){controls();return;}
		busy=true;controls();status.textContent='Подготавливаем изображение...';
		try{
			const prepared=await prepareImage(image);
			if(current!==generation||chosen!==selection)return;
			pending=prepared;show(pending);status.textContent=invoice
				?'Предпросмотр готов. Нажмите «Сохранить логотип», чтобы использовать его в новых PDF-счетах.'
				:'Предпросмотр готов. Нажмите «Сохранить логотип», чтобы применить его в шапке и подвале.';
		}catch(error){if(current===generation&&chosen===selection)status.textContent=`Не удалось подготовить логотип: ${error.message}`;}
		finally{if(current===generation&&chosen===selection){busy=false;controls();}}
	});
	async function persist(image){
		const current=generation;busy=true;controls();status.textContent='Сохраняем логотип...';
		try{
			const result=await adminRequest(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image})});
			if(current!==generation)return;
			if(result.ok!==true)throw new Error('Сервер не подтвердил сохранение логотипа.');
			saved=validateImage(result.image);pending=null;file.value='';show(saved);
			status.textContent=invoice
				?(saved===null?'Логотип удален. Новые PDF-счета будут без логотипа.':'Логотип сохранен для новых PDF-счетов.')+' Старые заказы и логотип сайта не изменены.'
				:'Логотип сохранен. Он появится в шапке и подвале при следующем открытии сайта. PDF-счета не изменены.';
		}catch(error){if(current===generation)status.textContent=error.message;}
		finally{if(current===generation){busy=false;controls();}}
	}
	save.addEventListener('click',()=>{if(loaded&&!busy&&pending!==null)persist(pending);});
	reset.addEventListener('click',()=>{
		if(loaded&&!busy&&confirm(invoice?'Вернуть исходный логотип в новых PDF-счетах?':'Вернуть исходный логотип в шапке и подвале?'))persist(initial);
	});
	if(remove)remove.addEventListener('click',()=>{
		if(loaded&&!busy&&saved!==null&&confirm('Удалить логотип? Новые PDF-счета будут без логотипа.'))persist(null);
	});
	document.addEventListener('admin-logout',()=>{
		generation++;selection++;loaded=false;busy=false;pending=null;saved=initial;file.value='';show(initial);status.textContent='';controls();
	});
	controls();
	return {loadAdmin,prepareImage,readDraft:()=>{
		if(!loaded||busy)throw new Error('Дождитесь загрузки и подготовки логотипа.');
		return pending===null?saved:pending;
	}};
	}
	window.siteLogo=editor('logo');
})();
