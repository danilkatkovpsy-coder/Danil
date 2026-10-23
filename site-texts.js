(() => {
	const fields={hero_eyebrow:120,hero_title_first:120,hero_title_second:120,hero_title_accent:120,hero_intro:2000,
		hero_benefit_online:120,hero_benefit_individual:120,hero_benefit_privacy:120,
		about_label:60,about_title:120,about_body:2000,about_sharing:2000,about_parent:2000,about_potential:2000,
		about_cbt_title:120,about_cbt_body:400,about_individual_title:120,about_individual_body:400,
		about_education_title:120,about_education_body:400,
		approach_title:120,approach_body:2000,approach_changes:2000,approach_result:2000,
		services_label:60,services_title:120,services_intro:400,
		service_anxiety_title:120,service_anxiety_body:400,service_relationships_title:120,service_relationships_body:400,
		service_selfesteem_title:120,service_selfesteem_body:400,service_burnout_title:120,service_burnout_body:400,
		service_boundaries_title:120,service_boundaries_body:400,service_awareness_title:120,service_awareness_body:400,
		format_label:60,format_title:120,format_intro:2000,
		format_online_title:120,format_online_body:400,format_duration_title:120,format_duration_body:400,
		format_booking_title:120,format_booking_body:400,format_science_title:120,format_science_body:400,
		format_quote:500,format_quote_author:120,
		pricing_label:60,pricing_title:120,pricing_intro:400,
		free_title:120,free_button:60,single_title:120,single_button:60,
		five_title:120,five_button:60,five_buy_button:60,ten_title:120,ten_button:60,ten_buy_button:60,
		free_description:400,single_description:400,five_description:400,ten_description:400,
		reviews_label:60,reviews_title:120,reviews_button:60,review_modal_title:120,review_modal_note:400,
		review_name_label:60,review_name_placeholder:80,review_anonymous_label:80,review_rating_label:60,
		review_text_label:80,review_text_placeholder:200,review_submit:60,review_close:80,
		reviews_empty:200,review_sending:120,review_success:400,
		contact_label:60,contact_title:120,contact_body:400,contact_social_title:120,
		hero_button:60,about_button:60,header_name:120,header_tagline:120,header_button:60,
		footer_name:120,footer_tagline:120,footer_description:500,footer_navigation:120,
		footer_details_title:120,footer_company:120,footer_registration:120,footer_phone:40,footer_email:120,footer_copyright:200};
	const multiline=key=>key==='footer_description'||key==='hero_title_accent'||key.startsWith('hero_benefit_')||key.startsWith('service_')||key.startsWith('format_')&&!['format_label','format_intro','format_quote_author'].includes(key);
	const normalize=(key,value)=>multiline(key)?value.replace(/\r\n?/g,'\n').split('\n').map(line=>line.replace(/[^\S\n]+/g,' ').trim()).join('\n').trim():value.replace(/\s+/g,' ').trim();
	const validate=texts=>{
		if(!texts||typeof texts!=='object'||Array.isArray(texts)||Object.keys(texts).length!==Object.keys(fields).length||
			!Object.entries(fields).every(([key,max])=>typeof texts[key]==='string'&&texts[key].trim()===texts[key]&&
				texts[key].length>0&&texts[key].length<=max&&!(multiline(key)?/[\x00-\x09\x0b-\x1f\x7f]/:/[\x00-\x1f\x7f]/).test(texts[key]))||
			!/^\+?[0-9 ()-]{5,40}$/.test(texts.footer_phone)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texts.footer_email))throw new Error('Некорректные тексты сайта. Проверьте также телефон и email подвала.');
		return texts;
	};
	const load=async()=>{
		const response=await window.siteFetch('/api/site-texts');
		const result=await response.json();
		if(!response.ok)throw new Error(result.error||'Не удалось загрузить тексты сайта.');
		return validate(result.texts);
	};
	window.siteTexts={fields,validate,load,normalize};
	const targets=document.querySelectorAll('[data-site-text]');
	if(!targets.length)return;
	const status=document.createElement('p');
	status.setAttribute('role','status');
	const message=document.createElement('span');
	const retry=document.createElement('button');
	retry.type='button';retry.textContent='Повторить';
	status.append(message,' ',retry);status.hidden=true;
	document.querySelector('#about .about-copy').append(status);
	const refresh=async()=>{
		retry.disabled=true;
		try{
			const texts=await load();
			for(const target of targets){
				const attribute=target.dataset.siteTextAttribute;
				if(attribute==='placeholder'||attribute==='aria-label')target.setAttribute(attribute,texts[target.dataset.siteText]);
				else target.textContent=texts[target.dataset.siteText];
				if(target.dataset.siteText==='footer_phone')target.setAttribute('href',`tel:${texts.footer_phone.replace(/[ ()-]/g,'')}`);
				if(target.dataset.siteText==='footer_email')target.setAttribute('href',`mailto:${texts.footer_email}`);
			}
			status.hidden=true;
		}catch(error){
			message.textContent=`${error.message} Показана исходная версия текста.`;
			status.hidden=false;
		}finally{retry.disabled=false;}
	};
	retry.addEventListener('click',refresh);
	refresh();
})();
