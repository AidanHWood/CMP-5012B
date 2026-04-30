
      // ═══════════════════════════════════════════════════════════════
      //  MET Values (Metabolic Equivalent of Task)
      // ═══════════════════════════════════════════════════════════════
      //
      //  MET is a standard scientific measure of exercise intensity.
      //  1 MET = energy cost of sitting quietly ≈ 1 kcal/kg/hour.
      //
      //  The formula to calculate calories burned:
      //    Calories = MET × weight (kg) × duration (hours)
      //
      //  Example: Running at medium intensity (MET 8.0), 75kg person, 30 min:
      //    8.0 × 75 × (30/60) = 300 kcal
      //
      //  These MET values come from the Compendium of Physical Activities,
      //  a widely used research database maintained by Arizona State University.
      //
      //  Source: Ainsworth BE et al. "Compendium of Physical Activities"
      //  https://pacompendium.com/
      //
      //  The user can always override the estimate with their own value.
      // ═══════════════════════════════════════════════════════════════

      const MET_VALUES = {
        running: { low: 6.0, medium: 8.0, high: 11.5 }, // jogging → running → fast running
        cycling: { low: 4.0, medium: 6.8, high: 10.0 }, // leisure → moderate → vigorous
        walking: { low: 2.5, medium: 3.5, high: 5.0 }, // slow → brisk → power walking
        swimming: { low: 4.5, medium: 7.0, high: 10.0 }, // leisurely → moderate → vigorous
        gym: { low: 3.5, medium: 5.0, high: 8.0 }, // light weights → moderate → intense
        sport: { low: 4.0, medium: 6.0, high: 8.0 }, // casual → competitive → intense
      };

      // Which exercise types should show the distance field
      const DISTANCE_TYPES = ["running", "cycling", "walking", "swimming"];

      // User's weight — fetched from the database on page load, defaults to 70kg
      let userWeight = 70;

      // ═══════════════════════════════════════════════════════════════
      //  Fetch the user's weight from their profile
      // ═══════════════════════════════════════════════════════════════

      async function loadUserWeight() {
        try {
          const res = await fetch("/api/user-weight");
          if (res.ok) {
            const data = await res.json();
            userWeight = data.weight_kg || 70;
          }
        } catch (err) {
          console.log("Could not fetch user weight, using default 70kg");
        }
      }

      // ═══════════════════════════════════════════════════════════════
      //  Calculate estimated calories using MET formula
      //
      //  Calories = MET × weight_kg × (duration_min / 60)
      // ═══════════════════════════════════════════════════════════════

      function calculateBurn(exerciseType, intensity, durationMin) {
        const met = MET_VALUES[exerciseType]?.[intensity] || 5.0;
        const hours = durationMin / 60;
        return Math.round(met * userWeight * hours);
      }

      // ═══════════════════════════════════════════════════════════════
      //  Auto-estimate: runs every time the user changes type,
      //  duration, or intensity
      // ═══════════════════════════════════════════════════════════════

      function onFormChange() {
        const exerciseEl = document.querySelector(
          'input[name="exercise"]:checked',
        );
        const intensityEl = document.querySelector(
          'input[name="intensity"]:checked',
        );
        const duration = Number(document.getElementById("duration").value) || 0;

        // Show/hide distance field based on exercise type
        const distanceSection = document.getElementById("distanceSection");
        if (exerciseEl && DISTANCE_TYPES.includes(exerciseEl.value)) {
          distanceSection.style.display = "block";
        } else {
          distanceSection.style.display = "none";
        }

        // Calculate estimated burn using MET formula
        let estimate = 0;
        if (exerciseEl && intensityEl && duration > 0) {
          estimate = calculateBurn(
            exerciseEl.value,
            intensityEl.value,
            duration,
          );
        }

        document.getElementById("estimatedBurn").textContent =
          estimate + " kcal";
      }

      // ═══════════════════════════════════════════════════════════════
      //  Add exercise — sends to the server API
      // ═══════════════════════════════════════════════════════════════

      async function addExercise() {
        const exerciseEl = document.querySelector(
          'input[name="exercise"]:checked',
        );
        const intensityEl = document.querySelector(
          'input[name="intensity"]:checked',
        );
        const duration = document.getElementById("duration").value;
        const distance = document.getElementById("distance").value;
        const overrideCals = document.getElementById("caloriesOverride").value;

        // Validation
        if (!exerciseEl) return alert("Please select an exercise type.");
        if (!duration || duration <= 0)
          return alert("Please enter a valid duration.");
        if (!intensityEl) return alert("Please select an intensity level.");

        // Use override if provided, otherwise use MET calculation
        let calories;
        if (overrideCals && Number(overrideCals) > 0) {
          calories = Number(overrideCals);
        } else {
          calories = calculateBurn(
            exerciseEl.value,
            intensityEl.value,
            Number(duration),
          );
        }

        try {
          const res = await fetch("/api/exercise", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              exercise_type: exerciseEl.value,
              duration_min: Number(duration),
              distance_km: distance ? Number(distance) : null,
              calories_burned: calories,
            }),
          });

          if (!res.ok) {
            const data = await res.json();
            return alert(data.error || "Failed to save exercise.");
          }

          // Reset the form
          exerciseEl.checked = false;
          intensityEl.checked = false;
          document.getElementById("duration").value = "";
          document.getElementById("distance").value = "";
          document.getElementById("caloriesOverride").value = "";
          document.getElementById("estimatedBurn").textContent = "0 kcal";
          document.getElementById("distanceSection").style.display = "none";

          // Reload the log
          loadExerciseLogs();
        } catch (err) {
          alert("Error saving exercise. Is the server running?");
        }
      }

      // ═══════════════════════════════════════════════════════════════
      //  Delete an exercise entry
      // ═══════════════════════════════════════════════════════════════

      async function deleteExercise(id) {
        try {
          await fetch("/api/exercise/" + id, { method: "DELETE" });
          loadExerciseLogs();
        } catch (err) {
          alert("Error deleting exercise.");
        }
      }

      // ═══════════════════════════════════════════════════════════════
      //  Load today's exercise logs from the server
      // ═══════════════════════════════════════════════════════════════

      async function loadExerciseLogs() {
        try {
          const res = await fetch("/api/exercise");

          if (res.status === 401) {
            // Not logged in — show message
            document.getElementById("exerciseLogList").innerHTML =
              '<div class="empty-state">Please <a href="login.html" style="color:#007bb8; font-weight:700;">log in</a> to track exercises.</div>';
            return;
          }

          const logs = await res.json();

          // Update today's total burn
          const total = logs.reduce(
            (sum, l) => sum + (l.calories_burned || 0),
            0,
          );
          document.getElementById("totalBurn").textContent = total + " kcal";

          const listEl = document.getElementById("exerciseLogList");

          if (logs.length === 0) {
            listEl.innerHTML =
              '<div class="empty-state">No exercise logged yet.</div>';
            return;
          }

          // Build the log entries HTML
          listEl.innerHTML = logs
            .map((log) => {
              // Format the exercise type nicely (e.g. "running" → "Running")
              const typeName =
                log.exercise_type.charAt(0).toUpperCase() +
                log.exercise_type.slice(1);

              // Show distance if it exists
              const distanceText = log.distance_km
                ? `${log.distance_km} km · `
                : "";

              return `
                <div class="log-entry">
                    <div class="entry-left">
                        <span class="meal-tag">${typeName}</span>
                        <span class="entry-desc">${distanceText}${log.duration_min} min</span>
                    </div>
                    <div class="entry-right">
                        <span class="entry-cals">${log.calories_burned} <small>kcal</small></span>
                        <button class="delete-btn" onclick="deleteExercise(${log.exercise_log_id})">&times;</button>
                    </div>
                </div>
            `;
            })
            .join("");
        } catch (err) {
          console.error("Error loading exercises:", err);
        }
      }

      // Load user weight and exercise logs when the page opens
      loadUserWeight();
      loadExerciseLogs();