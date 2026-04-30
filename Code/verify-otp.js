
      // ——— Get the email from localStorage ———
      const resetEmail = localStorage.getItem("resetEmail") || "";
      if (resetEmail) {
        document.getElementById("emailDisplay").textContent = resetEmail;
      } else {
        // No email stored — send them back
        window.location.href = "forgot-password.html";
      }

      // ——— OTP input auto-focus behavior ———
      // When you type a digit, it automatically jumps to the next box.
      // Backspace goes back to the previous box.
      // Pasting a full 6-digit code fills all boxes at once.
      const otpInputs = document.querySelectorAll(".otp-inputs input");

      otpInputs.forEach((input, index) => {
        // Only allow digits
        input.addEventListener("input", function () {
          this.value = this.value.replace(/[^0-9]/g, "");
          if (this.value && index < otpInputs.length - 1) {
            otpInputs[index + 1].focus();
          }
        });

        // Backspace moves to previous box
        input.addEventListener("keydown", function (e) {
          if (e.key === "Backspace" && !this.value && index > 0) {
            otpInputs[index - 1].focus();
          }
          if (e.key === "Enter") {
            handleVerify();
          }
        });

        // Handle paste — fills all 6 boxes from clipboard
        input.addEventListener("paste", function (e) {
          e.preventDefault();
          const pasted = e.clipboardData.getData("text").replace(/[^0-9]/g, "");
          otpInputs.forEach((inp, i) => {
            if (pasted[i]) inp.value = pasted[i];
          });
          const focusIndex = Math.min(pasted.length, otpInputs.length) - 1;
          if (focusIndex >= 0) otpInputs[focusIndex].focus();
        });
      });

      // ——— Countdown timer ———
      // Shows how much time is left before the code expires.
      // When it hits 0, the message changes to tell them to request a new code.
      let timeLeft = 5 * 60; // 5 minutes in seconds

      const timerInterval = setInterval(() => {
        timeLeft--;
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        document.getElementById("timer").textContent =
          `Code expires in ${mins}:${secs.toString().padStart(2, "0")}`;

        if (timeLeft <= 0) {
          clearInterval(timerInterval);
          document.getElementById("timer").textContent =
            "Code expired — request a new one";
          document.getElementById("timer").style.color = "#d11a2a";
        }
      }, 1000);

      // ——— Verify the OTP ———
      async function handleVerify() {
        // Collect all 6 digits into one string
        const otp = Array.from(otpInputs)
          .map((i) => i.value)
          .join("");
        const errorBox = document.getElementById("errorBox");
        const successBox = document.getElementById("successBox");
        const btn = document.getElementById("verifyBtn");

        errorBox.style.display = "none";
        successBox.style.display = "none";

        if (otp.length !== 6) {
          errorBox.textContent = "Please enter the full 6-digit code.";
          errorBox.style.display = "block";
          return;
        }

        btn.disabled = true;
        btn.textContent = "Verifying...";

        try {
          const res = await fetch("/api/verify-otp", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: resetEmail, otp }),
          });

          const data = await res.json();

          if (!res.ok) {
            errorBox.textContent = data.errors
              ? data.errors.join(" ")
              : "Invalid code.";
            errorBox.style.display = "block";
          } else {
            successBox.textContent = "Code verified! Redirecting...";
            successBox.style.display = "block";
            clearInterval(timerInterval);
            setTimeout(() => {
              window.location.href = "reset-password.html";
            }, 1000);
          }
        } catch (err) {
          errorBox.textContent = "Network error. Please try again.";
          errorBox.style.display = "block";
        }

        btn.disabled = false;
        btn.textContent = "Verify Code";
      }

      // ——— Resend the code ———
      async function handleResend() {
        const errorBox = document.getElementById("errorBox");
        const successBox = document.getElementById("successBox");

        errorBox.style.display = "none";
        successBox.style.display = "none";

        try {
          const csrfRes = await fetch("/api/csrf-token", {
            credentials: "same-origin",
          });
          const csrfData = await csrfRes.json();

          const res = await fetch("/api/forgot-password", {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": csrfData.csrfToken,
            },
            body: JSON.stringify({
              email: resetEmail,
              _csrf: csrfData.csrfToken,
            }),
          });

          if (res.ok) {
            successBox.textContent = "New code sent! Check your email.";
            successBox.style.display = "block";

            // Reset timer
            timeLeft = 5 * 60;
            document.getElementById("timer").style.color = "#999";

            // Clear old input
            otpInputs.forEach((i) => (i.value = ""));
            otpInputs[0].focus();
          } else {
            errorBox.textContent = "Could not resend code. Try again.";
            errorBox.style.display = "block";
          }
        } catch (err) {
          errorBox.textContent = "Network error. Please try again.";
          errorBox.style.display = "block";
        }
      }