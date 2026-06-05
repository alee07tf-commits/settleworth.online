(function(){
  // ---- FAQ accordion (both pages) ----
  document.querySelectorAll('.faq-q').forEach(function(q){
    q.addEventListener('click', function(){ q.parentElement.classList.toggle('open'); });
  });

  // ---- TOC scrollspy (car page) ----
  var toc = document.getElementById('toc');
  if(toc){
    var links = [].slice.call(toc.querySelectorAll('a'));
    var secs = links.map(function(a){ return document.getElementById(a.getAttribute('href').slice(1)); });
    function spy(){
      var y = window.scrollY + 120, cur = 0;
      secs.forEach(function(s,i){ if(s && s.offsetTop <= y) cur = i; });
      links.forEach(function(a,i){ a.classList.toggle('active', i===cur); });
    }
    window.addEventListener('scroll', spy, {passive:true}); spy();
  }

  // ---- mobile menu toggle ----
  var menuBtn = document.querySelector('.menu-btn');
  if(menuBtn){
    menuBtn.addEventListener('click', function(){
      var nav = document.querySelector('.topnav') || document.querySelector('.nav-links');
      if(nav) nav.classList.toggle('open');
    });
  }
})();
