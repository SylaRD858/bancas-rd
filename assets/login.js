/* Pantalla de inicio de sesión compartida */
(function () {
  const { U, Auth, UI, DB } = BRD;
  BRD.loginScreen = function (root, { title, subtitle, allow, onLogin }) {
    if (BRD.Brand) BRD.Brand.refresh();
    const cfg = DB.cfg();
    root.innerHTML = `<div class="login-wrap"><form class="card login" id="lf">
      <div style="text-align:center"><img src="assets/logo.webp" alt="AuraSport" style="width:min(260px,80%);height:auto"></div>
      <h3 style="text-align:center">${U.esc(title)}</h3>
      <p class="mut" style="text-align:center;margin-top:-4px">${U.esc(subtitle || '')}</p>
      <div class="field"><label>Usuario</label><input name="u" autocomplete="username" required></div>
      <div class="field"><label>Contraseña</label><input name="p" type="password" autocomplete="current-password" required></div>
      <div id="lerr" class="small" style="color:#ff8a8a;min-height:18px"></div>
      <button class="btn pri lg" style="width:100%;justify-content:center">Entrar</button>
      <p class="small" style="text-align:center;margin-top:14px">Modo de datos: <b>${DB.mode}</b> · v${DB.VERSION}</p>
      <p class="small" style="text-align:center"><a href="index.html">← Inicio</a></p>
    </form></div>`;
    UI.$('#lf', root).addEventListener('submit', async e => {
      e.preventDefault(); const f = UI.formData(e.target);
      try {
        const u = await Auth.login(f.u, f.p);
        if (allow && !allow(u)) { Auth.logout(); throw new Error('Su rol no tiene acceso a esta aplicación'); }
        if (u.mustChange) { await BRD.changePassword(u, true); }
        onLogin(Auth.user());
      } catch (err) { UI.$('#lerr', root).textContent = err.message; }
    });
  };
  BRD.changePassword = function (u, forced) {
    return new Promise(res => {
      const m = UI.modal('Cambiar contraseña', `<form id="cp">
        ${forced ? '<p class="mut">Por seguridad debe cambiar la contraseña inicial.</p>' : ''}
        <div class="field"><label>Nueva contraseña (mín. 6)</label><input name="a" type="password" minlength="6" required></div>
        <div class="field"><label>Repetir</label><input name="b" type="password" minlength="6" required></div>
        <div id="cperr" class="small" style="color:#ff8a8a"></div>
        <button class="btn pri">Guardar</button></form>`, { locked: forced });
      m.querySelector('#cp').addEventListener('submit', async e => {
        e.preventDefault(); const f = UI.formData(e.target);
        if (f.a !== f.b) { m.querySelector('#cperr').textContent = 'No coinciden'; return; }
        await Auth.setPassword(u.id, f.a); DB.log('usuario.clave', u.username); UI.closeModal(); UI.toast('Contraseña actualizada'); res();
      });
    });
  };
})();
