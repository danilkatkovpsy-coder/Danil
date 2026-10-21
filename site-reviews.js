(() => {
	const validate=reviews=>{
		const ids=new Set();
		if(!Array.isArray(reviews)||reviews.length>500||!reviews.every(review=>{
			if(!review||typeof review!=='object'||Object.keys(review).length!==6||typeof review.id!=='string'||
				!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(review.id)||
				ids.has(review.id.toLowerCase())||!Number.isInteger(review.rating)||review.rating<1||review.rating>5||
				typeof review.example!=='boolean')return false;
			ids.add(review.id.toLowerCase());
			return Object.entries({name:80,text:5000,topic:120}).every(([key,max])=>typeof review[key]==='string'&&
				review[key]===review[key].trim()&&review[key].length<=max&&(key==='topic'||review[key].length>0)&&
				!/[\x00-\x1f\x7f]/.test(review[key]));
		}))throw new Error('Некорректные отзывы. Проверьте имя, текст и рейтинг от 1 до 5.');
		return reviews;
	};
	const validateSubmission=review=>Boolean(review&&typeof review==='object'&&
		Object.keys(review).length===4&&typeof review.name==='string'&&review.name===review.name.trim()&&
		review.name.length<=80&&!/[\x00-\x1f\x7f]/.test(review.name)&&
		typeof review.text==='string'&&review.text.trim()===review.text&&review.text.length>0&&review.text.length<=5000&&
		!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(review.text)&&Number.isInteger(review.rating)&&
		review.rating>=1&&review.rating<=5&&typeof review.anonymous==='boolean'&&(review.anonymous||review.name.length>0));
	window.siteReviews={validate,validateSubmission};
	const section=document.querySelector('#reviews');
	if(!section)return;
	const track=section.querySelector('.reviews-grid');
	const node=(tag,value,className)=>{
		const element=document.createElement(tag);element.textContent=value;if(className)element.className=className;return element;
	};
	const reader=node('dialog','','review-reader');
	reader.id='review-reader';reader.setAttribute('aria-labelledby','review-reader-title');
	const readerTitle=node('h3','Отзыв клиента');readerTitle.id='review-reader-title';
	const readerClose=node('button','Закрыть','review-reader-close');readerClose.type='button';
	const readerStars=node('div','','review-stars'),readerText=node('p','','review-reader-text');
	reader.append(readerClose,readerTitle,readerStars,readerText);document.body.append(reader);
	let readerTrigger=null,readerScroll=0;
	readerClose.addEventListener('click',()=>reader.close());
	reader.addEventListener('click',event=>{
		if(event.target!==reader)return;
		const bounds=reader.getBoundingClientRect();
		if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)reader.close();
	});
	reader.addEventListener('close',()=>{
		document.body.classList.remove('modal-open');document.body.style.top='';
		window.scrollTo({top:readerScroll,behavior:'instant'});
		readerTrigger?.focus({preventScroll:true});readerTrigger=null;
	});
	const measureCards=()=>{
		for(const card of track.children){
			const paragraph=card.querySelector('.review-text'),button=card.querySelector('.review-read-more');
			if(paragraph&&button)button.hidden=paragraph.scrollHeight<=paragraph.clientHeight+1;
		}
	};
	const enhanceCards=()=>{
		for(const card of track.children){
			const paragraph=card.querySelector('p');
			if(!paragraph)continue;
			paragraph.classList.add('review-text');
			if(card.querySelector('.review-read-more'))continue;
			const button=node('button','Читать дальше','review-read-more');button.type='button';button.hidden=true;
			button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls',reader.id);
			button.addEventListener('click',()=>{
				readerTitle.textContent=card.querySelector('.review-author strong')?.textContent||'Отзыв клиента';
				readerStars.textContent=card.querySelector('.review-stars')?.textContent||'';
				readerText.textContent=paragraph.textContent;
				readerTrigger=button;readerScroll=window.scrollY;
				document.body.style.top=`-${readerScroll}px`;document.body.classList.add('modal-open');
				reader.showModal();reader.scrollTop=0;readerClose.focus({preventScroll:true});
			});
			paragraph.after(button);
		}
		requestAnimationFrame(measureCards);
	};
	window.addEventListener('resize',()=>requestAnimationFrame(measureCards));
	document.fonts?.ready.then(measureCards);
	enhanceCards();
	const form=document.querySelector('#public-review-form'),toggle=document.querySelector('#review-submit-toggle'),
		modal=document.querySelector('#public-review-modal'),closeModal=document.querySelector('#public-review-close');
	if(form&&toggle&&modal&&closeModal){
		const successModal=document.querySelector('#review-success-modal'),successClose=document.querySelector('#review-success-close');
		let pageScrollPosition=null;
		const lockPageScroll=()=>{
			if(pageScrollPosition!==null)return;
			pageScrollPosition=window.scrollY;
			document.body.style.top=`-${pageScrollPosition}px`;
			document.body.classList.add('modal-open');
		};
		const unlockPageScroll=()=>{
			if(pageScrollPosition===null)return;
			const scrollPosition=pageScrollPosition;
			pageScrollPosition=null;
			document.body.classList.remove('modal-open');
			document.body.style.top='';
			window.scrollTo({top:scrollPosition,behavior:'instant'});
		};
		const anonymous=form.elements.namedItem('anonymous'),name=form.elements.namedItem('name'),
			reviewText=form.elements.namedItem('text'),rating=form.elements.namedItem('rating'),
			submit=form.querySelector('[type="submit"]'),formStatus=document.querySelector('#public-review-status'),
			charCount=form.querySelector('.review-char-count'),
			ratingButtons=[...form.querySelectorAll('.review-rating-stars [role="radio"]')];
		const updateNameField=()=>{name.disabled=anonymous.checked;name.required=!anonymous.checked;if(anonymous.checked)name.value='';};
		const selectRating=value=>{
			const selected=Math.max(0,Math.min(5,Number(value)||0));
			rating.value=String(selected);
			form.querySelector('#review-rating-value').textContent=`${selected}/5`;
			ratingButtons.forEach((button,index)=>{
				const active=index<selected;
				button.textContent=active?'★':'☆';
				button.setAttribute('aria-checked',String(index+1===selected));
				button.tabIndex=index+1===selected||selected===0&&index===0?0:-1;
			});
		};
		ratingButtons.forEach((button,index)=>{
			button.addEventListener('click',()=>selectRating(index+1));
			button.addEventListener('keydown',event=>{
				const selected=Number(rating.value)||1;
				const next=event.key==='ArrowRight'||event.key==='ArrowUp'?Math.min(5,selected+1):
					event.key==='ArrowLeft'||event.key==='ArrowDown'?Math.max(1,selected-1):0;
				if(!next)return;
				event.preventDefault();selectRating(next);ratingButtons[next-1].focus();
			});
		});
		anonymous.addEventListener('change',updateNameField);
		reviewText.addEventListener('input',()=>{charCount.textContent=`${reviewText.value.length} / 5000`;});
		toggle.addEventListener('click',()=>{
			lockPageScroll();
			modal.showModal();toggle.setAttribute('aria-expanded','true');
			(anonymous.checked?reviewText:name).focus({preventScroll:true});
		});
		closeModal.addEventListener('click',()=>modal.close());
		modal.addEventListener('click',event=>{if(event.target===modal)modal.close();});
		modal.addEventListener('cancel',event=>{event.preventDefault();modal.close();});
		modal.addEventListener('close',()=>{
			toggle.setAttribute('aria-expanded','false');
			if(successModal.open)successClose.focus({preventScroll:true});
			else unlockPageScroll();
		});
		successClose.addEventListener('click',()=>successModal.close());
		successModal.addEventListener('cancel',event=>{event.preventDefault();successModal.close();});
		successModal.addEventListener('keydown',event=>{
			if(event.key==='Escape'){event.preventDefault();successModal.close();}
		});
		successModal.addEventListener('click',event=>{
			if(event.target!==successModal)return;
			const bounds=successModal.getBoundingClientRect();
			if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)successModal.close();
		});
		successModal.addEventListener('close',()=>{unlockPageScroll();toggle.focus({preventScroll:true});});
		form.addEventListener('submit',async event=>{
			event.preventDefault();submit.disabled=true;formStatus.textContent=form.querySelector('[data-site-text="review_sending"]').textContent;
			try{
				const payload={name:anonymous.checked?'':name.value.replace(/\s+/g,' ').trim(),
					text:reviewText.value.replace(/\s+/g,' ').trim(),rating:Number(rating.value),anonymous:anonymous.checked};
				if(!validateSubmission(payload))throw new Error('Проверьте имя, текст отзыва и оценку.');
				const response=await window.siteFetch('/api/site-reviews',{method:'POST',
					headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
				const result=await response.json();
				if(!response.ok)throw new Error(result.error||'Не удалось отправить отзыв.');
				form.reset();updateNameField();selectRating(0);charCount.textContent='0 / 5000';
				formStatus.textContent='';
				modal.close();lockPageScroll();successModal.showModal();successClose.focus({preventScroll:true});
			}catch(error){formStatus.textContent=error.message;}
			finally{submit.disabled=false;}
		});
	}
	const status=node('p','','reviews-load-status');status.setAttribute('role','status');
	const message=node('span',''),retry=node('button','Повторить');retry.type='button';
	status.append(message,' ',retry);status.hidden=true;section.append(status);
	const refresh=async()=>{
		retry.disabled=true;
		try{
			const response=await window.siteFetch('/api/site-reviews');
			const result=await response.json();
			if(!response.ok)throw new Error(result.error||'Не удалось загрузить отзывы.');
			const reviews=validate(result.reviews).filter(review=>!review.example);
			const cards=reviews.map((review,index)=>{
				const card=document.createElement('article'),body=document.createElement('div');
				const stars=node('div','★'.repeat(review.rating)+'☆'.repeat(5-review.rating),'review-stars');
				stars.setAttribute('aria-label',`${review.rating} из 5 звезд`);
				const paragraph=node('p',`«${review.text}»`,'review-text');
				body.append(stars,paragraph);
				const author=node('div','','review-author'),authorName=review.name||'Анонимно';
				const avatar=node('span',[...authorName][0].toUpperCase(),`avatar ${['avatar-a','avatar-m','avatar-i'][index%3]}`);
				const details=document.createElement('div');details.append(node('strong',authorName));
				author.append(avatar,details);card.append(body,author);return card;
			});
			track.replaceChildren(...cards);
			let empty=section.querySelector('.reviews-empty');
			if(!empty){empty=node('p','Отзывы пока не опубликованы.','reviews-empty');section.append(empty);}
			empty.hidden=reviews.length>0;status.hidden=true;
			enhanceCards();document.dispatchEvent(new Event('site-reviews-updated'));
		}catch(error){message.textContent=error.message;status.hidden=false;}
		finally{retry.disabled=false;}
	};
	retry.addEventListener('click',refresh);refresh();
})();
