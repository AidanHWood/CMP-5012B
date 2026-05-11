
//Generating the likkle CSRF token
async function getCsrfToken() {
    const res = await fetch('/api/csrf-token', {
        credentials: 'same-origin'
    });

    const data = await res.json();
    return data.csrfToken;
}

async  function togglePassword(){
    var x = document.getElementById('password');
    if (x.type === "password"){
        x.type = "text";
    }
    else{
        x.type = "password";
    }
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
async function checkRecentLogout() {
    try {
        const res  = await fetch('/api/recent-logout');
        const data = await res.json();

        if (data.available && data.username) {
            // Pre-fill the username field
            document.getElementById('username').value = data.username;

            // Show a friendly banner
            const banner = document.getElementById('recentLogoutBanner');
            if (banner) {
                banner.textContent = `Welcome back, ${data.username}! Just enter your password to continue.`;
                banner.style.display = 'block';
            }

            // Focus the password field so the user can just start typing
            document.getElementById('password').focus();
        }
    } catch {
        // Silently fail — not critical
    }
}

document.addEventListener('keydown', (e)=> {if (e.key === 'Enter') handleLogin()});