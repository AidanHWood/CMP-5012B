
      // Allow Enter key to submit
      document
        .getElementById("confirm_password")
        .addEventListener("keydown", function (e) {
          if (e.key === "Enter") handleReset();
        });

      function validatePassword(password) {
        const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
        return regex.test(password);
      }

      async function handleReset() {
        const password = document.getElementById("password").value;
        const confirm_password =
          document.getElementById("confirm_password").value;
        const errorBox = document.getElementById("errorBox");
        const successBox = document.getElementById("successBox");
        const btn = document.getElementById("resetBtn");

        errorBox.style.display = "none";
        successBox.style.display = "none";

        if (!password || !validatePassword(password)) {
          errorBox.textContent = 'Password must be at least 8 characters and contain an uppercase letter, lowercase letter, number, and special character.';
          errorBox.style.display = 'block';
          return;
        }
        if (password !== confirm_password) {
          errorBox.textContent = "Passwords do not match.";
          errorBox.style.display = "block";
          return;
        }

        btn.disabled = true;
        btn.textContent = "Resetting...";

        try {
          const res = await fetch("/api/reset-password", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password, confirm_password }),
          });

          const data = await res.json();

          if (!res.ok) {
            errorBox.textContent = data.errors
              ? data.errors.join(" ")
              : "Reset failed.";
            errorBox.style.display = "block";
          } else {
            successBox.textContent = "Password reset! Redirecting to login...";
            successBox.style.display = "block";

            // Clean up
            localStorage.removeItem("resetEmail");

            setTimeout(() => {
              window.location.href = "login.html";
            }, 2000);
          }
        } catch (err) {
          errorBox.textContent = "Network error. Please try again.";
          errorBox.style.display = "block";
        }

        btn.disabled = false;
        btn.textContent = "Reset Password";
      }
