const contactForm = document.getElementById('contactForm');
contactForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = document.getElementById('contactStatus');
  const submit = contactForm.querySelector('button[type="submit"]');
  const body = Object.fromEntries(new FormData(contactForm));
  const shopUrl = String(body.shopUrl || '').trim();
  body.message = `Shopify store URL: ${shopUrl}\n\n${String(body.message || '').trim()}`;
  delete body.shopUrl;
  status.textContent = 'Sending your message…';
  submit.disabled = true;

  try {
    const response = await fetch(`${window.ZAVOKA_API || ''}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Unable to send your message. Please try again.');
    status.textContent = result.message || 'Thanks — your message has been sent.';
    contactForm.reset();
  } catch (error) {
    status.textContent = error.message || 'Unable to send your message. Please try again.';
  } finally {
    submit.disabled = false;
  }
});
