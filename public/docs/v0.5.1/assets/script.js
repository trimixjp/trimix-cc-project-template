
// アクティブリンクのハイライト
(function() {
  const currentPath = window.location.pathname;
  const links = document.querySelectorAll('.nav-list a');
  links.forEach(link => {
    if (link.href && currentPath.endsWith(link.getAttribute('href').split('/').pop())) {
      link.closest('li').classList.add('active');
    }
  });
})();
