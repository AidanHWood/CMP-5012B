async function getCsrfToken() {
    const res  = await fetch('/api/csrf-token');
    const data = await res.json();
    return data.csrfToken;
}

function val(id) { return document.getElementById(id).value.trim(); }

async function handleRegister() {
    const btn      = document.getElementById('registerBtn');
    const errorBox = document.getElementById('errorBox');
    errorBox.style.display = 'none';

    const payload = {
        username:         val('username'),
        real_name:        val('real_name'),
        email:            val('email'),
        password:         document.getElementById('password').value,
        confirm_password: document.getElementById('confirm_password').value,
        height_cm:        val('height_cm')        || null,
        weight_kg:        val('weight_kg')        || null,
        age:              val('age')              || null,
        gender:           val('gender')           || null
    };

    btn.disabled    = true;
    btn.textContent = 'Creating account...';

    try {
        const csrfToken = await getCsrfToken();
        payload._csrf   = csrfToken;

        const res  = await fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify(payload),
        });
        const data = await res.json();

        if (data.success) {
            successBox.textContent = 'Account created successfully!';
            successBox.style.display = 'block';

            btn.disabled = true;
            btn.textContent = 'Account Created';
        }
         else {
            errorBox.textContent   = data.errors.join(' ');
            errorBox.style.display = 'block';
            btn.disabled    = false;
            btn.textContent = 'Create Account';
        }
    } catch {
        errorBox.textContent   = 'Network error. Please try again.';
        errorBox.style.display = 'block';
        btn.disabled    = false;
        btn.textContent = 'Create Account';
    }
}


//The user will have to fill this out every time the server is restarted at the moment, will be fixed later xx