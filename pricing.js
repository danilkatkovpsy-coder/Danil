(() => {
	const keys=['free','single','five','ten'];
	const money=cents=>`${new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(cents/100)} €`;
	const validate=prices=>{
		if(!prices||!keys.every(key=>Number.isInteger(prices[key])&&prices[key]>=(key==='free'?0:1)&&prices[key]<=10000000))throw new Error('Некорректные цены сервиса.');
		return prices;
	};
	const metrics=(prices,key)=>{
		const count=key==='five'?5:key==='ten'?10:1;
		return {total:money(prices[key]),rate:money(prices[key]/count),saving:Math.max(0,prices.single*count-prices[key])};
	};
	const load=async()=>{
		const response=await window.siteFetch('/api/prices');
		const result=await response.json();
		if(!response.ok)throw new Error(result.error||'Не удалось загрузить цены.');
		return validate(result.prices);
	};
	window.servicePricing={keys,money,validate,metrics,load};
})();
