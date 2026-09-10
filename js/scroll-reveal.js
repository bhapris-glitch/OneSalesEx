(() => {
  const items = document.querySelectorAll(
    'main section, main .section-heading, main .feature-grid article, main .pricing-grid article, main .enterprise-features article, main .install-card, main .pain-example, main .steps, main .faq, main form, main .admin-panels > *'
  );

  items.forEach((element, index) => {
    element.classList.add('reveal');
    if (element.parentElement?.matches('.feature-grid, .pricing-grid, .enterprise-features, .admin-panels')) {
      element.style.setProperty('--reveal-index', index % 4);
    }
  });

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    items.forEach(element => element.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -35px' });

  items.forEach(element => observer.observe(element));
})();
