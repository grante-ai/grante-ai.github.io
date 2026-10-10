/* The welcome page is for signed-in people. Everyone else goes to create an account (or sign in) first. */
(function () {
  let session = null, known = false;
  for (const store of [localStorage, sessionStorage]) {
    try { const raw = store.getItem("grante.session"); if (raw) { session = JSON.parse(raw); break; } } catch (e) { /* treated as signed out */ }
  }
  try { known = localStorage.getItem("grante.known") === "1"; } catch (e) { /* fine */ }
  if (!session || !session.user) { location.replace(known ? "app/#/signin" : "app/#/signup"); return; }
  if (!session.user.email_verified) { location.replace("app/"); return; }   // Grante shows the confirm-your-email screen
  document.documentElement.classList.add("ready");
  document.addEventListener("DOMContentLoaded", function () {
    const first = String(session.user.display_name || "").split(" ")[0] || "there";
    document.querySelectorAll("[data-first-name]").forEach(function (el) { el.textContent = first; });
    document.querySelectorAll("[data-sign-out]").forEach(function (el) {
      el.addEventListener("click", function (event) {
        event.preventDefault();
        for (const store of [localStorage, sessionStorage]) { try { store.removeItem("grante.session"); } catch (e) { /* fine */ } }
        location.replace("app/#/signin");
      });
    });
  });
})();
