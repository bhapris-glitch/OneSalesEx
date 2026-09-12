(()=>{
  const API=window.LAYBOKA_API||'';
  const merchantId=localStorage.lbMerchantId||'';
  const merchantSession=localStorage.lbMerchantSession||'';
  const root=document.createElement('div');
  root.innerHTML=`<button class="lb-launcher" aria-label="Open Layboka assistant"><span>✦</span></button><section class="lb-chat" aria-label="Layboka AI chat"><header><span class="lb-avatar" id="lbAvatar">♙</span><div class="lb-heading"><strong id="lbTitle">AI Sales Executive</strong><small><span class="lb-online-dot"></span> Online now</small></div><div class="lb-header-actions"><button class="lb-minimize" aria-label="Minimize chat">−</button><button class="lb-close" aria-label="Close chat">×</button></div></header><div class="lb-messages"><p class="lb-assistant" id="lbWelcome">Hi! 👋 I’m your AI Sales Executive. How can I help you find the perfect product today?</p></div><form><input placeholder="Ask about our products…" autocomplete="off" aria-label="Message Layboka AI"><button aria-label="Send message">➤</button></form></section>`;
  document.body.append(root);

  const chat=root.querySelector('.lb-chat');
  const launcher=root.querySelector('.lb-launcher');
  const messages=root.querySelector('.lb-messages');
  const form=root.querySelector('form');
  const input=root.querySelector('input');
  const sendButton=form.querySelector('button');
  let locked=false;
  let notice='';

  const websiteAnswers=[
    { test:/trial|free|credit card/i, answer:'You can start a 5-day Premium trial with full features and 100 AI chats. There is no charge during the trial and no credit card is required. Start from the Install section on the homepage.' },
    { test:/price|pricing|cost|starter|growth|premium|plan/i, answer:'Layboka plans are Starter at $25/month with 600 AI conversations, Growth at $59/month with 1,400 conversations, and Premium at $149/month with 2,300 conversations. You can cancel anytime.' },
    { test:/install|shopify|connect|setup/i, answer:'Installation starts in the Install section: enter your Shopify store URL and working email, click Install, then approve the Shopify installation. No developer is required.' },
    { test:/feature|what.*do|recommend|cart|upsell/i, answer:'Layboka chats with shoppers, recommends products, supports upsells and cross-sells, helps recover abandoned carts, matches your brand voice, and provides live sales insights around the clock.' },
    { test:/enterprise|high.?volume|custom/i, answer:'Enterprise includes custom AI configuration, a dedicated support team, and integrations with CRM, ERP, inventory, and other business systems. Request a consultation on the Enterprise page.' },
    { test:/support|contact|email|help/i, answer:'For support, installation, pricing, or enterprise questions, contact support@layboka.ai from the Contact page.' },
    { test:/cancel|change.*plan|upgrade/i, answer:'You can change or upgrade your plan whenever your store is ready, and plans can be canceled anytime.' },
    { test:/about|who are|layboka/i, answer:'Layboka AI is an always-on AI Sales Executive for Shopify merchants, helping shoppers discover products, make confident decisions, and complete purchases.' }
  ];

  const getWebsiteAnswer=(text)=>websiteAnswers.find(({test})=>test.test(text))?.answer;

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
    const remaining=endsAt-Date.now();
    const hours=Math.ceil(remaining/3600000);
    const usage=Number(data.usage||0);
    const limit=Number(data.limit||100);

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
      }else if(hours<=24){
        showNotice(`Your Premium trial expires in ${Math.max(1,hours)} hour${hours===1?'':'s'}. Choose a paid plan before it ends to keep your chatbot active.`);
      }else if(hours<=48){
        showNotice(`Your Premium trial expires in less than 48 hours. Choose a paid plan to keep your chatbot active.`);
      }
      return;
    }

    setLocked(true);
    showNotice('Your trial period has ended. This chatbot is locked. Choose a paid plan to unlock it immediately.');
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
    const knownAnswer=getWebsiteAnswer(text);
    if(knownAnswer){
      addMessage(knownAnswer);
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
