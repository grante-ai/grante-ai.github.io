/* "Open Grante" opens Grante in its own window, sized like an app.
   If the browser blocks new windows, the link simply opens Grante in this tab instead. */
document.querySelectorAll("a.open-grante").forEach((link) => {
  link.addEventListener("click", (event) => {
    if (window.innerWidth < 900) return;   // on phones and small screens, a normal page works better
    const width = Math.min(1240, screen.availWidth - 60), height = Math.min(860, screen.availHeight - 80);
    const left = Math.round((screen.availWidth - width) / 2), top = Math.round((screen.availHeight - height) / 2);
    const opened = window.open(link.href, "grante-app", `popup=yes,width=${width},height=${height},left=${left},top=${top}`);
    if (opened) { event.preventDefault(); opened.focus(); }
  });
});
