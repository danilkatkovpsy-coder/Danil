(() => {
	let frame=null,draft=null,overlay=null,returnFocus=null,previousOverflow='';
	function closePreview(){
		if(!overlay)return;
		overlay.remove();overlay=null;frame=null;draft=null;
		document.body.style.overflow=previousOverflow;
		returnFocus?.focus({preventScroll:true});returnFocus=null;
	}
	function openPreview(value){
		closePreview();
		draft=structuredClone(value);returnFocus=document.activeElement;previousOverflow=document.body.style.overflow;
		overlay=document.createElement('div');overlay.className='admin-site-preview';
		overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Предпросмотр сайта без сохранения');
		const back=document.createElement('button');back.type='button';back.textContent='Назад';back.className='admin-site-preview-back';
		back.addEventListener('click',closePreview);
		frame=document.createElement('iframe');frame.title='Сайт с несохраненными изменениями';
		frame.setAttribute('sandbox','allow-scripts allow-same-origin');
		overlay.append(back,frame);document.body.append(overlay);document.body.style.overflow='hidden';
		frame.src=`index.html?admin-preview=1#${encodeURIComponent(value.anchor)}`;back.focus();
	}
	document.addEventListener('keydown',event=>{if(overlay&&event.key==='Escape'){event.preventDefault();closePreview();}});
	document.addEventListener('admin-logout',closePreview);
	window.adminTextPreview={open:openPreview,read:child=>frame&&child===frame.contentWindow?structuredClone(draft):null};
	function mount(keys){
		const get=id=>document.getElementById(id),form=get('texts-form'),globalStatus=get('texts-status');
		let generation=0,loaded=false,busy=false,loading=false;
		const anchors={hero:'top',about:'about',services:'services',format:'approach',package:'packages',reviews:'reviews',contact:'contact',header:'top',footer:'footer'};
		const groups=Object.entries(anchors).map(([name,anchor])=>{
			const fields=get(`texts-${name}-fields`),panel=fields.closest('details');
			const actions=document.createElement('div');actions.className='calendar-actions';
			const save=document.createElement('button');save.type='button';save.textContent='Сохранить тексты';
			const preview=document.createElement('button');preview.type='button';preview.textContent='Предпросмотр';
			const status=document.createElement('p');status.setAttribute('role','status');
			actions.append(save,preview);panel.append(actions,status);
			return {fields,panel,save,preview,status,anchor,keys:keys.filter(key=>fields.contains(form.elements.namedItem(key)))};
		});
		const controls=()=>{
			groups.forEach(group=>{group.save.disabled=group.preview.disabled=!loaded||busy;});
			logoPreview.disabled=!loaded||busy;
		};
		const validateGroup=group=>{
			for(const key of group.keys){
				const input=form.elements.namedItem(key);
				if(!input.checkValidity()){
					for(let panel=input.closest('details');panel;panel=panel.parentElement.closest('details'))panel.open=true;
					input.reportValidity();return false;
				}
			}
			return true;
		};
		const merge=(texts,group)=>window.siteTexts.validate({...texts,...Object.fromEntries(group.keys.map(key=>
			[key,window.siteTexts.normalize(key,form.elements.namedItem(key).value)]))});
		async function run(group,preview){
			if(!loaded||busy||!validateGroup(group))return;
			const current=generation;busy=true;controls();group.status.textContent=preview?'Готовим предпросмотр...':'Сохраняем тексты блока...';
			try{
				const result=await adminRequest('/api/admin/site-texts');
				if(current!==generation)return;
				const texts=merge(window.siteTexts.validate(result.texts),group);
				if(preview){
					openPreview({texts,anchor:group.anchor});group.status.textContent='Предпросмотр открыт. Изменения не сохранены.';
				}else{
					const saved=await adminRequest('/api/admin/site-texts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({texts})});
					if(current!==generation)return;
					if(saved.ok!==true)throw new Error('Сервер не подтвердил сохранение текстов.');
					for(const key of group.keys){
						const input=form.elements.namedItem(key);
						if(window.siteTexts.normalize(key,input.value)===texts[key])input.value=texts[key];
					}
					group.status.textContent='Тексты этого блока сохранены. Черновики в остальных блоках не применены.';
				}
			}catch(error){if(current===generation)group.status.textContent=error.message;}
			finally{if(current===generation){busy=false;controls();}}
		}
		for(const group of groups){
			group.save.addEventListener('click',()=>run(group,false));
			group.preview.addEventListener('click',()=>run(group,true));
		}
		form.addEventListener('submit',event=>event.preventDefault());
		const logoPreview=document.createElement('button');logoPreview.type='button';logoPreview.textContent='Предпросмотр';
		get('logo-save').after(logoPreview);
		logoPreview.addEventListener('click',async()=>{
			if(!loaded||busy)return;
			const current=generation;busy=true;controls();logoPreview.disabled=true;
			try{
				const logo=window.siteLogo.readDraft(),result=await adminRequest('/api/admin/site-texts');
				if(current!==generation)return;
				openPreview({texts:window.siteTexts.validate(result.texts),logo,anchor:'top'});
			}catch(error){if(current===generation)get('logo-status').textContent=error.message;}
			finally{if(current===generation){busy=false;controls();logoPreview.disabled=false;}}
		});
		async function load(){
			if(loaded||loading)return;
			window.siteLogo.loadAdmin();
			const current=++generation;loading=true;controls();globalStatus.textContent='Загружаем тексты...';
			try{
				const result=await adminRequest('/api/admin/site-texts');
				if(current!==generation)return;
				const texts=window.siteTexts.validate(result.texts);
				for(const key of keys)form.elements.namedItem(key).value=texts[key];
				loaded=true;globalStatus.textContent='';
			}catch(error){if(current===generation)globalStatus.textContent=error.message;}
			finally{if(current===generation){loading=false;controls();}}
		}
		function leave(){
			closePreview();
			generation++;loaded=false;loading=false;busy=false;form.reset();globalStatus.textContent='';
			groups.forEach(group=>{group.status.textContent='';});controls();
		}
		document.addEventListener('admin-logout',leave);
		controls();return {load,leave};
	}
	window.adminTextSections={mount};
})();
