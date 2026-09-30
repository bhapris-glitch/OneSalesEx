(()=>{
  const API=window.ZAVOKA_API||'';
  const merchantId=localStorage.lbMerchantId||'';
  const merchantSession=localStorage.lbMerchantSession||'';
  const root=document.createElement('div');
  root.id='lb-storefront-root';
  root.innerHTML=`<button class="lb-launcher" aria-label="Open zavoka assistant"><span>✦</span></button><section class="lb-chat" aria-label="zavoka chat"><header><span class="lb-avatar" id="lbAvatar">♙</span><div class="lb-heading"><strong id="lbTitle">AI Sales Executive</strong><small><span class="lb-online-dot"></span> Online now</small></div><div class="lb-header-actions"><button class="lb-minimize" aria-label="Minimize chat">−</button><button class="lb-close" aria-label="Close chat">×</button></div></header><div class="lb-messages"><p class="lb-assistant" id="lbWelcome">Hi! 👋 I’m your AI Sales Executive. How can I help you find the perfect product today?</p></div><form><input placeholder="Ask about our products…" autocomplete="off" aria-label="Message zavoka AI"><button aria-label="Send message">➤</button></form></section>`;
  document.body.append(root);

  const chat=root.querySelector('.lb-chat');
  const launcher=root.querySelector('.lb-launcher');
  const messages=root.querySelector('.lb-messages');
  const form=root.querySelector('form');
  const input=root.querySelector('input');
  const sendButton=form.querySelector('button');
  let locked=false;
  let notice='';
  let trialEndsAt=0;
  let countdownMessage=null;
  let countdownTimer=null;

  const websiteAnswers=[
    { test:/trial|free|credit card/i, answer:'You can start a 5-day Premium trial with full features and 50 AI chats. There is no charge during the trial and no credit card is required. Start from the Install section on the homepage.' },
    { test:/price|pricing|cost|starter|growth|premium|plan/i, answer:'zavoka plans are Starter at $25/month with 500 AI conversations, Growth at $59/month with 1,200 conversations, and Premium at $149/month with 2,300 conversations. You can cancel anytime.' },
    { test:/install|shopify|connect|setup/i, answer:'Installation starts in the Install section: enter your Shopify store URL and working email, click Install, then approve the Shopify installation. No developer is required.' },
    { test:/feature|what.*do|recommend|cart|upsell/i, answer:'zavoka chats with shoppers, recommends products, supports upsells and cross-sells, helps recover abandoned carts, matches your brand voice, and provides live sales insights around the clock.' },
    { test:/enterprise|high.?volume|custom/i, answer:'Enterprise includes custom AI configuration, a dedicated support team, and integrations with CRM, ERP, inventory, and other business systems. Request a consultation on the Enterprise page.' },
    { test:/support|contact|email|help/i, answer:'For support, installation, pricing, or enterprise questions, contact support@layboka.ai from the Contact page.' },
    { test:/cancel|change.*plan|upgrade/i, answer:'You can change or upgrade your plan whenever your store is ready, and plans can be canceled anytime.' },
    { test:/about|who are|layboka/i, answer:'zavoka AI is an always-on AI Sales Executive for Shopify merchants, helping shoppers discover products, make confident decisions, and complete purchases.' }
  ];

  const getWebsiteAnswer=(text)=>websiteAnswers.find(({test})=>test.test(text))?.answer;
  const storeDomain=window.ZAVOKA_SHOPIFY_STORE||document.querySelector('meta[name="shopify-shop-domain"]')?.content||document.documentElement.dataset.shopifyDomain||(/\.myshopify\.com$/i.test(location.hostname)?location.hostname:'');
  let storeProductsPromise=null;
  let storeCurrency='USD';
  const loadStoreProducts=()=>{
    if(!storeDomain)return Promise.resolve([]);
    if(!storeProductsPromise)storeProductsPromise=fetch(`${API}/api/storefront/products?shop=${encodeURIComponent(storeDomain)}`).then(response=>response.ok?response.json():{products:[]}).then(data=>{storeCurrency=data.currency||'USD';return data.products||[]}).catch(()=>[]);
    return storeProductsPromise;
  };
  const formatPrice=value=>{try{return new Intl.NumberFormat(undefined,{style:'currency',currency:storeCurrency}).format(Number(value))}catch{return String(value)}};
  const showProductCheckoutCards=products=>{
    const grid=document.createElement('div');grid.className='lb-product-grid';
    products.slice(0,3).forEach(product=>{
      const variants=(product.variants||[]).filter(item=>item.available!==false);if(!variants.length)return;
      let selectedVariant=variants[0];
      const card=document.createElement('article');card.className='lb-product-card';
      if(product.image){const image=document.createElement('img');image.src=product.image;image.alt='';image.loading='lazy';card.append(image)}
      const title=document.createElement('strong');title.textContent=product.title;card.append(title);
      if(variants.length>1){const select=document.createElement('select');select.setAttribute('aria-label',`Choose a variant of ${product.title}`);variants.forEach((variant,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=`${variant.title} · ${formatPrice(variant.price)}`;select.append(option)});select.addEventListener('change',()=>{selectedVariant=variants[Number(select.value)]||variants[0];price.textContent=formatPrice(selectedVariant.price)});card.append(select)}
      const price=document.createElement('small');price.textContent=formatPrice(selectedVariant.price);card.append(price);
      const button=document.createElement('button');button.type='button';button.textContent='Continue to checkout →';
      button.addEventListener('click',async()=>{button.disabled=true;button.textContent='Opening Shopify checkout…';try{const response=await fetch(`${API}/api/storefront/checkout`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({shop:storeDomain,items:[{variantId:selectedVariant.id,quantity:1}]})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to start checkout.');location.assign(data.checkoutUrl)}catch(error){button.disabled=false;button.textContent='Try checkout again';addMessage(error.message)}});
      card.append(button);grid.append(card);
    });
    if(grid.childElementCount){messages.append(grid);messages.scrollTop=messages.scrollHeight}
  };

  const addMessage=(text,kind='assistant')=>{
    const p=document.createElement('p');
    p.className=`lb-${kind}`;
    p.textContent=text;
    messages.append(p);
    messages.scrollTop=messages.scrollHeight;
  };

  const setLocked=(value)=>{
    locked=value;
    input.disabled=value;
    sendButton.disabled=value;
    if(value) input.placeholder='Chat is locked — choose a paid plan to continue.';
    else input.placeholder='Ask about products…';
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
    messages.scrollTop=messages.scrollHeight;
  };

  const showRechargeButton=()=>{
    if(messages.querySelector('.lb-recharge-action'))return;
    const wrapper=document.createElement('p');
    wrapper.className='lb-assistant lb-recharge-action';
    const button=document.createElement('button');
    button.type='button';
    button.textContent='RECHARGE NOW';
    button.addEventListener('click',()=>location.assign('dashboard.html?tab=billing'));
    wrapper.append(button);
    messages.append(wrapper);
    messages.scrollTop=messages.scrollHeight;
  };

  const applyStatus=(data)=>{
    if(!data?.settings)return;
    const paid=data.paid===true;
    const endsAt=data.trialEndsAt?new Date(data.trialEndsAt).getTime():0;
    trialEndsAt=endsAt;
    const remaining=endsAt-Date.now();
    const hours=Math.ceil(remaining/3600000);
    const usage=Number(data.usage||0);
    const limit=Number(data.limit||50);

      root.querySelector('#lbTitle').textContent=`${data.settings.agentName} · ${data.settings.storeName}`;
    root.querySelector('#lbWelcome').textContent=data.settings.welcomeMessage;
    root.style.setProperty('--orange',data.settings.themeColor);
    if(data.settings.agentPic){
      const avatar=root.querySelector('#lbAvatar');
      avatar.textContent='';
      avatar.style.backgroundImage=`url("${data.settings.agentPic.replace(/"/g,'')}")`;
      avatar.style.backgroundSize='cover';
      avatar.style.backgroundPosition='center';
    }

    if(paid){
      setLocked(false);
      return;
    }

    if(data.trialActive){
      if(usage>=limit){
        setLocked(true);
        showNotice(`Your Premium trial has used all ${limit} chats. Choose a paid plan to unlock your AI Sales Executive.`);
      }else if(hours<=48){
        showTrialCountdown();
      }
      return;
    }

    setLocked(true);
    showNotice('Your trial period has ended. Your Sales Executive is not available. Choose a paid plan to handle your customers immediately.');
    showRechargeButton();
  };

  const refreshStatus=async()=>{
    if(!merchantId)return;
    try{
      const response=await fetch(`${API}/api/merchant/settings?merchantId=${encodeURIComponent(merchantId)}`,{headers:{'x-merchant-session':merchantSession}});
      if(response.ok)applyStatus(await response.json());
    }catch{}
  };

  launcher.onclick=()=>chat.classList.toggle('open');
  root.querySelector('.lb-close').onclick=()=>chat.classList.remove('open');
  root.querySelector('.lb-minimize').onclick=()=>chat.classList.remove('open');
  refreshStatus();
  setInterval(refreshStatus,60000);

  form.onsubmit=async event=>{
    event.preventDefault();
    const text=input.value.trim();
    if(!text||locked)return;
    addMessage(text,'user');
    input.value='';
    if(storeDomain&&/product|recommend|find|buy|gift|shop|price|show|looking for/i.test(text)){
      const products=await loadStoreProducts();
      if(products.length){
        const terms=text.toLowerCase().split(/[^a-z0-9]+/).filter(word=>word.length>3&&!['product','recommend','looking','under','show'].includes(word));
        const matches=products.filter(product=>terms.some(term=>product.title.toLowerCase().includes(term)));
        addMessage('Here are available products from your store. Choose an item to continue to Shopify checkout.');
        showProductCheckoutCards(matches.length?matches:products);
        return;
      }
    }
    const knownAnswer=getWebsiteAnswer(text);
    if(knownAnswer){
      addMessage(knownAnswer);
      return;
    }
    if(storeDomain){
      addMessage('I can help you discover products from this store. Try asking about a product name, category, or gift idea.');
      return;
    }
    try{
      const response=await fetch(`${API}/api/chat/message`,{method:'POST',headers:{'Content-Type':'application/json','x-merchant-session':merchantSession},body:JSON.stringify({message:text,merchantId,visitorId:localStorage.lbVisitorId||(localStorage.lbVisitorId=crypto.randomUUID())})});
      const data=await response.json();
      if(data.locked){
        setLocked(true);
        addMessage(`${data.error||'Your trial has ended.'} Choose a paid plan to unlock your AI Sales Executive.`);
      }else addMessage(data.reply||'Please try again.');
    }catch{
      addMessage('I’m temporarily unavailable. Please try again shortly.');
    }
    messages.scrollTop=messages.scrollHeight;
  };
})();
