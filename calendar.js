(() => {
	if (new URLSearchParams(location.search).get('embed') === '1') document.documentElement.classList.add('embedded');
	const params=new URLSearchParams(location.hash.slice(1));
	history.replaceState(null,'',location.pathname);
	const start=new Date(params.get('start')),end=new Date(params.get('end'));
	const platform=params.get('platform');
	const uid=params.get('uid')||'';
	const version=params.get('version')||'0';
	if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start||
		end-start>10800000||!['Zoom','Microsoft Teams','Telegram','WhatsApp'].includes(platform)||
		!/^[a-f0-9-]{36}@danilpsy\.ee$/i.test(uid)||!/^\d{1,9}$/.test(version)){
		document.getElementById('details').textContent='Некорректная ссылка. Откройте кнопку из письма с подтверждением записи.';
		return;
	}
	const title='Консультация с Данилом Катковым';
	const description=`Время Таллина. Платформа: ${platform}.`;
	const stamp=date=>date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
	const dateFormat=new Intl.DateTimeFormat('ru-RU',{dateStyle:'long',timeZone:'Europe/Tallinn'});
	const timeFormat=new Intl.DateTimeFormat('ru-RU',{timeStyle:'short',timeZone:'Europe/Tallinn'});
	const startDate=dateFormat.format(start),endDate=dateFormat.format(end);
	const interval=startDate===endDate
		? `${startDate}, ${timeFormat.format(start)}–${timeFormat.format(end)}`
		: `${startDate}, ${timeFormat.format(start)} - ${endDate}, ${timeFormat.format(end)}`;
	document.getElementById('details').textContent=`${interval}. ${description}`;
	const google=new URL('https://calendar.google.com/calendar/render');
	google.search=new URLSearchParams({action:'TEMPLATE',text:title,dates:`${stamp(start)}/${stamp(end)}`,details:description,ctz:'Europe/Tallinn'});
	document.getElementById('google').href=google.href;
	const outlook=new URL('https://outlook.live.com/calendar/0/deeplink/compose');
	outlook.search=new URLSearchParams({subject:title,startdt:start.toISOString(),enddt:end.toISOString(),body:description});
	document.getElementById('outlook').href=outlook.href;
	document.getElementById('download').addEventListener('click',()=>{
		const content=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//danilpsy.ee//Calendar//RU','CALSCALE:GREGORIAN',
			'BEGIN:VEVENT',`UID:${uid}`,`SEQUENCE:${version}`,`DTSTAMP:${stamp(new Date())}`,
			`DTSTART:${stamp(start)}`,`DTEND:${stamp(end)}`,`SUMMARY:${title}`,`DESCRIPTION:${description}`,
			'END:VEVENT','END:VCALENDAR',''].map(line=>{
				let result='',length=0;
				for(const character of line){
					const size=new TextEncoder().encode(character).length;
					if(length+size>75){result+='\r\n ';length=1;}
					result+=character;length+=size;
				}
				return result;
			}).join('\r\n');
		const url=URL.createObjectURL(new Blob([content],{type:'text/calendar;charset=utf-8'}));
		const link=document.createElement('a');link.href=url;link.download='consultation.ics';
		document.body.append(link);link.click();link.remove();
		setTimeout(()=>URL.revokeObjectURL(url),1000);
	});
	document.getElementById('actions').hidden=false;
})();
