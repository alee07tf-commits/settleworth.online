(function(){
  // ---- FAQ accordion (acccesible) ----
  document.querySelectorAll('.faq-q').forEach(function(q){
    q.addEventListener('click', function(){
      var open = q.parentElement.classList.toggle('open');
      q.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });

  // ---- TOC scrollspy (con throttle rAF para INP) ----
  var toc = document.getElementById('toc');
  if(toc){
    var links = [].slice.call(toc.querySelectorAll('a'));
    var secs = links.map(function(a){ return document.getElementById(a.getAttribute('href').slice(1)); });
    var ticking = false;
    function spy(){
      var y = window.scrollY + 120, cur = 0;
      secs.forEach(function(s,i){ if(s && s.offsetTop <= y) cur = i; });
      links.forEach(function(a,i){ a.classList.toggle('active', i===cur); });
      ticking = false;
    }
    window.addEventListener('scroll', function(){ if(!ticking){ ticking = true; requestAnimationFrame(spy); } }, {passive:true});
    spy();
  }

  // ---- menú móvil (accesible: actualiza aria-expanded) ----
  var menuBtn = document.querySelector('.menu-btn');
  if(menuBtn){
    menuBtn.addEventListener('click', function(){
      var nav = document.getElementById('topnav') || document.querySelector('.topnav') || document.querySelector('.nav-links');
      if(nav){
        var open = nav.classList.toggle('open');
        menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
    });
  }
})();
