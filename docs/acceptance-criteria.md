Acceptance Criteria


| Story Number  | Classification | Description |
|--------------------|-------------------------|------------------------|
| 2 | FUNCTIONAL | Given Kieran is authenticated, When he records a food item with a calorie value and meal type, Then the food entry is saved to the database and displayed in his daily food log.|
| 2 | FUNCTIONAL | Given Kieran has logged one or more food items for the day, When he views his daily intake summary, Then the system displays all logged items, calculates and displaus a total calorie count for the day.|
| 2 | FUNCTIONAL | Given Kieran attempts to submit a food entry with missing or invalid fields, Then the system prevents submission and will prompt him to complete the missing details before continuting.|
| 2 | FUNCTIONAL | Given Kieran edits or deletes an existing food entry, When the change is confirmed, Then the system updates the daily calorie total accordingly|
| 2 | NON-FUNCTIONAL | The system must save food entries within 1 second under normal network conditions|
| 2 | NON-FUNCTIONAL | Calorie input fields must accept numeric values only and also reject negative value entries|

| Story Number  | Classification | Description |
|--------------------|-------------------------|------------------------|
| 4 | FUNCTIONAL | Given Leonard is authenticated, When he records workout or caloric data, Then the system stores the data in his health history with a timestamp |
| 4 | FUNCTIONAL | Given Leonard has logged data over multiple dates, When he attempts to view the progress view, Then the system displays time-based trends and changes across the selected period|
| 4 | FUNCTIONAL | Given Leonard has selected two specific dates, When he chooses to compare them, Then the system displays metric values for comparison |
| 4 | FUNCTIONAL | Given Leonard has insufficient data to generate a trend, When he accesses the progress view, Then the system displays a message indicating that more data is required.|
| 4 | NON-FUNCTIONAL | Progress graphs must render quickly within 2 seconds|
| 4 | NON-FUNCTIONAL | All stored health data must be encrypted and transmitted via HTTPS|

| Story Number  | Classification | Description |
|--------------------|-------------------------|------------------------|
| 5 | FUNCTIONAL | Given Olivia is authenticated and has accepted friends, When she opens the ranking view, Then the system displays a leaderboard ranking users based on weekly workout counts among accepted friends |
| 5 | FUNCTIONAL | Given Olivia logs a new activity, When she refreshes or reopens the ranking view, Then the leaderboard updates to reflect the new ranking position |
| 5 | FUNCTIONAL | Given two or more users have equal weekly workout counts, When the rankings are calculated, Then the system assigns equal ranking positions or applies a pre-defined tie-breaking rule |
| 5 | FUNCTIONAL | Given Olivia hasn't added any friends, When she attempts to view rankings, Then the system displays a message explaining that rankings require connected friends.|
| 5 | FUNCTIONAL | Given the ranking service is unavailable, When Olivia attempts to access the leaderboard, Then the system displays a temporary service unavailable message without crashing.|
| 5 | NON-FUNCTIONAL | The leaderboard must load within 5 seconds|
| 5 | NON-FUNCTIONAL | Only authenticated and authorised users may access ranking data|
| 5 | NON-FUNCTIONAL | Given two users log workouts simultaneously, When rankings are recalculated, Then the system ensures consistent and accurate leaderboard ordering.|

Given the ranking service is unavailable, When Olivia attempts to access the leaderboard, Then the system displays a temporary service unavailable message without crashing.
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
# Acceptance Criteria Entry 2
## Due to the slight refinements made to the user stories, there need to be some minor changes to the acceptance criteria also categorised some of the criteria into functional and 
non functional


# ## Story 2: Kieran - Track Daily Food Intake to Build Better Diet Habits
- FUNCTIONAL
- Given Kieran is authenticated, When he records a food item with a calorie value and meal type, Then the food entry is saved to the database and displayed in his daily food log.
- Given Kieran has logged one or more food items for the day, When he views his daily intake summary, Then the system displays all logged items, calculates and displaus a total calorie count for the day.
-  Given Kieran attempts to submit a food entry with missing or invalid fields, Then the system prevents submission and will prompt him to complete the missing details before continuting
-  Given Kieran edits or deletes an existing food entry, When the change is confirmed, Then the system updates the daily calorie total accordingly

- NON-FUNCTIONAL 
- The system must save food entries within 1 second under normal network conditions
- Calorie input fields must accept numeric values only and also reject negative value entries

## Story 4: Leonard - Track Progress Over Time to Improve Physique
- FUNCTIONAL
- Given Leonard is authenticated, When he records workout or caloric data, Then the system stores the data in his health history with a timestamp
- Given Leonard has logged data over multiple dates, When he attempts to view the progress view, Then the system displays time-based trends and changes across the selected period
- Given Leonard has selected two specific dates, When he chooses to compare them, Then the system displays metric values for comparison
- Given Leonard has insufficient data to generate a trend, When he accesses the progress view, Then the system displays a message indicating that more data is required.

- NON-FUNCTIONAL
- Progress graphs must render quickly within 2 seconds
- All stored health data must be encrypted and transmitted via HTTPS


## Story 5: Olivia - Compete With Friends Using Rankings
- FUNCTIONAL
- Given Olivia is authenticated and has accepted friends, When she opens the ranking view, Then the system displays a leaderboard ranking users based on weekly workout counts among accepted friends
- Given Olivia logs a new activity, When she refreshes or reopens the ranking view, Then the leaderboard updates to reflect the new ranking position
- Given two or more users have equal weekly workout counts, When the rankings are calculated, Then the system assigns equal ranking positions or applies a pre-defined tie-breaking rule
- Given Olivia hasn't added any friends, When she attempts to view rankings, Then the system displays a message explaining that rankings require connected friends.
- Given the ranking service is unavailable, When Olivia attempts to access the leaderboard, Then the system displays a temporary service unavailable message without crashing.

- NON-FUNCTIONAL
- The leaderboard must load within 5 seconds
- Only authenticated and authorised users may access ranking data
- Given two users log workouts simultaneously, When rankings are recalculated, Then the system ensures consistent and accurate leaderboard ordering.
----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

