(() => {
	const button=document.getElementById('voucher-copy'),label=document.getElementById('voucher-code'),status=document.getElementById('voucher-status');
	let code;
	try{code=decodeURIComponent(location.hash.slice(1));}catch{status.textContent='Некорректная ссылка на ваучер.';return;}
	history.replaceState(null,'',location.pathname+location.search);
	if(!/^[A-Z0-9][A-Z0-9-]{0,31}$/.test(code)){status.textContent='В ссылке отсутствует корректный код ваучера.';return;}
	label.textContent=code;button.disabled=false;
	button.addEventListener('click',async()=>{
		try{
			if(!navigator.clipboard)throw new Error('Копирование недоступно. Выделите код и скопируйте его вручную.');
			await navigator.clipboard.writeText(code);status.textContent='Код ваучера скопирован.';
		}catch(error){status.textContent=error.message||'Не удалось скопировать. Выделите код и скопируйте вручную.';}
	});
})();
