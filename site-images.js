(() => {
	const originals={hero:'images/daniel.png',diploma:'images/diplom.jpg'};
	const validate=image=>{
		if(image!==null&&(typeof image!=='string'||image.length>5592430||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(image))){
			throw new Error('Сервер вернул некорректное изображение.');
		}
		return image;
	};
	async function prepare(file){
		if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>15*1024*1024){
			throw new Error('Выберите PNG, JPEG или WebP размером до 15 МБ.');
		}
		const bitmap=await createImageBitmap(file);
		try{
			if(bitmap.width>12000||bitmap.height>12000)throw new Error('Исходное изображение не должно превышать 12000 x 12000 пикселей.');
			const scale=Math.min(1,2560/bitmap.width,2560/bitmap.height),canvas=document.createElement('canvas');
			canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
			const context=canvas.getContext('2d');
			if(!context)throw new Error('Браузер не поддерживает подготовку изображения.');
			context.drawImage(bitmap,0,0,canvas.width,canvas.height);
			const image=canvas.toDataURL('image/png');
			if(image.length>5592430)throw new Error('После обработки изображение больше 4 МБ. Уменьшите его размер и загрузите снова.');
			return validate(image);
		}finally{bitmap.close();}
	}
	function editor(kind){
		const file=document.getElementById(`image-${kind}-file`),preview=document.getElementById(`image-${kind}-preview`),
			apply=document.getElementById(`image-${kind}-apply`),reset=document.getElementById(`image-${kind}-reset`),
			status=document.getElementById(`image-${kind}-status`);
		let generation=0,selection=0,loaded=false,busy=false,saved=null,pending=null;
		const show=image=>{preview.src=image||originals[kind];};
		const controls=()=>{
			file.disabled=!loaded||busy;apply.disabled=!loaded||busy||pending===null;
			reset.disabled=!loaded||busy||saved===null;
		};
		function leave(){
			generation++;selection++;loaded=false;busy=false;saved=null;pending=null;
			file.value='';show(null);status.textContent='';controls();
		}
		async function load(){
			leave();
			const current=generation;status.textContent='Загружаем изображение...';
			try{
				const result=await adminRequest(`/api/admin/site-images?kind=${kind}`);
				if(current!==generation)return;
				saved=validate(result.image);show(saved);loaded=true;status.textContent='';
			}catch(error){if(current===generation)status.textContent=error.message;}
			finally{if(current===generation)controls();}
		}
		file.addEventListener('change',async()=>{
			const current=generation,chosen=++selection,image=file.files[0];
			pending=null;show(saved);
			if(!image){status.textContent='';controls();return;}
			busy=true;controls();status.textContent='Подготавливаем изображение...';
			try{
				const prepared=await prepare(image);
				if(current!==generation||chosen!==selection)return;
				pending=prepared;show(pending);
				status.textContent='Предпросмотр готов. На сайте пока прежнее фото. Нажмите «Применить», чтобы заменить его.';
			}catch(error){if(current===generation&&chosen===selection)status.textContent=error.message;}
			finally{if(current===generation&&chosen===selection){busy=false;controls();}}
		});
		async function persist(image){
			const current=generation;busy=true;controls();status.textContent='Применяем изображение...';
			try{
				const result=await adminRequest('/api/admin/site-images',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,image})});
				if(current!==generation)return;
				if(result.ok!==true||validate(result.image)!==image)throw new Error('Сервер не подтвердил применение изображения.');
				saved=result.image;pending=null;file.value='';show(saved);
				status.textContent='Изображение применено. Оно появится при следующем открытии сайта.';
			}catch(error){if(current===generation)status.textContent=error.message;}
			finally{if(current===generation){busy=false;controls();}}
		}
		apply.addEventListener('click',()=>{if(loaded&&!busy&&pending!==null)return persist(pending);});
		reset.addEventListener('click',()=>{
			if(loaded&&!busy&&saved!==null&&confirm('Вернуть исходное изображение на сайте?'))return persist(null);
		});
		preview.addEventListener('error',()=>{status.textContent='Не удалось отобразить предпросмотр изображения.';});
		controls();return {load,leave};
	}
	if(document.getElementById('image-hero-file')){
		const editors=Object.keys(originals).map(editor);
		window.siteImages={load:()=>editors.forEach(item=>item.load()),leave:()=>editors.forEach(item=>item.leave())};
		document.addEventListener('admin-logout',window.siteImages.leave);
		return;
	}
	for(const kind of Object.keys(originals)){
		const targets=[...document.querySelectorAll(kind==='hero'?'.hero-photo':'.diploma-frame img, .diploma-modal > img')];
		if(!targets.length)continue;
		const status=document.createElement('p'),message=document.createElement('span'),retry=document.createElement('button');
		status.setAttribute('role','status');status.hidden=true;retry.type='button';retry.textContent='Повторить';
		status.append(message,' ',retry);
		document.querySelector(kind==='hero'?'.hero-copy':'.diploma-wrap').append(status);
		const load=async()=>{
			retry.disabled=true;
			try{
				const response=await window.siteFetch(`/api/site-images?kind=${kind}`),result=await response.json();
				if(!response.ok)throw new Error(result.error||'Не удалось загрузить изображение.');
				const image=validate(result.image)||originals[kind],check=new Image();
				check.src=image;await check.decode();
				targets.forEach(target=>{target.src=image;});status.hidden=true;
			}catch(error){message.textContent=`${error.message} Изображение не заменено.`;status.hidden=false;}
			finally{retry.disabled=false;}
		};
		retry.addEventListener('click',load);load();
	}
})();
