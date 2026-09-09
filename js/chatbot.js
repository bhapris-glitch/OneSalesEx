(()=>{
  const API=window.LAYBOKA_API||'';
  const merchantId=localStorage.lbMerchantId||'';
  const root=document.createElement('div');
  root.innerHTML=`<button class="lb-launcher" aria-label="Open Layboka assistant">✦</button><section class="lb-chat" aria-label="Layboka AI chat"><header><span class="lb-avatar" id="lbAvatar">✦</span><strong id="lbTitle">Emily · Layboka AI</strong><button class="lb-close">×</button></header><div class="lb-messages"><p class="lb-assistant" id="lbWelcome">Hi! I’m Emily. How can I help you shop today?</p></div><form><input placeholder="Ask about products…" autocomplete="off"><button>Send</button></form></section>`;
  document.body.append(root);

  const chat=root.querySelector('.lb-chat');
  const launcher=root.querySelector('.lb-launcher');
  const messages=root.querySelector('.lb-messages');
  const form=root.querySelector('form');
  const input=root.querySelector('input');
  const sendButton=form.querySelector('button');
  let locked=false;
  let notice='';

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
    showNotice('Your 5-day Premium trial has ended. This chatbot is locked. Choose a paid plan to unlock it immediately.');
  };

  const refreshStatus=async()=>{
    if(!merchantId)return;
    try{
      const response=await fetch(`${API}/api/merchant/settings?merchantId=${encodeURIComponent(merchantId)}`);
      if(response.ok)applyStatus(await response.json());
    }catch{}
  };

  launcher.onclick=()=>chat.classList.toggle('open');
  root.querySelector('.lb-close').onclick=()=>chat.classList.remove('open');
  refreshStatus();
  setInterval(refreshStatus,60000);

  form.onsubmit=async event=>{
    event.preventDefault();
    const text=input.value.trim();
    if(!text||locked)return;
    addMessage(text,'user');
    input.value='';
    try{
      const response=await fetch(`${API}/api/chat/message`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text,merchantId,visitorId:localStorage.lbVisitorId||(localStorage.lbVisitorId=crypto.randomUUID())})});
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
