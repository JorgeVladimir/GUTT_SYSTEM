(function(){
  "use strict";
  var btnAvance = document.getElementById('tabBtnAvance');
  var btnMovil = document.getElementById('tabBtnMovil');
  var panelAvance = document.getElementById('panelAvance');
  var panelMovil = document.getElementById('panelMovil');
  if (!btnAvance || !btnMovil || !panelAvance || !panelMovil) return;

  function activar(nombre){
    var esMovil = nombre === 'movil';
    panelAvance.hidden = esMovil;
    panelMovil.hidden = !esMovil;
    btnAvance.classList.toggle('is-on', !esMovil);
    btnMovil.classList.toggle('is-on', esMovil);
    btnAvance.setAttribute('aria-selected', String(!esMovil));
    btnMovil.setAttribute('aria-selected', String(esMovil));
    try { localStorage.setItem('gutt-dashboard-tab', nombre); } catch(e){}
  }

  btnAvance.addEventListener('click', function(){ activar('avance'); });
  btnMovil.addEventListener('click', function(){ activar('movil'); });

  var recordado = null;
  try { recordado = localStorage.getItem('gutt-dashboard-tab'); } catch(e){}
  if (recordado === 'movil') activar('movil');
})();
