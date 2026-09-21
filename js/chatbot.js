(()=>{
  const API=window.ZAVOKA_API||'';
  const merchantId=localStorage.lbMerchantId||'';
  const merchantSession=localStorage.lbMerchantSession||'';
  const visitorId=localStorage.lbVisitorId||(localStorage.lbVisitorId=crypto.randomUUID());
  const root=document.createElement('div');
  root.innerHTML=`<button class="lb-launcher" aria-label="Open zavoka assistant"><span>✦</span></button><div class="lb-greeting" role="status"></div><section class="lb-chat" aria-label="zavoka chat"><header><span class="lb-avatar" id="lbAvatar">♙</span><div class="lb-heading"><strong id="lbTitle">AI Sales Executive</strong><small><span class="lb-online-dot"></span> Online now</small></div><div class="lb-header-actions"><button class="lb-minimize" aria-label="Minimize chat">−</button><button class="lb-close" aria-label="Close chat">×</button></div></header><div class="lb-messages"><p class="lb-assistant" id="lbWelcome">Hi! 👋 I’m your AI Sales Executive. How can I help you find the perfect product today?</p></div><form><input placeholder="Ask about our products…" autocomplete="off" aria-label="Message zavoka AI"><button aria-label="Send message">➤</button></form></section>`;
  document.body.append(root);

  const chat=root.querySelector('.lb-chat');
  const launcher=root.querySelector('.lb-launcher');
  const greeting=root.querySelector('.lb-greeting');
  const messages=root.querySelector('.lb-messages');
  const form=root.querySelector('form');
  const input=root.querySelector('input');
  const sendButton=form.querySelector('button');
  let locked=false, notice='', trialEndsAt=0, countdownMessage=null, countdownTimer=null, typingMessage=null;

  const addMessage=(text,kind='assistant')=>{
    const p=document.createElement('p');
    p.className=`lb-${kind}`;
    p.textContent=String(text||'');
    messages.append(p);
    messages.scrollTop=messages.scrollHeight;
    return p;
  };

  const showTyping=()=>{
    if(typingMessage)return;
    typingMessage=document.createElement('p');
    typingMessage.className='lb-assistant lb-typing';
    typingMessage.innerHTML='<span></span><span></span><span></span>';
    messages.append(typingMessage);
    messages.scrollTop=messages.scrollHeight;
  };

  const hideTyping=()=>{
    typingMessage?.remove();
    typingMessage=null;
  };

  const setLocked=(value)=>{
    locked=value;
    input.disabled=value;
    sendButton.disabled=value;
    input.placeholder=value?'Chat is locked — choose a paid plan to continue.':'Ask about products…';
  };

  const showNotice=(text)=>{
    if(!text||notice===text)return;
    notice=text;
    addMessage(text);
  };

  const formatCountdown=(milliseconds)=>{
    const totalSeconds=Math.max(0,Math.ceil(milliseconds/1000));
    const hours=Math.floor(totalSeconds/3600);
    const minutes=Math.floor((totalSeconds%3600)/60);
    const seconds=totalSeconds%60;
    return [hours,minutes,seconds].map(value=>String(value).padStart(2,'0')).join(':');
  };

  const updateCountdown=()=>{
    if(!countdownMessage||!trialEndsAt)return;
    const remaining=trialEndsAt-Date.now();
    if(remaining<=0){
      countdownMessage.textContent='Your trial period is ending now. Please choose a paid plan to keep your Sales Executive available.';
      clearInterval(countdownTimer);
      refreshStatus();
      return;
    }
    countdownMessage.textContent=`Your trial ends in ${formatCountdown(remaining)}. Choose a paid plan before it ends to keep your Sales Executive available.`;
  };

  const showTrialCountdown=()=>{
    if(countdownMessage)return;
    countdownMessage=document.createElement('p');
    countdownMessage.className='lb-assistant lb-countdown';
    messages.append(countdownMessage);
    updateCountdown();
    countdownTimer=setInterval(updateCountdown,1000);
  };

  const showRechargeButton=()=>{
    if(messages.querySelector('.lb-recharge-action'))return;
    const wrapper=document.createElement('p');
    wrapper.className='lb-assistant lb-recharge-action';
    const button=document.createElement('button');
    button.type='button';
    button.textContent='RECHARGE NOW';
    button.onclick=()=>location.assign('dashboard.html?tab=billing');
    wrapper.append(button);
    messages.append(wrapper);
  };

  const addActionButton=(label,action,className='lb-action')=>{
    const wrapper=document.createElement('p');
    wrapper.className='lb-assistant lb-action-row';
    const button=document.createElement('button');
    button.type='button'; button.className=className; button.textContent=label; button.onclick=action;
    wrapper.append(button); messages.append(wrapper);
  };

  const renderProducts=(products)=>{
    if(!Array.isArray(products)||!products.length)return;
    const carousel=document.createElement('div');
    carousel.className='lb-product-carousel';
    products.slice(0,6).forEach(product=>{
      const card=document.createElement('article'); card.className='lb-product-card';
      if(product.image){const image=document.createElement('img'); image.src=product.image; image.alt=product.title||'Product'; image.loading='lazy'; card.append(image);}
      const title=document.createElement('strong'); title.textContent=product.title||'Recommended product'; card.append(title);
      if(product.price!=null){const price=document.createElement('span'); price.textContent=product.price; card.append(price);}
      const actions=document.createElement('div'); actions.className='lb-product-actions';
      if(product.handle){const view=document.createElement('button'); view.type='button'; view.textContent='View'; view.onclick=()=>location.assign(`/products/${encodeURIComponent(product.handle)}`); actions.append(view);}
      if(product.variantId&&root.dataset.cartActions!=='false'){const cart=document.createElement('button'); cart.type='button'; cart.textContent='Add to cart'; cart.onclick=()=>addToCart(product.variantId); actions.append(cart);}
      card.append(actions); carousel.append(card);
    });
    messages.append(carousel); messages.scrollTop=messages.scrollHeight;
  };

  const addToCart=async(variantId)=>{
    try{
      const response=await fetch('/cart/add.js',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:variantId,quantity:1})});
      if(!response.ok)throw new Error('Cart request failed');
      addMessage('Great choice! I added it to your cart.');
    }catch{ addMessage('I could not add that product to your cart. Please try again.'); }
  };

  const handleSalesActions=(data)=>{
    const features=data.features||{};
    root.dataset.cartActions=features.enableCartActions===false?'false':'true';
    if(features.enableRecommendations!==false)renderProducts(data.products);
    if(features.enableCoupons!==false&&data.coupon?.code){
      addMessage(`🎁 You can use coupon ${data.coupon.code} and save ${data.coupon.discount||'the available discount'}.`);
      addActionButton('Copy coupon',()=>navigator.clipboard?.writeText(data.coupon.code));
    }
    if(features.enableUpsells!==false&&data.upsell){
      addMessage(`I recommend upgrading to ${data.upsell.title||'this option'}${data.upsell.extraPrice?` for ${data.upsell.extraPrice} more`:''}.`);
      if(features.enableRecommendations!==false)renderProducts([data.upsell]);
    }
    if(features.enableCartActions!==false&&data.checkout){
      addActionButton('Secure checkout',()=>location.assign('/checkout'));
    }
  };

  const applyStatus=(data)=>{
    if(!data?.settings)return;
    const paid=data.paid===true;
    trialEndsAt=data.trialEndsAt?new Date(data.trialEndsAt).getTime():0;
    const hours=Math.ceil((trialEndsAt-Date.now())/3600000);
    const usage=Number(data.usage||0), limit=Number(data.limit||100);
    root.querySelector('#lbTitle').textContent=`${data.settings.agentName} · ${data.settings.storeName}`;
    root.querySelector('#lbWelcome').textContent=data.settings.welcomeMessage;
    root.style.setProperty('--orange',data.settings.themeColor||'#FF4616');
    if(data.settings.agentPic){const avatar=root.querySelector('#lbAvatar'); avatar.textContent=''; avatar.style.backgroundImage=`url("${String(data.settings.agentPic).replace(/"/g,'')}")`; avatar.style.backgroundSize='cover'; avatar.style.backgroundPosition='center';}
    if(paid){setLocked(false);return;}
    if(data.trialActive){
      if(usage>=limit){setLocked(true);showNotice(`Your Premium trial has used all ${limit} chats. Choose a paid plan to unlock your AI Sales Executive.`);}
      else if(hours<=48)showTrialCountdown();
      return;
    }
    setLocked(true); showNotice('Your trial period has ended. Your Sales Executive is not available. Choose a paid plan to handle your customers immediately.'); showRechargeButton();
  };

  const refreshStatus=async()=>{
    if(!merchantId)return;
    try{const response=await fetch(`${API}/api/merchant/settings?merchantId=${encodeURIComponent(merchantId)}`,{headers:{'x-merchant-session':merchantSession}}); if(response.ok)applyStatus(await response.json());}catch{}
  };

  const showWelcomeGreeting=()=>{
    if(localStorage.lbChatWelcomed==='true')return;
    localStorage.lbChatWelcomed='true';
    greeting.textContent=root.querySelector('#lbWelcome').textContent;
    greeting.classList.add('show');
    setTimeout(()=>greeting.classList.remove('show'),6000);
  };

  launcher.onclick=()=>{chat.classList.toggle('open'); greeting.classList.remove('show'); if(chat.classList.contains('open'))input.focus();};
  root.querySelector('.lb-close').onclick=()=>chat.classList.remove('open');
  root.querySelector('.lb-minimize').onclick=()=>chat.classList.remove('open');
  refreshStatus();
  setTimeout(showWelcomeGreeting,3500);
  setInterval(refreshStatus,60000);

  form.onsubmit=async event=>{
    event.preventDefault();
    const text=input.value.trim();
    if(!text||locked)return;
    addMessage(text,'user'); input.value=''; input.disabled=true; sendButton.disabled=true; showTyping();
    try{
      const response=await fetch(`${API}/api/chat/message`,{method:'POST',headers:{'Content-Type':'application/json','x-merchant-session':merchantSession},body:JSON.stringify({message:text,merchantId,visitorId})});
      const data=await response.json().catch(()=>({}));
      hideTyping();
      if(data.locked){setLocked(true);addMessage(`${data.error||'Your trial has ended.'} Choose a paid plan to unlock your AI Sales Executive.`);}
      else{addMessage(data.reply||'Please try again.');handleSalesActions(data);input.disabled=false;sendButton.disabled=false;}
    }catch{hideTyping();addMessage('I’m temporarily unavailable. Please try again shortly.');input.disabled=false;sendButton.disabled=false;}
    messages.scrollTop=messages.scrollHeight;
  };
})();
