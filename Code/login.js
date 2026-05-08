
//Generating the likkle CSRF token
async function getCsrfToken() {
    const res = await fetch('/api/csrf-token', {
        credentials: 'same-origin'
    });

    const data = await res.json();
    return data.csrfToken;
}

//func that handles the login tingy
async function handleLogin() {
    const btn = document.getElementById('loginBtn');
    const errorBox = document.getElementById('errorBox');
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    errorBox.style.display = 'none';

    if (!username || !password) {
        errorBox.textContent = 'Please fill in all fields.';
        errorBox.style.display = 'block';
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Signing you in...';

    try {
        const csrfToken = await getCsrfToken()
        const res = await fetch('/login', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            body: JSON.stringify({
                username,
                password,
                _csrf: csrfToken
            }),
        });
        const data = await res.json();

        if (data.success) {
            window.location.href = data.redirect || 'dashboard';
        }
        else {
            errorBox.textContent = data.errors.join(' ');
            errorBox.style.display = 'block';
            btn.disabled = false;
            btn.textContent = 'Sign In';
        }
    }
    catch {
        errorBox.textContent = 'Network Error. Please try again!';
        errorBox.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Sign In';
    }
}
document.addEventListener('keydown', (e)=> {if (e.key === 'Enter') handleLogin()});