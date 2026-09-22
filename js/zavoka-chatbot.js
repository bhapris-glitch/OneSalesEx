(()=>{
  const API=window.ZAVOKA_API||'';
  // Local FAQ knowledge base. No external JSON request is needed.
  const faq=[
    {question:'What is zavoka AI?',answer:'zavoka AI is an always-on AI Sales Executive for Shopify merchants. It chats with shoppers, recommends products, helps with upsells and cross-sells, supports cart recovery, matches your brand voice, and provides sales insights around the clock.'},
    {question:'Who is zavoka AI for?',answer:'zavoka AI is built for Shopify stores of all sizes, from newly launched stores to high-volume enterprise brands.'},
    {question:'What can the AI Sales Executive do?',answer:'It helps shoppers discover products, understands intent, budget, categories and preferences, recommends relevant products, suggests useful upgrades and related products, answers store questions using approved information, and helps visitors move toward checkout.'},
    {question:'Does zavoka support product recommendations?',answer:'Yes. Product discovery and personalized recommendations are core features. The assistant should only describe actual products, inventory, prices, shipping, discounts or store policies when the merchant has connected and supplied that information.'},
    {question:'Does zavoka support upselling and cross-selling?',answer:'Growth and Premium plans include upsell and cross-sell capabilities. The assistant can suggest useful upgrades and frequently bought-together products without being pushy.'},
    {question:'Does zavoka recover abandoned carts?',answer:'Cart recovery is included in the Growth and Premium plans. It helps bring customers back with helpful follow-ups, offers and a smooth path to checkout.'},
    {question:'Can I customize the assistant?',answer:'Yes. Merchants can customize the executive name, picture, store name, primary colour, chat background, accent colour, behaviour, tone and welcome message from the dashboard. Custom branding is listed for Premium.'},
    {question:'Is the assistant available 24/7?',answer:'Yes. zavoka is designed to give shoppers instant assistance around the clock and across time zones.'},
    {question:'What is included in the free trial?',answer:'The free trial provides the full Premium feature set for 5 days and includes 100 AI chats. No charge is made during the trial and no credit card is required.'},
    {question:'How do I start the trial?',answer:'Use the Install section on the homepage, enter your Shopify store URL, click Install Free Trial, and approve the app installation in Shopify. The trial starts when Shopify installation is completed.'},
    {question:'How long is the trial?',answer:'The Premium trial lasts 5 days, unless the 100-chat allowance is reached first.'},
    {question:'What happens when the trial ends?',answer:'The assistant pauses when 5 days end or the 100-chat limit is reached, whichever comes first. Choose a paid plan to unlock it again. No trial charge is made.'},
    {question:'Do I need a credit card for the trial?',answer:'No. The 5-day Premium trial does not require a credit card and there is no charge during the trial.'},
    {question:'How long does installation take?',answer:'The website describes installation as taking about 2 minutes and requiring no developer or complicated setup.'},
    {question:'What do I need to install zavoka?',answer:'You need a Shopify store URL and access to approve the Shopify app installation. The public installation form asks for the store URL and may ask for a working email for installation updates and support.'},
    {question:'What are the plans and prices?',answer:'Starter is $25 per month with 600 AI conversations. Growth is $59 per month with 1,400 AI conversations. Premium is $149 per month with 2,300 AI conversations. Enterprise pricing is custom.'},
    {question:'What does Starter include?',answer:'Starter includes the AI Sales Executive, product recommendations, basic sales analysis and weekly insights, with 600 AI conversations per month.'},
    {question:'What does Growth include?',answer:'Growth includes 1,400 AI conversations, product recommendations, an upsell and cross-sell engine, abandoned cart recovery, custom personality and advanced analytics.'},
    {question:'What does Premium include?',answer:'Premium includes 2,300 AI conversations, a dedicated AI executive, advanced buyer qualification, priority AI training and 24×7 premium support. It also includes the higher-level customization and sales capabilities shown on the website.'},
    {question:'What is Enterprise?',answer:'Enterprise is a custom solution for high-volume Shopify stores. It includes custom AI configuration, dedicated support, enterprise integrations, custom workflows, custom usage limits, custom AI behaviour and custom onboarding.'},
    {question:'Which enterprise integrations are supported?',answer:'The Enterprise page describes connections to CRM, ERP, inventory and other enterprise systems. Specific integrations and technical scope are discussed during an enterprise consultation.'},
    {question:'Can I change or upgrade my plan?',answer:'Yes. The website says you can upgrade or change billing whenever your store is ready.'},
    {question:'Can I cancel anytime?',answer:'Yes. The public pricing and installation pages state that plans can be canceled anytime.'},
    {question:'Is yearly billing available?',answer:'The pricing FAQ states that yearly plans save 20% compared with monthly billing. Contact support for current yearly-plan availability and terms.'},
    {question:'How do I log in?',answer:'Use Merchant Login and provide the Shopify store URL and the email used during installation. Successful login takes you to the merchant dashboard.'},
    {question:'What is in the merchant dashboard?',answer:'The dashboard includes Shopify connection status, conversations, recommendations, cart recovery and conversion metrics, AI executive customization, analytics, billing, autopay controls, plan access and uninstall controls.'},
    {question:'How can I contact zavoka support?',answer:'For support, installation, pricing or general questions, email support@layboka.ai. Privacy questions and data requests can be sent to privacy@layboka.ai.'},
    {question:'How do I request Enterprise help?',answer:'Open the Enterprise page, complete the Request Enterprise Consultation form, and the enterprise team will contact you within 24 hours.'},
    {question:'How does zavoka handle privacy?',answer:'The Privacy Policy says zavoka collects information needed for installation, billing, support and AI Sales Executive services, does not sell personal information, and uses reasonable technical and organizational safeguards. Privacy requests can be sent to privacy@layboka.ai.'},
    {question:'What are the terms for using zavoka?',answer:'Users agree to use zavoka lawfully and keep account information accurate. Plans, trials, usage limits and cancellation terms are described on the website and may be updated with notice. Questions can be sent to support@layboka.ai.'},
    {question:'Who should I contact about a product, inventory, shipping, refund or discount?',answer:'The public website does not provide store-specific product, inventory, shipping, refund or discount information. Those details must come from the connected merchant or store support. zavoka should not invent them.'},
    {question:'What is the missed-sales calculator?',answer:'The homepage calculator estimates potentially missed sales by multiplying average product price by missed customers per month. It is only an estimate and actual results may vary.'},
    {question:'Where can I learn about zavoka?',answer:'The website has Features on the homepage, Pricing, Enterprise, About Us, Contact, Merchant Login, Install, Privacy Policy and Terms & Conditions pages.'}
  ];
  const root=document.createElement('div');
  root.className='lb-public-widget';
  const avatarImage='magnific_close-crop-headtoneck-of-_KjICgr5kqp_1.png';

  root.innerHTML=`
    <button class="lb-launcher" aria-label="Open zavoka assistant">
      <img src="${avatarImage}" alt="Sophia, zavoka Sales Executive">
    </button>
    <section class="lb-chat" aria-label="zavoka website assistant">
      <header>
        <span class="lb-avatar" id="lbAvatar"><img src="${avatarImage}" alt="Sophia, zavoka Sales Executive"></span>
        <div class="lb-heading"><strong id="lbTitle">Sophia · Sales Executive</strong><small><span class="lb-online-dot"></span> Online now</small></div>
        <div class="lb-header-actions"><button class="lb-minimize" aria-label="Minimize chat">−</button><button class="lb-close" aria-label="Close chat">×</button></div>
      </header>
      <div class="lb-messages"><p class="lb-assistant" id="lbWelcome">Hi! I’m Sophia, your Sales Executive from zavoka. How can I help you today?</p></div>
      <form><input placeholder="Ask about zavoka…" autocomplete="off" aria-label="Message zavoka AI"><button aria-label="Send message">➤</button></form>
    </section>`;
  document.body.append(root);

  const chat=root.querySelector('.lb-chat');
  const messages=root.querySelector('.lb-messages');
  const form=root.querySelector('form');
  const input=root.querySelector('input');
  const sendButton=form.querySelector('button');
  const fallback='I can help with zavoka features, plans, pricing, the free trial, installation, Enterprise, support, privacy, or billing. What would you like to know?';

  const addMessage=(text,kind='assistant')=>{
    const paragraph=document.createElement('p');
    paragraph.className=`lb-${kind}`;
    paragraph.textContent=text;
    messages.append(paragraph);
    messages.scrollTop=messages.scrollHeight;
  };

  const normalize=value=>String(value||'').toLowerCase()
    .replace(/[^a-z0-9$]+/g,' ')
    .trim();
  const words=value=>new Set(normalize(value).split(/\s+/).filter(word=>word.length>2));
  const aliases={
    trial:['free','try','credit','charge','allowance','days'],
    pricing:['price','cost','monthly','plan','plans','billing'],
    installation:['install','setup','connect','shopify','developer'],
    feature:['features','capability','capabilities','recommendation','upsell','crosssell','cart'],
    enterprise:['custom','volume','integration','crm','erp','dedicated'],
    support:['help','contact','email','human'],
    privacy:['data','personal','security','privacy'],
    cancel:['cancel','upgrade','change','switch','yearly']
  };

  const scoreQuestion=(query,question)=>{
    const queryWords=words(query);
    const questionWords=words(question);
    let score=0;
    queryWords.forEach(word=>{ if(questionWords.has(word))score+=3; });
    Object.values(aliases).forEach(group=>{
      if(group.some(word=>queryWords.has(word))&&group.some(word=>questionWords.has(word)))score+=2;
    });
    return score;
  };

  const getFaqAnswer=query=>{
    if(!faq.length)return null;
    let best=null;
    let bestScore=0;
    faq.forEach(item=>{
      const score=scoreQuestion(query,item.question);
      if(score>bestScore){ best=item; bestScore=score; }
    });
    // Require at least one meaningful match so unrelated questions use the API fallback.
    return bestScore>=3?best.answer:null;
  };

  const askApi=async text=>{
    const response=await fetch(`${API}/api/website-chat`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:text})
    });
    const data=await response.json().catch(()=>({}));
    return response.ok&&typeof data.reply==='string'&&data.reply.trim()?data.reply.trim():fallback;
  };

  form.onsubmit=async event=>{
    event.preventDefault();
    const text=input.value.trim();
    if(!text||input.disabled)return;
    addMessage(text,'user');
    input.value='';
    input.disabled=true;
    sendButton.disabled=true;
    try{
      const localAnswer=getFaqAnswer(text);
      addMessage(localAnswer||await askApi(text));
    }catch{
      addMessage(fallback);
    }finally{
      input.disabled=false;
      sendButton.disabled=false;
      input.focus();
    }
  };

  root.querySelector('.lb-launcher').onclick=()=>chat.classList.toggle('open');
  root.querySelector('.lb-close').onclick=()=>chat.classList.remove('open');
  root.querySelector('.lb-minimize').onclick=()=>chat.classList.remove('open');
})();
