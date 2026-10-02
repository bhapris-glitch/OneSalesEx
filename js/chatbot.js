(()=>{
  if(window.__zavokaSalesWidgetLoaded)return;
  window.__zavokaSalesWidgetLoaded=true;
  const API=window.ZAVOKA_API||'';
  const store=window.ZAVOKA_SHOPIFY_STORE||document.querySelector('meta[name="shopify-shop-domain"]')?.content||document.documentElement.dataset.shopifyDomain||(/\.myshopify\.com$/i.test(location.hostname)?location.hostname:location.hostname);
  const key=store.toLowerCase().replace(/[^a-z0-9]/g,'_');
  const getId=name=>{let value=localStorage.getItem(name);if(!value){value=crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;localStorage.setItem(name,value)}return value};
  const visitorId=getId(`lbVisitor_${key}`);
  const conversationId=getId(`lbConversation_${key}`);
  const merchantId=localStorage.getItem('lbMerchantId')||'';
  const merchantSession=localStorage.getItem('lbMerchantSession')||'';
  const root=document.createElement('div');
  root.id='lb-storefront-root';
  root.innerHTML=`<button class="lb-launcher" aria-label="Open zavoka assistant"><span>✦</span></button><section class="lb-chat" aria-label="Store Sales Executive chat"><header><span class="lb-avatar" id="lbAvatar">♙</span><div class="lb-heading"><strong id="lbTitle">AI Sales Executive</strong><small><span class="lb-online-dot"></span> AI · Here to help</small></div><div class="lb-header-actions"><button class="lb-minimize" aria-label="Minimize chat">−</button><button class="lb-close" aria-label="Close chat">×</button></div></header><div class="lb-messages"><p class="lb-assistant" id="lbWelcome">Hi! I’m your AI Sales Executive. What are you shopping for today?</p><div class="lb-quick-replies" aria-label="Quick ways to get help"><button type="button" data-prompt="Help me choose a product" data-guided="true">Help me choose</button><button type="button" data-prompt="What is your shipping policy?">Shipping</button><button type="button" data-prompt="What is your return and exchange policy?">Returns</button><button type="button" data-prompt="How can I track my order?">Track an order</button><button type="button" data-handoff="true">Talk to the store</button></div></div><div class="lb-lead-area"><button type="button" class="lb-lead-toggle">Connect me with the store</button><form class="lb-lead-form" hidden><input name="name" placeholder="Name (optional)" autocomplete="name" aria-label="Your name"><input name="email" type="email" placeholder="Email address" autocomplete="email" required aria-label="Email address"><label><input name="consent" type="checkbox" required> I agree that this store may contact me about my request.</label><button type="submit">Request follow-up</button><small class="lb-lead-status" role="status"></small></form></div><form class="lb-chat-form"><input placeholder="Ask about products…" autocomplete="off" aria-label="Message the Sales Executive"><button aria-label="Send message">➤</button></form></section>`;
  document.body.append(root);

  const chat=root.querySelector('.lb-chat');
  const messages=root.querySelector('.lb-messages');
  const form=root.querySelector('.lb-chat-form');
  const input=form.querySelector('input');
  const sendButton=form.querySelector('button');
  const leadForm=root.querySelector('.lb-lead-form');
  let currency='USD';
  let activeDiscountCode='';
  let settingsApplied=false;
  let locked=false;
  let notice='';
  let trialEndsAt=0;
  let countdownMessage=null;
  let countdownTimer=null;
  const preferenceKey=`lbShopperPreferences_${key}_${conversationId}`;
  let shopperPreferences=[];

  try{shopperPreferences=JSON.parse(sessionStorage.getItem(preferenceKey)||'[]').filter(value=>typeof value==='string').slice(0,8)}catch{}
  const rememberPreferences=text=>{
    const value=String(text||'').toLowerCase();
    const signals=[...value.matchAll(/\b(black|white|red|blue|green|pink|purple|yellow|orange|brown|beige|gray|grey|navy|small|medium|large|travel|work|everyday|gift|waterproof|lightweight)\b/g)].map(match=>match[1]);
    const budget=value.match(/(?:under|below|less than|up to|max(?:imum)?)\s*[$£€]?\s*\d+(?:[.,]\d+)?|[$£€]\s*\d+(?:[.,]\d+)?/i);
    shopperPreferences=[...new Set([...shopperPreferences,...signals,...(budget?[budget[0]]:[])])].slice(-8);
    try{sessionStorage.setItem(preferenceKey,JSON.stringify(shopperPreferences))}catch{}
  };
  const getShopperContext=async()=>{
    const path=location.pathname.split('?')[0].slice(0,180);
    const context={pagePath:path,pageTitle:String(document.querySelector('meta[property="og:title"]')?.content||document.title||'').slice(0,120),productTitle:/\/products\//i.test(path)?String(document.querySelector('meta[property="og:title"]')?.content||'').slice(0,120):'',collectionTitle:/\/collections\//i.test(path)?String(document.querySelector('meta[property="og:title"]')?.content||'').slice(0,120):'',cartItems:[],preferences:shopperPreferences};
    try{const response=await fetch(`${location.origin}/cart.js`,{credentials:'same-origin'});if(response.ok){const cart=await response.json();context.cartItems=(cart.items||[]).slice(0,8).map(item=>({title:String(item.product_title||item.title||'').slice(0,100),quantity:Math.max(1,Number(item.quantity)||1)})).filter(item=>item.title)}}catch{}
    return context;
  };

  const scroll=()=>{messages.scrollTop=messages.scrollHeight};
  const addMessage=(text,kind='assistant')=>{const p=document.createElement('p');p.className=`lb-${kind}`;p.textContent=text;messages.append(p);scroll();return p};
  const formatPrice=value=>{try{return new Intl.NumberFormat(undefined,{style:'currency',currency}).format(Number(value))}catch{return String(value)}};
  const sendEvent=(type,productId='')=>fetch(`${API}${type==='add_to_cart'?'/api/storefront/add-to-cart-event':'/api/storefront/event'}`,{method:'POST',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({shop:store,type,visitorId,conversationId,productId})}).catch(()=>{});
  const setCartAttribution=()=>fetch(`${location.origin}/cart/update.js`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({attributes:{layboka_visitor_id:visitorId,layboka_conversation_id:conversationId}})}).catch(()=>{});
  const makeCards=(products,label='')=>{
    if(!products?.length)return;
    if(label){const heading=document.createElement('p');heading.className='lb-product-heading';heading.textContent=label;messages.append(heading)}
    const note=document.createElement('p');note.className='lb-recommendation-note';note.textContent='Picked from this store’s synced product catalog using your request and shopping context. Check the product page for the latest details.';messages.append(note);
    const grid=document.createElement('div');grid.className='lb-product-grid';
    products.slice(0,3).forEach(product=>{
      const variants=(product.variants||[]).filter(variant=>variant.available!==false);
      if(!variants.length)return;
      let selected=variants[0];
      const card=document.createElement('article');card.className='lb-product-card';
      if(product.image){const image=document.createElement('img');image.src=product.image;image.alt='';image.loading='lazy';card.append(image)}
      const title=document.createElement('strong');title.textContent=product.title;card.append(title);
      const detail=document.createElement('small');detail.className='lb-product-price';detail.textContent=`${formatPrice(selected.price)} · Available variants`;card.append(detail);
      const description=String(product.description||'').trim();if(description){const summary=document.createElement('p');summary.className='lb-product-description';summary.textContent=description.length>150?`${description.slice(0,147)}…`:description;card.append(summary)}
      if(variants.length>1){const select=document.createElement('select');select.setAttribute('aria-label',`Choose a variant of ${product.title}`);variants.forEach((variant,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=`${variant.title} · ${formatPrice(variant.price)}`;select.append(option)});select.addEventListener('change',()=>{selected=variants[Number(select.value)]||variants[0];detail.textContent=`${formatPrice(selected.price)} · Available variants`});card.append(select)}
      const actions=document.createElement('div');actions.className='lb-product-actions';
      const view=document.createElement('a');view.href=product.productUrl||'#';view.target='_blank';view.rel='noopener noreferrer';view.textContent='View product';view.addEventListener('click',()=>sendEvent('product_click',product.productId));actions.append(view);
      const add=document.createElement('button');add.type='button';add.textContent='Add to cart';add.addEventListener('click',async()=>{add.disabled=true;add.textContent='Adding…';try{await setCartAttribution();const response=await fetch(`${location.origin}/cart/add.js`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({items:[{id:Number(selected.id),quantity:1}]})});if(!response.ok)throw new Error('Unable to add this item to your cart.');sendEvent('add_to_cart',product.productId);add.textContent='Added ✓';addMessage(`${product.title} was added to your cart.`)}catch(error){add.disabled=false;add.textContent='Try adding again';addMessage(error.message)}});actions.append(add);
      const buy=document.createElement('button');buy.type='button';buy.textContent='Checkout →';buy.addEventListener('click',async()=>{buy.disabled=true;buy.textContent='Opening checkout…';try{const response=await fetch(`${API}/api/storefront/checkout`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({shop:store,visitorId,conversationId,discountCode:activeDiscountCode,items:[{variantId:selected.id,quantity:1}]})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Unable to start checkout.');location.assign(data.checkoutUrl)}catch(error){buy.disabled=false;buy.textContent='Try checkout again';addMessage(error.message)}});actions.append(buy);card.append(actions);grid.append(card);
    });
    if(grid.childElementCount){messages.append(grid);scroll()}
  };
  const applySettings=data=>{
    if(!data||settingsApplied)return;
    settingsApplied=true;
    const s=data.settings||{};
    if(s.agentName&&s.storeName)root.querySelector('#lbTitle').textContent=`${s.agentName} · ${s.storeName}`;
    if(s.welcomeMessage)root.querySelector('#lbWelcome').textContent=s.welcomeMessage;
    const color=s.primaryColor||s.themeColor;
    if(color)root.style.setProperty('--lb-orange',color);
    if(s.chatBackground)root.style.setProperty('--lb-chat-bg',s.chatBackground);
    if(s.accentColor)root.style.setProperty('--lb-accent',s.accentColor);
    root.dataset.position=s.widgetPosition||'bottom-right';
    if(s.agentPic){const avatar=root.querySelector('#lbAvatar');avatar.textContent='';avatar.style.backgroundImage=`url("${String(s.agentPic).replace(/"/g,'')}")`;avatar.style.backgroundSize='cover';avatar.style.backgroundPosition='center'}
  };
  const setLocked=value=>{
    locked=value;
    input.disabled=value;
    sendButton.disabled=value;
    input.placeholder=value?'Chat is unavailable — please contact the store.':'Ask about products…';
  };
  const showNotice=text=>{if(!text||notice===text)return;notice=text;addMessage(text)};
  const openHandoff=()=>{leadForm.hidden=false;leadForm.scrollIntoView({block:'nearest',behavior:'smooth'});leadForm.querySelector('[name="email"]').focus();addMessage('I can’t connect a live agent inside this chat, but you can request a personal follow-up from the store here. Your details are only sent if you submit the form and agree to be contacted.')};
  root.querySelector('.lb-quick-replies').addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.dataset.handoff){openHandoff();return}input.value=button.dataset.prompt||'';input.dataset.guidedDiscovery=button.dataset.guided||'';form.requestSubmit()});
  const showOrderHelp=()=>{
    addMessage('I can’t access private order records in this chat. For secure tracking, use the order-status link in your Shopify confirmation or shipping email, or sign in to your store account.');
    const link=document.createElement('a');link.href=`${location.origin}/account`;link.textContent='Open store account';link.target='_blank';link.rel='noopener noreferrer';link.className='lb-order-link';messages.append(link);scroll();
  };
  root.querySelector('.lb-lead-toggle').addEventListener('click',()=>{leadForm.hidden=!leadForm.hidden;if(!leadForm.hidden)leadForm.querySelector('[name="email"]').focus()});
  const formatCountdown=milliseconds=>{const total=Math.max(0,Math.ceil(milliseconds/1000));return[Math.floor(total/3600),Math.floor((total%3600)/60),total%60].map(value=>String(value).padStart(2,'0')).join(':')};
  const updateCountdown=()=>{
    if(!countdownMessage||!trialEndsAt)return;
    const remaining=trialEndsAt-Date.now();
    if(remaining<=0){countdownMessage.textContent='The free trial has ended. The store assistant is temporarily unavailable.';clearInterval(countdownTimer);refreshStatus();return}
    countdownMessage.textContent=`The store’s free trial ends in ${formatCountdown(remaining)}.`;
  };
  const showTrialCountdown=()=>{
    if(countdownMessage)return;
    countdownMessage=document.createElement('p');countdownMessage.className='lb-assistant lb-countdown';messages.append(countdownMessage);updateCountdown();countdownTimer=setInterval(updateCountdown,1000);scroll();
  };
  const showRechargeButton=()=>{
    if(messages.querySelector('.lb-recharge-action'))return;
    const wrapper=document.createElement('p');wrapper.className='lb-assistant lb-recharge-action';
    const button=document.createElement('button');button.type='button';button.textContent='RECHARGE NOW';button.addEventListener('click',()=>location.assign('dashboard.html?tab=billing'));
    wrapper.append(button);messages.append(wrapper);scroll();
  };
  const applyStatus=data=>{
    if(data?.settings)applySettings(data);
    trialEndsAt=data?.trialEndsAt?new Date(data.trialEndsAt).getTime():0;
    const paid=data?.paid===true;
    const usage=Number(data?.usage||0);
    const limit=Number(data?.limit||50);
    const active=data?.trialActive===true&&trialEndsAt>Date.now();
    if(paid||(active&&usage<limit)){
      setLocked(false);
      if(countdownTimer)clearInterval(countdownTimer);
      return;
    }
    setLocked(true);
    if(active&&usage>=limit){showNotice(`This store’s trial has used all ${limit} chats. The assistant is temporarily unavailable.`);showRechargeButton()}
    else if(merchantId&&merchantSession){showNotice('This store’s Sales Executive is currently unavailable. Please contact the store for help.');showRechargeButton()}
  };
  const refreshStatus=async()=>{
    if(!merchantId||!merchantSession)return;
    try{
      const response=await fetch(`${API}/api/merchant/settings?merchantId=${encodeURIComponent(merchantId)}`,{headers:{'x-merchant-session':merchantSession}});
      if(response.ok)applyStatus(await response.json());
    }catch{}
  };

  form.addEventListener('submit',async event=>{
    event.preventDefault();const message=input.value.trim();if(!message||sendButton.disabled||locked)return;
    const guidedDiscovery=input.dataset.guidedDiscovery==='true';delete input.dataset.guidedDiscovery;
    const apiMessage=guidedDiscovery?`${message} Please ask one focused follow-up question about my needs, intended use, or budget before recommending products.`:message;
    addMessage(message,'user');input.value='';
    if(/\b(track|tracking|where.*order|order status)\b/i.test(message)){showOrderHelp();return}
    if(/\b(human|real person|talk to (?:someone|the store)|speak to (?:someone|a person)|customer service|agent)\b/i.test(message)){openHandoff();return}
    rememberPreferences(message);sendButton.disabled=true;input.disabled=true;sendButton.textContent='…';setCartAttribution();
    try{
      const shopperContext=await getShopperContext();
      const response=await fetch(`${API}/api/storefront/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({shop:store,message:apiMessage,visitorId,conversationId,shopperContext})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok){
        if(data.locked){setLocked(true);showNotice(data.error||'The store assistant is temporarily unavailable.');if(merchantId&&merchantSession){showRechargeButton();refreshStatus()}}
        else addMessage(data.error||'Please try again shortly.');
        return;
      }
      currency=data.currency||currency;activeDiscountCode=data.discountCode||activeDiscountCode;applySettings(data);addMessage(data.reply||'Tell me a little more about what you’re looking for.');
      makeCards(data.products,'Available matches');
      const relatedLabel=/upgrade|better|premium|more powerful|higher.?end/i.test(message)?'A step-up to compare':/accessor|goes with|along with|add.?on|pair with|complement/i.test(message)?'Accessories that pair well':'Related options you may like';
      makeCards(data.relatedProducts,relatedLabel);
    }catch{addMessage('I’m temporarily unavailable. Please try again shortly.')}finally{sendButton.textContent='➤';if(!locked){sendButton.disabled=false;input.disabled=false;input.focus()}}
  });
  leadForm.addEventListener('submit',async event=>{
    event.preventDefault();const status=leadForm.querySelector('.lb-lead-status');const submit=leadForm.querySelector('button[type="submit"]');submit.disabled=true;status.textContent='Sending…';
    try{const response=await fetch(`${API}/api/storefront/lead`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({shop:store,visitorId,conversationId,name:leadForm.elements.name.value,email:leadForm.elements.email.value,consent:leadForm.elements.consent.checked})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Unable to send your request.');status.textContent=data.message||'Thanks. The store can follow up with you.';leadForm.reset()}catch(error){status.textContent=error.message}finally{submit.disabled=false}
  });
  fetch(`${API}/api/storefront/config?shop=${encodeURIComponent(store)}`).then(response=>response.ok?response.json():null).then(data=>{if(data){currency=data.currency||currency;applySettings(data)}}).catch(()=>{});
  root.querySelector('.lb-launcher').onclick=()=>chat.classList.toggle('open');
  root.querySelector('.lb-close').onclick=()=>chat.classList.remove('open');
  root.querySelector('.lb-minimize').onclick=()=>chat.classList.remove('open');
  refreshStatus();
  if(merchantId&&merchantSession)setInterval(refreshStatus,60000);
})();
