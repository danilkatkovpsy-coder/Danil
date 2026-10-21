(() => {
	const types={instagram:'Instagram',telegram:'Telegram',facebook:'Facebook',whatsapp:'WhatsApp',tiktok:'TikTok',email:'Email',
		website:'Сайт / другая ссылка',phone:'Телефон',linkedin:'LinkedIn',youtube:'YouTube'};
	const plain=(value,max)=>typeof value==='string'&&value===value.trim()&&value.length>0&&value.length<=max&&!/[\x00-\x1f\x7f]/.test(value);
	const validate=settings=>{
		const footer=settings?.footer,links=settings?.links;
		if(!settings||Object.keys(settings).length!==2||!footer||Object.keys(footer).length!==5||
			!['title','company','registration','phone','email'].every(key=>plain(footer[key],key==='phone'?40:120))||
			!/^\+?[0-9 ()-]{5,40}$/.test(footer.phone)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(footer.email)||
			!Array.isArray(links)||links.length>12||!links.every(link=>{
				if(!link||Object.keys(link).length!==4||!Object.hasOwn(types,link.type)||!plain(link.label,60)||!plain(link.url,500)||typeof link.enabled!=='boolean')return false;
				if(link.type==='email')return /^mailto:[^\s@?]+@[^\s@?]+\.[^\s@?]+$/.test(link.url);
				if(link.type==='phone')return /^tel:\+?[0-9-]{5,30}$/.test(link.url);
				if(!/^https?:\/\/[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:[0-9]+)?([/?#][^\s]*)?$/.test(link.url))return false;
				try{const url=new URL(link.url);return !url.username&&!url.password;}catch{return false;}
			}))throw new Error('Проверьте поля подвала, названия кнопок и ссылки. Нужен полный адрес https://, mailto: или tel:.');
		return settings;
	};
	const visibleLinks=links=>{
		const enabled=links.filter(link=>link.enabled),tiktok=enabled.filter(link=>link.type==='tiktok'),
			others=enabled.filter(link=>link.type!=='tiktok');
		const whatsapp=others.findIndex(link=>link.type==='whatsapp'),email=others.findIndex(link=>link.type==='email');
		others.splice(whatsapp>=0?whatsapp+1:email>=0?email:others.length,0,...tiktok);
		return others;
	};
	window.siteContacts={types,validate,visibleLinks};
	const socials=document.querySelector('#contact .contact-socials');
	if(!socials)return;
	const originals=new Map([...socials.children].map(node=>[[...node.classList].find(name=>name!=='social'),node.cloneNode(true)]));
	const symbols={website:'↗',phone:'☎',linkedin:'in',youtube:'▶'};
	const status=document.createElement('p'),message=document.createElement('span'),retry=document.createElement('button');
	status.setAttribute('role','status');status.hidden=true;retry.type='button';retry.textContent='Повторить';
	status.append(message,' ',retry);document.querySelector('#contact .contact-social-area').append(status);
	const refresh=async()=>{
		retry.disabled=true;
		try{
			const response=await window.siteFetch('/api/site-contacts');
			const data=await response.json();
			if(!response.ok)throw new Error(data.error||'Не удалось загрузить контакты.');
			const settings=validate(data.settings);
			const buttons=visibleLinks(settings.links).map(link=>{
				const node=originals.has(link.type)?originals.get(link.type).cloneNode(true):document.createElement('a');
				node.className=`social ${link.type}`;node.href=link.url;node.setAttribute('aria-label',link.label);node.title=link.label;
				node.rel='noopener noreferrer';
				if(/^https?:/.test(link.url))node.target='_blank';else node.removeAttribute('target');
				if(link.type==='tiktok'){
					const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
					icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
					const path=document.createElementNS('http://www.w3.org/2000/svg','path');
					path.setAttribute('d','M14 3h3c0 3 2 5 4 5v3c-2 0-4-1-5-2v8a5 5 0 1 1-5-5v3a2 2 0 1 0 2 2V3Z');
					icon.append(path);node.replaceChildren(icon);
				}else if(!originals.has(link.type)){
					const icon=document.createElement('span');icon.setAttribute('aria-hidden','true');icon.textContent=symbols[link.type]||'↗';node.append(icon);
				}
				return node;
			});
			socials.replaceChildren(...buttons);
			status.hidden=true;
		}catch(error){message.textContent=error.message;status.hidden=false;}
		finally{retry.disabled=false;}
	};
	retry.addEventListener('click',refresh);refresh();
})();
