# Acceptance Criteria

## Story 2: [Kieran - Track Daily Food Intake to Build Better Diet Habits]

- Given Kieran is logged into the system
  When he records a food item with a calorie value and meal type
  Then the food entry is saved and displayed in his food log

- Given Kieran has logged food items for the day
  When he views his daily intake summary
  Then he can see all logged items and a total calorie count for the day

---

## Story 2: [Leonard - Track Progress Over Time to Improve Physique]

- Given Kieran is loggin a food item
  When required information is missing
  Then the system will prompt him to complete the missing details before continuting

- Given Leonard has logged into the system
  When he records workout or calorie data
  Then the data is stored and added to his health history

- Given Leonard has not logged enough data to form a trend
  When he opens the progress view
  Then the system will tell him to provide more data to display progress

---

## Story 2: [Olivia - Compete With Friends Using Rankings]

- Given Olivia is loggin in and connected with friends
  When she opens the ranking view
  Then she can see a ranked list comparing her progress with her friends

- Given Olivia records a new activity
  When she views the ranking again
  Then the ranking reflects the uploaded progress

- Given Olivia has not added any friends
  When she attemps to view rankings
  Then the system explains that friends must be added before rankings are available.

---