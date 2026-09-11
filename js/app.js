const API_BASE=(window.LAYBOKA_API||'').replace(/\/$/,'');

const demoReplies={
  'Find a gift under $100':'Great choice! I found three thoughtful gifts under $100 that shoppers love.',
  'What should I wear on vacation?':'For a vacation-ready look, I recommend a lightweight set, versatile sandals, and a sun hat.',
  'Show me your best sellers':'Our best sellers right now are the everyday tote, signature candle, and travel-ready essentials.'
};
const demoMessages=document.getElementById('demoMessages');
const demoInput=document.getElementById('demoInput');
const addDemoMessage=(text,kind='assistant')=>{if(!demoMessages)return;const p=document.createElement('p');p.className=`lb-${kind}`;p.textContent=text;demoMessages.append(p);demoMessages.scrollTop=demoMessages.scrollHeight};
const runDemo=question=>{if(!question)return;addDemoMessage(question,'user');setTimeout(()=>{addDemoMessage(demoReplies[question]||'I found a few personalized options based on your preferences. Here are the best matches.');if(demoMessages){const cards=document.createElement('div');cards.className='demo-products';cards.innerHTML='<article><b>✦</b><strong>Top match</strong><small>Personalized recommendation</small></article><article><b>✦</b><strong>Best seller</strong><small>Popular with similar shoppers</small></article><article><b>✦</b><strong>Great value</strong><small>Excellent everyday choice</small></article>';demoMessages.append(cards)}},350)};
document.querySelectorAll('[data-demo-question]').forEach(button=>button.addEventListener('click',()=>{demoInput.value=button.dataset.demoQuestion;runDemo(button.dataset.demoQuestion);demoInput.value=''}));
document.getElementById('demoForm')?.addEventListener('submit',event=>{event.preventDefault();const question=demoInput.value.trim();runDemo(question);demoInput.value=''});
const calculateMissedSales=()=>{const price=Number(document.getElementById('productPriceInput')?.value||0);const customers=Number(document.getElementById('missedCustomersInput')?.value||0);const result=document.getElementById('missedSalesResult');if(result)result.textContent=`$${Math.round(Math.max(0,price)*Math.max(0,customers)).toLocaleString()}`};
['productPriceInput','missedCustomersInput'].forEach(id=>document.getElementById(id)?.addEventListener('input',calculateMissedSales));
const menu=document.querySelector('.menu-toggle');
const links=document.querySelector('.nav-links');
if(menu&&links) menu.addEventListener('click',()=>{
  const isOpen=links.classList.toggle('open');
  menu.textContent=isOpen?'❌':'☰';
  menu.setAttribute('aria-expanded',String(isOpen));
});

let selectedPlan=new URLSearchParams(window.location.search).get('plan')||'';
const configurePlan=plan=>{
  selectedPlan=plan||'';
  const shopInput=document.getElementById('shopUrl');
  if(shopInput) shopInput.required=!selectedPlan;
  const title=document.querySelector('#installForm h3');
  const status=document.getElementById('installStatus');
  if(title&&selectedPlan) title.textContent=`Subscribe to ${selectedPlan[0].toUpperCase()+selectedPlan.slice(1)} with Stripe`;
  if(status&&selectedPlan) status.textContent='You’ll continue securely to Stripe Checkout.';
};
configurePlan(selectedPlan);
document.querySelectorAll('.subscribe-button').forEach(button=>button.addEventListener('click',()=>configurePlan(button.dataset.plan)));

const form=document.getElementById('installForm');
if(form) form.addEventListener('submit',async event=>{
  event.preventDefault();
  const status=document.getElementById('installStatus');
  const shop=document.getElementById('shopUrl').value.trim();
  const email=document.getElementById('workEmail').value.trim();
  status.textContent=selectedPlan?'Opening secure Stripe Checkout…':'Preparing your secure installation…';
  try{
    const endpoint=selectedPlan?'/api/checkout':'/api/install';
    const body=selectedPlan?{plan:selectedPlan,email,merchantId:localStorage.getItem('lbMerchantId')||''}:{shop,email};
    const response=await fetch(`${API_BASE}${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.error||`Unable to continue (HTTP ${response.status})`);
    if(data.merchantId) localStorage.setItem('lbMerchantId',data.merchantId);
    if(data.session) localStorage.setItem('lbMerchantSession',data.session);
    if(selectedPlan){
      if(!data.url) throw new Error('Stripe Checkout URL was not returned. Check the API and Stripe price configuration.');
      window.location.assign(data.url);
      return;
    }
    status.innerHTML=`<strong>Trial ready.</strong> ${data.message||'Continue to Shopify to connect your store.'}`;
    if(data.installUrl) window.location.href=data.installUrl;
  }catch(error){status.textContent=error.message+' You can try again or contact support.';}
});

const loginPanel=document.getElementById('merchant-login');
const loginForm=document.getElementById('loginForm');
const openLogin=()=>{if(!loginPanel)return;loginPanel.classList.add('open');loginPanel.setAttribute('aria-hidden','false');document.getElementById('loginEmail')?.focus()};
document.querySelectorAll('a[href="#merchant-login"]').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();openLogin()}));
loginPanel?.querySelector('.login-close')?.addEventListener('click',()=>{loginPanel.classList.remove('open');loginPanel.setAttribute('aria-hidden','true')});
loginPanel?.addEventListener('click',event=>{if(event.target===loginPanel){loginPanel.classList.remove('open');loginPanel.setAttribute('aria-hidden','true')}});
loginForm?.addEventListener('submit',async event=>{event.preventDefault();const email=document.getElementById('loginEmail').value.trim();const shop=document.getElementById('loginShop').value.trim();const status=document.getElementById('loginStatus');status.textContent='Checking your merchant account…';try{const response=await fetch(`${API_BASE}/api/merchant/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({shop,email})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Store URL or email was not found.');if(data.merchantId)localStorage.setItem('lbMerchantId',data.merchantId);if(data.session)localStorage.setItem('lbMerchantSession',data.session);localStorage.setItem('lbLoginEmail',email);window.location.assign(`dashboard.html?merchantId=${encodeURIComponent(data.merchantId)}`)}catch(error){status.textContent=error.message}});
