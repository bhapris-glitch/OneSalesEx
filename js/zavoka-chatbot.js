(()=>{
  const API=window.ZAVOKA_API||'';
  const root=document.createElement('div');
  root.className='lb-public-widget';
  const avatarImage='magnific_close-crop-headtoneck-of-_KjICgr5kqp_1.png';

  root.innerHTML=`
    <button class="lb-launcher" aria-label="Open zavoka assistant">
      <img src="${avatarImage}" alt="Sophia, zavoka Sales Executive">
    </button>
    <section class="lb-chat" aria-label="zavoka website assistant">
      <header>
        <span class="lb-avatar" id="lbAvatar">
          <img src="${avatarImage}" alt="Sophia, zavoka Sales Executive">
        </span>
        <div class="lb-heading">
          <strong id="lbTitle">Sophia · Sales Executive</strong>
          <small><span class="lb-online-dot"></span> Online now</small>
        </div>
        <div class="lb-header-actions">
          <button class="lb-minimize" aria-label="Minimize chat">−</button>
          <button class="lb-close" aria-label="Close chat">×</button>
        </div>
      </header>
      <div class="lb-messages">
        <p class="lb-assistant" id="lbWelcome">Hi! I’m Sophia, your Sales Executive from zavoka. How can I help you about our website?</p>
      </div>
      <form>
        <input placeholder="Ask about zavoka…" autocomplete="off" aria-label="Message zavoka AI">
        <button aria-label="Send message">➤</button>
      </form>
    </section>`;

  document.body.append(root);

  const chat=root.querySelector('.lb-chat');
  const messages=root.querySelector('.lb-messages');
  const form=root.querySelector('form');
  const input=root.querySelector('input');
  const sendButton=form.querySelector('button');
  const fallback='I can help with zavoka inquiry like features, pricing, plans, installation, the free trial, Enterprise, or support. What would you like to know?';
  const pricingAnswer='Our plans are Starter at $25/month with 600 AI conversations, Growth at $59/month with 1,400 AI conversations, and Premium at $149/month with 2,300 AI conversations. Enterprise pricing is custom. Plans can be canceled anytime.';

  const getLocalAnswer=(text)=>{
    const pricingQuestion=/\b(price|pricing|plan|plans|cost|starter|growth|premium)\b|how much/i;
    return pricingQuestion.test(text) ? pricingAnswer : null;
  };

  const addMessage=(text,kind='assistant')=>{
    const paragraph=document.createElement('p');
    paragraph.className=`lb-${kind}`;
    paragraph.textContent=text;
    messages.append(paragraph);
    messages.scrollTop=messages.scrollHeight;
  };

  form.onsubmit=async(event)=>{
    event.preventDefault();
    const text=input.value.trim();
    if(!text)return;

    addMessage(text,'user');
    input.value='';
    const localAnswer=getLocalAnswer(text);
    if(localAnswer){
      addMessage(localAnswer);
      return;
    }

    input.disabled=true;
    sendButton.disabled=true;
    try{
      const response=await fetch(`${API}/api/website-chat`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({message:text})
      });
      const data=await response.json().catch(()=>({}));
      const reply=response.ok&&typeof data.reply==='string'&&data.reply.trim()
        ? data.reply.trim()
        : fallback;
      addMessage(reply);
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
