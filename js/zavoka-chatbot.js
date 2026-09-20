(()=>{
  const API=window.ZAVOKA_API||'';
  const root=document.createElement('div');
  const avatarImage='magnific_close-crop-headtoneck-of-_KjICgr5kqp_1.png';
  root.innerHTML=`<button class="lb-launcher" aria-label="Open zavoka assistant"><img src="${avatarImage}" alt="Sophia, zavoka Sales Executive"></button><section class="lb-chat" aria-label="zavoka website assistant"><header><span class="lb-avatar" id="lbAvatar"><img src="${avatarImage}" alt="Sophia, zavoka Sales Executive"></span><div class="lb-heading"><strong id="lbTitle">Sophia · Sales Executive</strong><small><span class="lb-online-dot"></span> Online now</small></div><div class="lb-header-actions"><button class="lb-minimize" aria-label="Minimize chat">−</button><button class="lb-close" aria-label="Close chat">×</button></div></header><div class="lb-messages"><p class="lb-assistant" id="lbWelcome">Hi! I’m Sophia, your Sales Executive from zavoka. How can I help you about our website?</p></div><form><input placeholder="Ask about zavoka…" autocomplete="off" aria-label="Message zavoka AI"><button aria-label="Send message">➤</button></form></section>`;
  document.body.append(root);

  const chat=root.querySelector('.lb-chat');
  const messages=root.querySelector('.lb-messages');
  const form=root.querySelector('form');
  const input=root.querySelector('input');
  const sendButton=form.querySelector('button');
  const fallback='I can help with zavoka inquiry like features, pricing, plans, installation, the free trial, Enterprise, or support. What would you like to know?';
  const addMessage=(text,kind='assistant')=>{const p=document.createElement('p');p.className=`lb-${kind}`;p.textContent=text;messages.append(p);messages.scrollTop=messages.scrollHeight;};

  form.onsubmit=async event=>{
    event.preventDefault();
    const text=input.value.trim();
    if(!text)return;
    addMessage(text,'user');
    input.value='';
    input.disabled=true;
    sendButton.disabled=true;
    try{
      const response=await fetch(`${API}/api/website-chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text})});
      const data=await response.json().catch(()=>({}));
      addMessage(response.ok&&typeof data.reply==='string'&&data.reply.trim()?data.reply.trim():fallback);
    }catch{
      addMessage(fallback);
    }
    input.disabled=false;
    sendButton.disabled=false;
    input.focus();
  };

  root.querySelector('.lb-launcher').onclick=()=>chat.classList.toggle('open');
  root.querySelector('.lb-close').onclick=()=>chat.classList.remove('open');
  root.querySelector('.lb-minimize').onclick=()=>chat.classList.remove('open');
})();
