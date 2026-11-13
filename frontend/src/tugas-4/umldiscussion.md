# UML Diagrams and GUI Discussion: Design Thought Process

This discussion reflects our thought process while designing the UML diagrams and user interface for NullWasted. We treated the diagrams as tools to map out how the system actually works, rather than just academic drawings.

### Thought Process Behind the UML Diagrams

1. **Starting with the big picture:**  
   Before making detailed diagrams, we needed everyone on the same page about how data flows. We mapped out the journey from the moment someone speaks into the phone, through our processing services, and into storage. This gave us a clear overview before splitting the work.

2. **Breaking use cases into clear user stories:**  
   Putting all use cases into one diagram made it cluttered and hard to read. In our discussion, we realized there are three distinct stories: how staff record food, how the store manages listings, and how customers reserve items. Splitting them into three groups made each workflow much easier to follow. We also agreed that food safety checks must always happen automatically, while manual typing is kept as a backup if the kitchen is too loud.

3. **Focusing activities on handling problems:**  
   Instead of only drawing what happens when everything goes right, we used activity diagrams to plan for problems: what happens if the kitchen is too noisy, what happens if food has stayed out too long, what happens if two buyers try to claim the last meal at the same time, or what happens if the internet is slow at the cashier counter.

4. **Preventing order duplication and handling speed:**  
   In our data structure and sequence diagrams, we made sure each order generates only one pickup pass to prevent duplicate claims. We also discussed speed: the voice transcription and preview card need to respond in just a few seconds so staff are not left waiting.

5. **Managing pickup expiration:**  
   We used state diagrams to handle what happens if someone reserves food but never picks it up. After a set time, the reservation automatically cancels and the meal goes back to the feed so someone else can buy it.

### Thought Process Behind the GUI Design

1. **One-hand use for busy staff:**  
   During store closing, staff usually have their hands full carrying trays, boxes, or cleaning equipment. They rarely have two hands free to use a phone. Because of this, we placed all main action buttons (the voice recorder, the publish button, and the scanner) near the bottom of the screen where a thumb can comfortably reach them.

2. **Dark theme for kitchen lighting:**  
   Bright white screens can cause eye strain under harsh kitchen fluorescent lights and drain phone battery quickly during evening shifts. We chose a clean dark theme with clear accent colors: green for safe items, amber for closing timers, and red for warnings.

3. **Keeping screens simple:**  
   We kept the app down to eight essential screens across onboarding, store management, and customer pickup. We wanted zero clutter so new users can navigate without instructions.

4. **Using the phone camera instead of extra hardware:**  
   Small bakeries and cafes do not have budget for specialized barcode scanners. We decided the store cashier can simply use their regular phone camera with a flashlight option to verify customer passes, along with a short text code if the camera cannot read the screen.

### Summary

Focusing on everyday kitchen realities helped us keep both our diagrams and screen designs simple, practical, and grounded in real use.
