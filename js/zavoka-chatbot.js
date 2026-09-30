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
  const fallback='I can answer questions about zavoka features, plans, pricing, the free trial, installation, Enterprise, or support. Please tell me which one you would like to know about.';
  const answers=[
    {
      test:/free trial|trial|try.*free|no charge|credit card/i,
      answer:'The trial gives you 5 days of the full Premium experience and 100 AI chats. There is no charge during the trial and no credit card is required. After 5 days or 100 chats, the assistant pauses until you choose a paid plan.'
    },
    {
      test:/feature|what does|what can|capabilit|recommend|upsell|cross.?sell|cart|brand voice|insight|analytics|24.?7/i,
      answer:'zavoka is an always-on AI Sales Executive for Shopify. It answers shopper questions, discovers products based on intent and budget, recommends relevant products, supports upsells and cross-sells, recovers abandoned carts, matches your brand voice, and provides live sales insights around the clock.'
    },
    {
      test:/price|pricing|cost|how much|starter|growth|premium|plan|plans|monthly|conversation/i,
      answer:'Monthly plans are Starter at $25 for 600 AI conversations, Growth at $59 for 1,400 AI conversations, and Premium at $149 for 2,300 AI conversations. Enterprise pricing is custom. Plans are billed monthly and can be canceled anytime.'
    },
    {
      test:/install|installation|setup|shopify|connect|app/i,
      answer:'To install zavoka, open the Install section, enter your Shopify store URL, click Install Free Trial, and approve the Shopify installation. No developer is required, and setup takes about 2 minutes. The trial begins after the Shopify connection is approved.'
    },
    {
      test:/enterprise|custom|high.?volume|integration|crm|erp/i,
      answer:'Enterprise is for high-volume stores that need a custom AI Sales Executive. It includes custom AI configuration, custom workflows and usage limits, advanced analytics, custom integrations, enterprise Shopify support, custom onboarding, and dedicated support. Contact Sales through the Enterprise page for a tailored quote.'
    },
    {
      test:/support|contact|help|email|human/i,
      answer:'For support or account help, use the Contact Us page on the website. The team can help with installation, billing, Shopify connection, and Enterprise questions.'
    },
    {
      test:/cancel|upgrade|change.*plan|switch|billing/i,
      answer:'Plans are billed monthly and can be canceled anytime. You can also change or upgrade your plan when your store needs more AI conversations or features.'
    },
    {
      test:/about|who are you|what is zavoka|zavoka ai/i,
      answer:'zavoka AI is an always-on AI Sales Executive built for Shopify merchants. It helps shoppers discover products, make confident decisions, and complete purchases while giving merchants useful sales insights.'
    }
  ];

  const getLocalAnswer=(text)=>answers.find(({test})=>test.test(text))?.answer||null;

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
