(()=>{
  if(window.__zavokaStorefrontLoaded)return;
  window.__zavokaStorefrontLoaded=true;
  const origin=new URL(document.currentScript.src,location.href).origin;
  window.ZAVOKA_API=origin;
  window.ZAVOKA_SHOPIFY_STORE=location.hostname;
  const css=document.createElement('link');
  css.rel='stylesheet';
  css.href=`${origin}/css/storefront-widget.css`;
  document.head.append(css);
  const script=document.createElement('script');
  script.src=`${origin}/js/chatbot.js`;
  script.defer=true;
  const loadWidget=()=>document.head.append(script);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadWidget,{once:true});
  else loadWidget();
})();
