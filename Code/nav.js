document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.logoutBtn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                await fetch('/logout', { method: 'POST', redirect: 'manual' });
            } catch {
                // ignore
            }
            window.location.href = '/';
        });
    });
});