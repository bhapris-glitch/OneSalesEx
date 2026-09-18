(()=>{
  const API=window.ZAVOKA_API||'';
  const root=document.createElement('div');
  root.innerHTML=`<button class="lb-launcher" aria-label="Open zavoka assistant"><span>✦</span></button><section class="lb-chat" aria-label="zavoka website assistant"><header><span class="lb-avatar" id="lbAvatar">♙</span><div class="lb-heading"><strong id="lbTitle">zavoka AI</strong><small><span class="lb-online-dot"></span> Online now</small></div><div class="lb-header-actions"><button class="lb-minimize" aria-label="Minimize chat">−</button><button class="lb-close" aria-label="Close chat">×</button></div></header><div class="lb-messages"><p class="lb-assistant" id="lbWelcome">Hi! 👋 I’m zavoka AI. How can I help you learn about our website?</p></div><form><input placeholder="Ask about zavoka…" autocomplete="off" aria-label="Message zavoka AI"><button aria-label="Send message">➤</button></form></section>`;
  document.body.append(root);

  const chat=root.querySelector('.lb-chat');
  const messages=root.querySelector('.lb-messages');
  const form=root.querySelector('form');
  const input=root.querySelector('input');
  const sendButton=form.querySelector('button');

  const fallbackAnswers=[
    'I’m going to take a tiny AI nap 😴 I’m not sure about that one yet. Try asking about zavoka, pricing, plans, installation, or Shopify.',
    'My AI brain is feeling a little hungry 😋🥝 I couldn’t find that answer, but I can help with our features, trial, pricing, or support.',
    'Oops — that question slipped past my digital bookshelf 📚✨ Ask me something about zavoka AI and I’ll do my best to help.',
    'I’m scratching my virtual head 🤔 I don’t have a reliable answer for that yet. Could you ask it another way?',
    'My answer machine needs a quick recharge 🔋 Try asking about plans, installation, the free trial, or Enterprise.',
    'That one made my AI circuits do a little dance 💃🤖 I don’t know the answer yet. Please try a simpler question.',
    'I searched my little AI notebook and came up empty 📝😅 Ask me about zavoka features, Shopify, or pricing.',
    'I’m taking a short snack break 🍎🤖 Please try another question about our website.',
    'Hmm, my crystal ball is cloudy today 🔮 I don’t want to guess. Ask me another question and I’ll try to help.',
    'I’m still learning that topic 🌱 I’m best at answering questions about zavoka AI, plans, support, and setup.'
  ];
  const getFallbackAnswer=()=>fallbackAnswers[Math.floor(Math.random()*fallbackAnswers.length)];
  const addMessage=(text,kind='assistant')=>{const p=document.createElement('p');p.className=`lb-${kind}`;p.textContent=text;messages.append(p);messages.scrollTop=messages.scrollHeight};

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
      addMessage(response.ok&&data.reply?.trim()?data.reply.trim():getFallbackAnswer());
    }catch{addMessage(getFallbackAnswer())}
    input.disabled=false;
    sendButton.disabled=false;
    input.focus();
  };
  root.querySelector('.lb-launcher').onclick=()=>chat.classList.toggle('open');
  root.querySelector('.lb-close').onclick=()=>chat.classList.remove('open');
  root.querySelector('.lb-minimize').onclick=()=>chat.classList.remove('open');
})();
