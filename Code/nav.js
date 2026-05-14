//  Attaches logout functionality to all elements with the
//  'logoutBtn' class. Sends POST /logout to destroy the session,
//  then redirects to the homepage.
//
//  Loaded on every authenticated page that has a logout button.

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.logoutBtn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                await fetch('/logout', { method: 'POST', redirect: 'manual' });
            } catch {

            }
            window.location.href = '/';
        });
    });
});